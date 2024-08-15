import { Protocol } from '@uniswap/router-sdk';
import { ChainId } from '@uniswap/sdk-core';
import { ICache } from '../cache';
import { CachingSubgraphProvider } from '../caching-subgraph-provider';
import { IV4SubgraphProvider, V4SubgraphPool } from './subgraph-provider';

/**
 * Provider for getting V4 pools, with functionality for caching the results.
 *
 * @export
 * @class CachingV4SubgraphProvider
 */
export class CachingV4SubgraphProvider
  extends CachingSubgraphProvider<V4SubgraphPool>
  implements IV4SubgraphProvider
{
  /**
   * Creates an instance of CachingV3SubgraphProvider.
   * @param chainId The chain id to use.
   * @param subgraphProvider The provider to use to get the subgraph pools when not in the cache.
   * @param cache Cache instance to hold cached pools.
   */
  constructor(
    chainId: ChainId,
    subgraphProvider: IV4SubgraphProvider,
    cache: ICache<V4SubgraphPool[]>
  ) {
    super(chainId, subgraphProvider, cache, Protocol.V4);
  }
}
