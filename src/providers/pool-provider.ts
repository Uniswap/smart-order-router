import { Token } from '@uniswap/sdk-core';
import { computePoolAddress, FeeAmount, Pool } from '@uniswap/v3-sdk';
import { default as AsyncRetry, default as retry } from 'async-retry';
import { BigNumber } from 'ethers';
import _ from 'lodash';
import NodeCache from 'node-cache';
import { IUniswapV3PoolState__factory } from '../types/v3';
import { V3_CORE_FACTORY_ADDRESS } from '../util/addresses';
import { log } from '../util/log';
import { poolToString } from '../util/routes';
import { IMulticallProvider, Result } from './multicall-provider';
import { ProviderConfig } from './provider';

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

export interface IPoolProvider {
  getPools(
    tokenPairs: [Token, Token, FeeAmount][],
    providerConfig?: ProviderConfig
  ): Promise<PoolAccessor>;
  getPoolAddress(
    tokenA: Token,
    tokenB: Token,
    feeAmount: FeeAmount
  ): { poolAddress: string; token0: Token; token1: Token };
}

export type PoolAccessor = {
  getPool: (
    tokenA: Token,
    tokenB: Token,
    feeAmount: FeeAmount
  ) => Pool | undefined;
  getPoolByAddress: (address: string) => Pool | undefined;
  getAllPools: () => Pool[];
};

export type PoolRetryOptions = AsyncRetry.Options;

// Computing pool addresses is slow as it requires hashing, encoding etc.
// Addresses never change so can always be cached.
const POOL_ADDRESS_CACHE = new NodeCache({ stdTTL: 3600, useClones: false });
export class PoolProvider implements IPoolProvider {
  constructor(
    protected multicall2Provider: IMulticallProvider,
    protected retryOptions: PoolRetryOptions = {
      retries: 2,
      minTimeout: 50,
      maxTimeout: 500,
    }
  ) {}

  public async getPools(
    tokenPairs: [Token, Token, FeeAmount][],
    providerConfig?: ProviderConfig
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

    log.debug(
      `getPools called with ${tokenPairs.length} token pairs. Deduped down to ${poolAddressSet.size}`
    );

    log.info(
      `About to get liquidity and slot0s for ${poolAddressSet.size} pools as of block: ${providerConfig?.blockNumber}.`
    );

    const [slot0Results, liquidityResults] = await Promise.all([
      this.getPoolsData<ISlot0>(sortedPoolAddresses, 'slot0', providerConfig),
      this.getPoolsData<[ILiquidity]>(
        sortedPoolAddresses,
        'liquidity',
        providerConfig
      ),
    ]);

    log.info(
      `Got liquidity and slot0s for ${poolAddressSet.size} pools as of block: ${providerConfig?.blockNumber}.`
    );

    const poolAddressToPool: { [poolAddress: string]: Pool } = {};

    const invalidPools: [Token, Token, FeeAmount][] = [];

    for (let i = 0; i < sortedPoolAddresses.length; i++) {
      const slot0Result = slot0Results[i];
      const liquidityResult = liquidityResults[i];

      // These properties tell us if a pool is valid and initialized or not.
      if (
        !slot0Result?.success ||
        !liquidityResult?.success ||
        slot0Result.result.sqrtPriceX96.eq(0)
      ) {
        const [token0, token1, fee] = sortedTokenPairs[i]!;
        invalidPools.push([token0, token1, fee]);

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

    log.info(
      {
        invalidPools: _.map(
          invalidPools,
          ([token0, token1, fee]) =>
            `${token0.symbol}/${token1.symbol}/${fee / 10000}%`
        ),
      },
      `${invalidPools.length} pools invalid after checking their slot0 and liquidity results. Dropping.`
    );

    const poolStrs = _.map(Object.values(poolAddressToPool), poolToString);

    log.debug({ poolStrs }, `Found ${poolStrs.length} valid pools`);

    return {
      getPool: (
        tokenA: Token,
        tokenB: Token,
        feeAmount: FeeAmount
      ): Pool | undefined => {
        const { poolAddress } = this.getPoolAddress(tokenA, tokenB, feeAmount);
        return poolAddressToPool[poolAddress];
      },
      getPoolByAddress: (address: string): Pool | undefined =>
        poolAddressToPool[address],
      getAllPools: (): Pool[] => Object.values(poolAddressToPool),
    };
  }

  public getPoolAddress(
    tokenA: Token,
    tokenB: Token,
    feeAmount: FeeAmount
  ): { poolAddress: string; token0: Token; token1: Token } {
    const [token0, token1] = tokenA.sortsBefore(tokenB)
      ? [tokenA, tokenB]
      : [tokenB, tokenA];

    const cacheKey = `${token0.address}/${token1.address}/${feeAmount}`;

    const cachedAddress = POOL_ADDRESS_CACHE.get<string>(cacheKey);

    if (cachedAddress) {
      return { poolAddress: cachedAddress, token0, token1 };
    }

    const poolAddress = computePoolAddress({
      factoryAddress: V3_CORE_FACTORY_ADDRESS,
      tokenA: token0,
      tokenB: token1,
      fee: feeAmount,
    });

    POOL_ADDRESS_CACHE.set<string>(cacheKey, poolAddress);

    return { poolAddress, token0, token1 };
  }

  private async getPoolsData<TReturn>(
    poolAddresses: string[],
    functionName: string,
    providerConfig?: ProviderConfig
  ): Promise<Result<TReturn>[]> {
    const { results, blockNumber } = await retry(async () => {
      return this.multicall2Provider.callSameFunctionOnMultipleContracts<
        undefined,
        TReturn
      >({
        addresses: poolAddresses,
        contractInterface: IUniswapV3PoolState__factory.createInterface(),
        functionName: functionName,
        providerConfig,
      });
    }, this.retryOptions);

    log.debug(`Pool data fetched as of block ${blockNumber}`);

    return results;
  }
}
