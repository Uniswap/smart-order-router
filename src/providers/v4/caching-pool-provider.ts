import {
  IV4PoolProvider,
  V4PoolAccessor,
  V4PoolConstruct
} from './pool-provider';
import { ChainId, Currency } from '@uniswap/sdk-core';
import { Pool } from '@uniswap/v4-sdk';
import { ICache } from '../cache';
import { CachingPoolProvider } from '../caching-pool-provider';
import { Protocol } from '@uniswap/router-sdk';
import { ProviderConfig } from '../provider';

export class CachingV4PoolProvider extends CachingPoolProvider<Currency, V4PoolConstruct, V4PoolAccessor> implements IV4PoolProvider {
  /**
   * Creates an instance of CachingV4PoolProvider.
   * @param chainId The chain id to use.
   * @param poolProvider The provider to use to get the pools when not in the cache.
   * @param cache Cache instance to hold cached pools.
   */
  constructor(
    chainId: ChainId,
    private poolProvider: IV4PoolProvider,
    cache: ICache<Pool>
  ) {
    super(Protocol.V4, chainId, cache);
  }

  public getPoolId(
    currencyA: Currency,
    currencyB: Currency,
    fee: number,
    tickSpacing: number,
    hooks: string
  ): { poolId: string; currency0: Currency; currency1: Currency } {
    const { poolId, currency0, currency1 } =  this.poolProvider.getPoolId(currencyA, currencyB, fee, tickSpacing, hooks);
    return { poolId, currency0, currency1 }
  }

  protected override getPoolIdentifier(pool: V4PoolConstruct): { poolIdentifier: string, currency0: Currency, currency1: Currency } {
    const [currencyA, currencyB, fee, tickSpacing, hooks] = pool;
    const { poolId, currency0, currency1 } =  this.getPoolId(currencyA, currencyB, fee, tickSpacing, hooks);
    return { poolIdentifier: poolId, currency0, currency1 };
  }

  protected override async cachePool(poolsToGetIdentifiers: string[], poolsToGetCurrencyPairs: V4PoolConstruct[], poolIdentifierToPool: { [poolIdentifier: string]: Pool }, providerConfig?: ProviderConfig): Promise<void> {
    const poolAccessor = await this.poolProvider.getPools(
      poolsToGetCurrencyPairs,
      providerConfig
    );
    const blockNumber = await providerConfig?.blockNumber;

    for (const poolId of poolsToGetIdentifiers) {
      const pool = poolAccessor.getPoolById(poolId);
      if (pool) {
        poolIdentifierToPool[poolId] = pool;
        // We don't want to wait for this caching to complete before returning the pools.
        this.cache.set(
          this.POOL_KEY(this.protocol, this.chainId, poolId, blockNumber),
          pool
        );
      }
    }
  }

  protected override instantiatePoolAccessor(poolIdentifierToPool: { [poolId: string]: Pool }): V4PoolAccessor {
    return {
      getPool: (currencyA: Currency, currencyB: Currency, fee: number, tickSpacing: number, hooks: string) => {
        const { poolId } = this.poolProvider.getPoolId(currencyA, currencyB, fee, tickSpacing, hooks);
        return poolIdentifierToPool[poolId];
      },
      getPoolById: (poolId: string) => poolIdentifierToPool[poolId],
      getAllPools: () => Object.values(poolIdentifierToPool)
    };
  }
}
