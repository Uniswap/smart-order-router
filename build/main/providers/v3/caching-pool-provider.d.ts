import { ChainId, Token } from '@uniswap/sdk-core';
import { FeeAmount, Pool } from '@uniswap/v3-sdk';
import { ICache } from './../cache';
import { ProviderConfig } from './../provider';
import { IV3PoolProvider, V3PoolAccessor } from './pool-provider';
/**
 * Provider for getting V3 pools, with functionality for caching the results.
 * Does not cache by block because we compute quotes using the on-chain quoter
 * so do not mind if the liquidity values are out of date.
 *
 * @export
 * @class CachingV3PoolProvider
 */
export declare class CachingV3PoolProvider implements IV3PoolProvider {
    protected chainId: ChainId;
    protected poolProvider: IV3PoolProvider;
    private cache;
    private POOL_KEY;
    /**
     * Creates an instance of CachingV3PoolProvider.
     * @param chainId The chain id to use.
     * @param poolProvider The provider to use to get the pools when not in the cache.
     * @param cache Cache instance to hold cached pools.
     */
    constructor(chainId: ChainId, poolProvider: IV3PoolProvider, cache: ICache<Pool>);
    getPools(tokenPairs: [Token, Token, FeeAmount][], providerConfig?: ProviderConfig): Promise<V3PoolAccessor>;
    getPoolAddress(tokenA: Token, tokenB: Token, feeAmount: FeeAmount): {
        poolAddress: string;
        token0: Token;
        token1: Token;
    };
}
