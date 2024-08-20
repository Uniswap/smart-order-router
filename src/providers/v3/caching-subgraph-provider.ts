import { ChainId } from '@uniswap/sdk-core';

import { Protocol } from '@uniswap/router-sdk';
import { CachingSubgraphProvider } from '../caching-subgraph-provider';
import { ICache } from './../cache';
import { IV3SubgraphProvider, V3SubgraphPool } from './subgraph-provider';

/**
 * Provider for getting V3 pools, with functionality for caching the results.
 *
 * @export
 * @class CachingV3SubgraphProvider
 */
export class CachingV3SubgraphProvider
  extends CachingSubgraphProvider<V3SubgraphPool>
  implements IV3SubgraphProvider
{
  /**
   * Creates an instance of CachingV3SubgraphProvider.
   * @param chainId The chain id to use.
   * @param subgraphProvider The provider to use to get the subgraph pools when not in the cache.
   * @param cache Cache instance to hold cached pools.
   */
  constructor(
    chainId: ChainId,
    subgraphProvider: IV3SubgraphProvider,
    cache: ICache<V3SubgraphPool[]>
  ) {
    super(chainId, subgraphProvider, cache, Protocol.V3);
  }
}
