import { ChainId } from '@uniswap/sdk-core';
import { ICache } from './../cache';
import { IV3SubgraphProvider, V3SubgraphPool } from './subgraph-provider';
/**
 * Provider for getting V3 pools, with functionality for caching the results.
 *
 * @export
 * @class CachingV3SubgraphProvider
 */
export declare class CachingV3SubgraphProvider implements IV3SubgraphProvider {
    private chainId;
    protected subgraphProvider: IV3SubgraphProvider;
    private cache;
    private SUBGRAPH_KEY;
    /**
     * Creates an instance of CachingV3SubgraphProvider.
     * @param chainId The chain id to use.
     * @param subgraphProvider The provider to use to get the subgraph pools when not in the cache.
     * @param cache Cache instance to hold cached pools.
     */
    constructor(chainId: ChainId, subgraphProvider: IV3SubgraphProvider, cache: ICache<V3SubgraphPool[]>);
    getPools(): Promise<V3SubgraphPool[]>;
}
