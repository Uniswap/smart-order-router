import { Token } from '@uniswap/sdk-core';
import { computePoolAddress, FeeAmount, Pool } from '@uniswap/v3-sdk';
import Logger from 'bunyan';
import { BigNumber } from 'ethers';
import _ from 'lodash';
import { IUniswapV3PoolState__factory } from '../types/v3';
import { V3_CORE_FACTORY_ADDRESS } from '../util/addresses';
import { poolToString } from '../util/routes';
import { Multicall2Provider, Result } from './multicall2-provider';

type ISlot0 = {
  sqrtPriceX96: BigNumber;
  tick: number;
  observationIndex: number;
  observationCardinality: number;
  observationCardinalityNext: number;
  feeProtocol: number;
  unlocked: boolean;
};

type ILiquidity = { liquidity: BigNumber };

type PoolAccessor = {
  getPool: (
    tokenA: Token,
    tokenB: Token,
    feeAmount: FeeAmount
  ) => Pool | undefined;
  getAllPools: () => Pool[];
};

export class PoolProvider {
  constructor(
    private multicall2Provider: Multicall2Provider,
    private log: Logger
  ) {}

  public async getPools(
    tokenPairs: [Token, Token, FeeAmount][]
  ): Promise<PoolAccessor> {
    const poolAddressSet: Set<string> = new Set<string>();
    const sortedTokenPairs: Array<[Token, Token, FeeAmount]> = [];
    const sortedPoolAddresses: string[] = [];

    for (let tokenPair of tokenPairs) {
      const [tokenA, tokenB, feeAmount] = tokenPair;

      const { poolAddress, token0, token1 } = this.getPoolAddress(
        tokenA,
        tokenB,
        feeAmount
      );

      if (poolAddressSet.has(poolAddress)) {
        continue;
      }

      poolAddressSet.add(poolAddress);
      sortedTokenPairs.push([token0, token1, feeAmount]);
      sortedPoolAddresses.push(poolAddress);
    }

    this.log.debug(
      `getPools called with ${tokenPairs.length} token pairs. Deduped down to ${poolAddressSet.size}`
    );

    const slot0Results = await this.getPoolsData<ISlot0>(
      sortedPoolAddresses,
      'slot0'
    );

    this.log.debug(
      { slot0Results },
      `Got slot0s for ${poolAddressSet.size} pools.`
    );

    const liquidityResults = await this.getPoolsData<[ILiquidity]>(
      sortedPoolAddresses,
      'liquidity'
    );

    this.log.debug(
      { liquidityResults },
      `Got liquidity for ${poolAddressSet.size} pools.`
    );

    const poolAddressToPool: { [poolAddress: string]: Pool } = {};

    for (let i = 0; i < sortedPoolAddresses.length; i++) {
      const slot0Result = slot0Results[i];
      const liquidityResult = liquidityResults[i];
      if (
        !slot0Result?.success ||
        !liquidityResult?.success ||
        slot0Result.result.sqrtPriceX96.eq(0)
      ) {
        const [token0, token1, fee] = sortedTokenPairs[i]!;
        this.log.debug(
          `No valid pool for ${token0.symbol}/${token1.symbol}/${fee / 10000}%`
        );
        continue;
      }

      const [token0, token1, fee] = sortedTokenPairs[i]!;
      const slot0 = slot0Result.result;
      const liquidity = liquidityResult.result[0];

      const pool = new Pool(
        token0,
        token1,
        fee,
        slot0.sqrtPriceX96.toString(),
        liquidity.toString(),
        slot0.tick
      );

      const poolAddress = sortedPoolAddresses[i]!;

      poolAddressToPool[poolAddress] = pool;
    }

    const poolStrs = _.map(Object.values(poolAddressToPool), poolToString);

    this.log.debug({ poolStrs }, `Found ${poolStrs.length} valid pools`);

    return {
      getPool: (
        tokenA: Token,
        tokenB: Token,
        feeAmount: FeeAmount
      ): Pool | undefined => {
        const { poolAddress } = this.getPoolAddress(tokenA, tokenB, feeAmount);
        return poolAddressToPool[poolAddress];
      },
      getAllPools: (): Pool[] => Object.values(poolAddressToPool),
    };
  }

  private getPoolAddress(
    tokenA: Token,
    tokenB: Token,
    feeAmount: FeeAmount
  ): { poolAddress: string; token0: Token; token1: Token } {
    const [token0, token1] = tokenA.sortsBefore(tokenB)
      ? [tokenA, tokenB]
      : [tokenB, tokenA];

    const poolAddress = computePoolAddress({
      factoryAddress: V3_CORE_FACTORY_ADDRESS,
      tokenA: token0,
      tokenB: token1,
      fee: feeAmount,
    });

    return { poolAddress, token0, token1 };
  }

  private async getPoolsData<TReturn>(
    poolAddresses: string[],
    functionName: string
  ): Promise<Result<TReturn>[]> {
    const {
      results,
      blockNumber,
    } = await this.multicall2Provider.callSameFunctionOnMultipleContracts<
      undefined,
      TReturn
    >({
      addresses: poolAddresses,
      contractInterface: IUniswapV3PoolState__factory.createInterface(),
      functionName: functionName,
    });

    this.log.debug(`Pool data fetched as of block ${blockNumber}`);

    return results;
  }
}
