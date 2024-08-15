import { Protocol } from '@uniswap/router-sdk';
import { ChainId } from '@uniswap/sdk-core';

import { CachingSubgraphProvider } from '../caching-subgraph-provider';

import { ICache } from './../cache';
import { IV2SubgraphProvider, V2SubgraphPool } from './subgraph-provider';

/**
 * Provider for getting V2 pools, with functionality for caching the results.
 *
 * @export
 * @class CachingV2SubgraphProvider
 */
export class CachingV2SubgraphProvider
  extends CachingSubgraphProvider<V2SubgraphPool>
  implements IV2SubgraphProvider
{
  /**
   * Creates an instance of CachingV2SubgraphProvider.
   * @param chainId The chain id to use.
   * @param subgraphProvider The provider to use to get the subgraph pools when not in the cache.
   * @param cache Cache instance to hold cached pools.
   */
  constructor(
    chainId: ChainId,
    subgraphProvider: IV2SubgraphProvider,
    cache: ICache<V2SubgraphPool[]>
  ) {
    super(chainId, subgraphProvider, cache, Protocol.V2);
  }
}
