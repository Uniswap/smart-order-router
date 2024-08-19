import { Protocol } from '@uniswap/router-sdk';
import { ChainId, Token } from '@uniswap/sdk-core';
import { FeeAmount, Pool } from '@uniswap/v3-sdk';

import { CachingPoolProvider } from '../caching-pool-provider';

import { ICache } from './../cache';
import { ProviderConfig } from './../provider';
import {
  IV3PoolProvider,
  V3PoolAccessor,
  V3PoolConstruct
} from './pool-provider';



/**
 * Provider for getting V3 pools, with functionality for caching the results.
 * Does not cache by block because we compute quotes using the on-chain quoter
 * so do not mind if the liquidity values are out of date.
 *
 * @export
 * @class CachingV3PoolProvider
 */
export class CachingV3PoolProvider extends CachingPoolProvider<Token, V3PoolConstruct, V3PoolAccessor> implements IV3PoolProvider {
  /**
   * Creates an instance of CachingV3PoolProvider.
   * @param chainId The chain id to use.
   * @param poolProvider The provider to use to get the pools when not in the cache.
   * @param cache Cache instance to hold cached pools.
   */
  constructor(
    chainId: ChainId,
    private poolProvider: IV3PoolProvider,
    cache: ICache<Pool>
  ) {
    super(Protocol.V3, chainId, cache);
  }

  public getPoolAddress(
    tokenA: Token,
    tokenB: Token,
    feeAmount: FeeAmount
  ): { poolAddress: string; token0: Token; token1: Token } {
    return this.poolProvider.getPoolAddress(tokenA, tokenB, feeAmount);
  }

  protected override getPoolIdentifier(pool: V3PoolConstruct): { poolIdentifier: string, currency0: Token, currency1: Token } {
    const [tokenA, tokenB, feeAmount] = pool;
    const { poolAddress, token0, token1 } =  this.getPoolAddress(tokenA, tokenB, feeAmount);
    return { poolIdentifier: poolAddress, currency0: token0, currency1: token1 };
  }

  protected override async cachePool(poolsToGetIdentifiers: string[], poolsToGetCurrencyPairs: V3PoolConstruct[], poolIdentifierToPool: { [poolIdentifier: string]: Pool }, providerConfig?: ProviderConfig): Promise<void> {
    const poolAccessor = await this.poolProvider.getPools(
      poolsToGetCurrencyPairs,
      providerConfig
    );
    const blockNumber = await providerConfig?.blockNumber;

    for (const poolAddress of poolsToGetIdentifiers) {
      const pool = poolAccessor.getPoolByAddress(poolAddress);
      if (pool) {
        poolIdentifierToPool[poolAddress] = pool;
        // We don't want to wait for this caching to complete before returning the pools.
        this.cache.set(
          this.POOL_KEY(this.protocol, this.chainId, poolAddress, blockNumber),
          pool
        );
      }
    }
  }

  protected override instantiatePoolAccessor(poolIdentifierToPool: { [poolId: string]: Pool }): V3PoolAccessor {
    return {
      getPool: (
        tokenA: Token,
        tokenB: Token,
        feeAmount: FeeAmount
      ): Pool | undefined => {
        const { poolAddress } = this.getPoolAddress(tokenA, tokenB, feeAmount);
        return poolIdentifierToPool[poolAddress];
      },
      getPoolByAddress: (address: string): Pool | undefined =>
        poolIdentifierToPool[address],
      getAllPools: (): Pool[] => Object.values(poolIdentifierToPool),
    };
  }
}
