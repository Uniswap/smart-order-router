import { ProviderConfig } from './provider';
import { Pool, PoolConstruct } from './pool-provider';
import { ChainId, Currency } from '@uniswap/sdk-core';
import { ICache } from './cache';
import { log, metric, MetricLoggerUnit } from '../util';
import { Protocol } from '@uniswap/router-sdk';
import _ from 'lodash';

export abstract class CachingPoolProvider<TCurrency extends Currency, TPoolConstruct extends PoolConstruct<TCurrency>, TPoolAccessor> {
  protected POOL_KEY = (
    protocol: Protocol,
    chainId: ChainId,
    poolIdentifier: string,
    blockNumber?: number
  ) =>
    blockNumber
      ? `pool-${protocol}-${chainId}-${poolIdentifier}-${blockNumber}`
      : `pool-${protocol}-${chainId}-${poolIdentifier}`;

  constructor(
    protected protocol: Protocol,
    protected chainId: ChainId,
    protected cache: ICache<Pool>
  ) {}

  public async getPools(
    poolConstructs: TPoolConstruct[],
    providerConfig?: ProviderConfig
  ): Promise<TPoolAccessor> {
    const poolIdentifierSet: Set<string> = new Set<string>();
    const poolsToGetCurrencyPairs: Array<TPoolConstruct> = [];
    const poolsToGetIdentifiers: string[] = [];
    const poolIdentifierToPool: { [poolIdentifier: string]: Pool } = {};
    const blockNumber = await providerConfig?.blockNumber;

    for (const poolConstruct of poolConstructs) {
      const { poolIdentifier: poolIdentifier, currency0, currency1} = this.getPoolIdentifier(poolConstruct);

      if (poolIdentifierSet.has(poolIdentifier)) {
        continue;
      }

      // It's the easiest way to change the pool construct in place, since we don't know the entire pool construct at compiling time.
      poolConstruct[0] = currency0;
      poolConstruct[1] = currency1;
      poolIdentifierSet.add(poolIdentifier);

      const cachedPool = await this.cache.get(
        this.POOL_KEY(this.protocol, this.chainId, poolIdentifier, blockNumber)
      );
      if (cachedPool) {
        metric.putMetric(
          `${this.protocol}_INMEMORY_CACHING_POOL_HIT_IN_MEMORY`,
          1,
          MetricLoggerUnit.None
        );
        poolIdentifierToPool[poolIdentifier] = cachedPool;
        continue;
      }

      metric.putMetric(
        `${this.protocol}_INMEMORY_CACHING_POOL_MISS_NOT_IN_MEMORY`,
        1,
        MetricLoggerUnit.None
      );
      poolsToGetCurrencyPairs.push(poolConstruct);
      poolsToGetIdentifiers.push(poolIdentifier);
    }

    log.info(
      {
        poolsFound: _.map(
          Object.values(poolIdentifierToPool),
          (p) => `${p.token0.symbol} ${p.token1.symbol} ${p.fee}`
        ),
        poolsToGetTokenPairs: _.map(
          poolsToGetCurrencyPairs,
          (t) => `${t[0].symbol} ${t[1].symbol} ${t[2]}`
        ),
      },
      `Found ${
        Object.keys(poolIdentifierToPool).length
      } ${this.protocol} pools already in local cache. About to get liquidity and slot0s for ${
        poolsToGetCurrencyPairs.length
      } pools.`
    );

    if (poolsToGetIdentifiers.length > 0) {
      this.cachePool(poolsToGetIdentifiers, poolsToGetCurrencyPairs, poolIdentifierToPool, providerConfig);
    }

    return this.instantiatePoolAccessor(poolIdentifierToPool);
  }

  protected abstract getPoolIdentifier(pool: TPoolConstruct): { poolIdentifier: string, currency0: TCurrency, currency1: TCurrency };

  protected abstract cachePool(poolsToGetIdentifiers: string[], poolsToGetCurrencyPairs: TPoolConstruct[], poolIdentifierToPool: { [poolIdentifier: string]: Pool }, providerConfig?: ProviderConfig): void;

  protected abstract instantiatePoolAccessor(poolIdentifierToPool: { [poolId: string]: Pool }): TPoolAccessor;
}
