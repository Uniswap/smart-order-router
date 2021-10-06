import { Token } from '@uniswap/sdk-core';
import { Pair } from '@uniswap/v2-sdk';
import { default as AsyncRetry, default as retry } from 'async-retry';
import { BigNumber } from 'ethers';
import _ from 'lodash';
import { IUniswapV3PoolState__factory } from '../../types/v3';
import { ChainId, CurrencyAmount } from '../../util';
import { log } from '../../util/log';
import { poolToString } from '../../util/routes';
import { IMulticallProvider, Result } from '../multicall-provider';
import { ProviderConfig } from '../provider';

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

export interface IV2PoolProvider {
  getPools(
    tokenPairs: [Token, Token][],
    providerConfig?: ProviderConfig
  ): Promise<V2PoolAccessor>;
  getPoolAddress(
    tokenA: Token,
    tokenB: Token,
  ): { poolAddress: string; token0: Token; token1: Token };
}

export type V2PoolAccessor = {
  getPool: (
    tokenA: Token,
    tokenB: Token,
  ) => Pair | undefined;
  getPoolByAddress: (address: string) => Pair | undefined;
  getAllPools: () => Pair[];
};

export type PoolRetryOptions = AsyncRetry.Options;

export class V2PoolProvider implements IV2PoolProvider {
  // Computing pool addresses is slow as it requires hashing, encoding etc.
  // Addresses never change so can always be cached.
  private POOL_ADDRESS_CACHE: { [key: string]: string } = {};

  constructor(
    protected chainId: ChainId,
    protected multicall2Provider: IMulticallProvider,
    protected retryOptions: PoolRetryOptions = {
      retries: 2,
      minTimeout: 50,
      maxTimeout: 500,
    },
  ) {}

  public async getPools(
    tokenPairs: [Token, Token][],
    providerConfig?: ProviderConfig
  ): Promise<V2PoolAccessor> {
    const poolAddressSet: Set<string> = new Set<string>();
    const sortedTokenPairs: Array<[Token, Token]> = [];
    const sortedPoolAddresses: string[] = [];

    for (let tokenPair of tokenPairs) {
      const [tokenA, tokenB] = tokenPair;

      const { poolAddress, token0, token1 } = this.getPoolAddress(
        tokenA,
        tokenB,
      );

      if (poolAddressSet.has(poolAddress)) {
        continue;
      }

      poolAddressSet.add(poolAddress);
      sortedTokenPairs.push([token0, token1]);
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

    const poolAddressToPool: { [poolAddress: string]: Pair } = {};

    const invalidPools: [Token, Token][] = [];

    for (let i = 0; i < sortedPoolAddresses.length; i++) {
      const slot0Result = slot0Results[i];
      const liquidityResult = liquidityResults[i];

      // These properties tell us if a pool is valid and initialized or not.
      if (
        !slot0Result?.success ||
        !liquidityResult?.success ||
        slot0Result.result.sqrtPriceX96.eq(0)
      ) {
        const [token0, token1] = sortedTokenPairs[i]!;
        invalidPools.push([token0, token1]);

        continue;
      }

      const [token0, token1] = sortedTokenPairs[i]!;

      const pool = new Pair(
        CurrencyAmount.fromRawAmount(token0, 0),
        CurrencyAmount.fromRawAmount(token1, 0),
      );

      const poolAddress = sortedPoolAddresses[i]!;

      poolAddressToPool[poolAddress] = pool;
    }

    log.info(
      {
        invalidPools: _.map(
          invalidPools,
          ([token0, token1]) =>
            `${token0.symbol}/${token1.symbol}`
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
      ): Pair | undefined => {
        const { poolAddress } = this.getPoolAddress(tokenA, tokenB);
        return poolAddressToPool[poolAddress];
      },
      getPoolByAddress: (address: string): Pair | undefined =>
        poolAddressToPool[address],
      getAllPools: (): Pair[] => Object.values(poolAddressToPool),
    };
  }

  public getPoolAddress(
    tokenA: Token,
    tokenB: Token,
  ): { poolAddress: string; token0: Token; token1: Token } {
    const [token0, token1] = tokenA.sortsBefore(tokenB)
      ? [tokenA, tokenB]
      : [tokenB, tokenA];

    const cacheKey = `${this.chainId}/${token0.address}/${token1.address}`;

    const cachedAddress = this.POOL_ADDRESS_CACHE[cacheKey];

    if (cachedAddress) {
      return { poolAddress: cachedAddress, token0, token1 };
    }

    const poolAddress = Pair.getAddress(token0, token1);

    this.POOL_ADDRESS_CACHE[cacheKey] = poolAddress;

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
