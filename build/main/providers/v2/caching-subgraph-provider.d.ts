import { ChainId } from '@uniswap/sdk-core';
import { ICache } from './../cache';
import { IV2SubgraphProvider, V2SubgraphPool } from './subgraph-provider';
/**
 * Provider for getting V2 pools, with functionality for caching the results.
 *
 * @export
 * @class CachingV2SubgraphProvider
 */
export declare class CachingV2SubgraphProvider implements IV2SubgraphProvider {
    private chainId;
    protected subgraphProvider: IV2SubgraphProvider;
    private cache;
    private SUBGRAPH_KEY;
    /**
     * Creates an instance of CachingV2SubgraphProvider.
     * @param chainId The chain id to use.
     * @param subgraphProvider The provider to use to get the subgraph pools when not in the cache.
     * @param cache Cache instance to hold cached pools.
     */
    constructor(chainId: ChainId, subgraphProvider: IV2SubgraphProvider, cache: ICache<V2SubgraphPool[]>);
    getPools(): Promise<V2SubgraphPool[]>;
}
