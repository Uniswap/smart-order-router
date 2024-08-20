import { ChainId, Currency } from '@uniswap/sdk-core';
import { Pool } from '@uniswap/v4-sdk';
import _ from 'lodash';
import { log, metric, MetricLoggerUnit } from '../../util';
import { ICache } from '../cache';
import { ProviderConfig } from '../provider';
import { IV4PoolProvider, V4PoolAccessor } from './pool-provider';

export class CachingV4PoolProvider implements IV4PoolProvider {
  private POOL_KEY = (
    chainId: ChainId,
    address: string,
    blockNumber?: number
  ) =>
    blockNumber
      ? `pool-${chainId}-${address}-${blockNumber}`
      : `pool-${chainId}-${address}`;

  /**
   * Creates an instance of CachingV4PoolProvider.
   * @param chainId The chain id to use.
   * @param poolProvider The provider to use to get the pools when not in the cache.
   * @param cache Cache instance to hold cached pools.
   */
  constructor(
    protected chainId: ChainId,
    protected poolProvider: IV4PoolProvider,
    private cache: ICache<Pool>
  ) {}

  public async getPools(
    currencyPairs: [Currency, Currency, number, number, string][],
    providerConfig?: ProviderConfig
  ): Promise<V4PoolAccessor> {
    const poolIdSet: Set<string> = new Set<string>();
    const poolsToGetCurrencyPairs: Array<
      [Currency, Currency, number, number, string]
    > = [];
    const poolsToGetIds: string[] = [];
    const poolIdToPool: { [poolId: string]: Pool } = {};
    const blockNumber = await providerConfig?.blockNumber;

    for (const [
      currencyA,
      currencyB,
      feeAmount,
      tickSpacing,
      hooks,
    ] of currencyPairs) {
      const { poolId, currency0, currency1 } = this.getPoolId(
        currencyA,
        currencyB,
        feeAmount,
        tickSpacing,
        hooks
      );

      if (poolIdSet.has(poolId)) {
        continue;
      }

      poolIdSet.add(poolId);

      const cachedPool = await this.cache.get(
        this.POOL_KEY(this.chainId, poolId, blockNumber)
      );
      if (cachedPool) {
        metric.putMetric(
          'V4_INMEMORY_CACHING_POOL_HIT_IN_MEMORY',
          1,
          MetricLoggerUnit.None
        );
        poolIdToPool[poolId] = cachedPool;
        continue;
      }

      metric.putMetric(
        'V4_INMEMORY_CACHING_POOL_MISS_NOT_IN_MEMORY',
        1,
        MetricLoggerUnit.None
      );
      poolsToGetCurrencyPairs.push([
        currency0,
        currency1,
        feeAmount,
        tickSpacing,
        hooks,
      ]);
      poolsToGetIds.push(poolId);
    }

    log.info(
      {
        poolsFound: _.map(
          Object.values(poolIdToPool),
          (p) => `${p.token0.symbol} ${p.token1.symbol} ${p.fee}`
        ),
        poolsToGetTokenPairs: _.map(
          poolsToGetCurrencyPairs,
          (t) => `${t[0].symbol} ${t[1].symbol} ${t[2]}`
        ),
      },
      `Found ${
        Object.keys(poolIdToPool).length
      } V4 pools already in local cache. About to get liquidity and slot0s for ${
        poolsToGetCurrencyPairs.length
      } pools.`
    );

    if (poolsToGetCurrencyPairs.length > 0) {
      const poolAccessor = await this.poolProvider.getPools(
        poolsToGetCurrencyPairs,
        providerConfig
      );
      for (const address of poolsToGetIds) {
        const pool = poolAccessor.getPoolById(address);
        if (pool) {
          poolIdToPool[address] = pool;
          // We don't want to wait for this caching to complete before returning the pools.
          this.cache.set(
            this.POOL_KEY(this.chainId, address, blockNumber),
            pool
          );
        }
      }
    }

    return {
      getPool: (
        currencyA: Currency,
        currencyB: Currency,
        fee: number,
        tickSpacing: number,
        hooks: string
      ) => {
        const { poolId } = this.poolProvider.getPoolId(
          currencyA,
          currencyB,
          fee,
          tickSpacing,
          hooks
        );
        return poolIdToPool[poolId];
      },
      getPoolById: (poolId: string) => poolIdToPool[poolId],
      getAllPools: () => Object.values(poolIdToPool),
    };
  }

  public getPoolId(
    currencyA: Currency,
    currencyB: Currency,
    fee: number,
    tickSpacing: number,
    hooks: string
  ): { poolId: string; currency0: Currency; currency1: Currency } {
    return this.poolProvider.getPoolId(
      currencyA,
      currencyB,
      fee,
      tickSpacing,
      hooks
    );
  }
}
