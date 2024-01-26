import { ChainId, Token } from '@uniswap/sdk-core';
import { Pair } from '@uniswap/v2-sdk';
import { ICache } from './../cache';
import { ProviderConfig } from './../provider';
import { IV2PoolProvider, V2PoolAccessor } from './pool-provider';
/**
 * Provider for getting V2 pools, with functionality for caching the results per block.
 *
 * @export
 * @class CachingV2PoolProvider
 */
export declare class CachingV2PoolProvider implements IV2PoolProvider {
    protected chainId: ChainId;
    protected poolProvider: IV2PoolProvider;
    private cache;
    private POOL_KEY;
    /**
     * Creates an instance of CachingV3PoolProvider.
     * @param chainId The chain id to use.
     * @param poolProvider The provider to use to get the pools when not in the cache.
     * @param cache Cache instance to hold cached pools.
     */
    constructor(chainId: ChainId, poolProvider: IV2PoolProvider, cache: ICache<{
        pair: Pair;
        block?: number;
    }>);
    getPools(tokenPairs: [Token, Token][], providerConfig?: ProviderConfig): Promise<V2PoolAccessor>;
    getPoolAddress(tokenA: Token, tokenB: Token): {
        poolAddress: string;
        token0: Token;
        token1: Token;
    };
}
