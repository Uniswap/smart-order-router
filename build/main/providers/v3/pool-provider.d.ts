import { ChainId, Token } from '@uniswap/sdk-core';
import { FeeAmount, Pool } from '@uniswap/v3-sdk';
import { Options as RetryOptions } from 'async-retry';
import { IMulticallProvider } from '../multicall-provider';
import { ProviderConfig } from '../provider';
/**
 * Provider or getting V3 pools.
 *
 * @export
 * @interface IV3PoolProvider
 */
export interface IV3PoolProvider {
    /**
     * Gets the specified pools.
     *
     * @param tokenPairs The token pairs and fee amount of the pools to get.
     * @param [providerConfig] The provider config.
     * @returns A pool accessor with methods for accessing the pools.
     */
    getPools(tokenPairs: [Token, Token, FeeAmount][], providerConfig?: ProviderConfig): Promise<V3PoolAccessor>;
    /**
     * Gets the pool address for the specified token pair and fee tier.
     *
     * @param tokenA Token A in the pool.
     * @param tokenB Token B in the pool.
     * @param feeAmount The fee amount of the pool.
     * @returns The pool address and the two tokens.
     */
    getPoolAddress(tokenA: Token, tokenB: Token, feeAmount: FeeAmount): {
        poolAddress: string;
        token0: Token;
        token1: Token;
    };
}
export type V3PoolAccessor = {
    getPool: (tokenA: Token, tokenB: Token, feeAmount: FeeAmount) => Pool | undefined;
    getPoolByAddress: (address: string) => Pool | undefined;
    getAllPools: () => Pool[];
};
export type V3PoolRetryOptions = RetryOptions;
export declare class V3PoolProvider implements IV3PoolProvider {
    protected chainId: ChainId;
    protected multicall2Provider: IMulticallProvider;
    protected retryOptions: V3PoolRetryOptions;
    private POOL_ADDRESS_CACHE;
    /**
     * Creates an instance of V3PoolProvider.
     * @param chainId The chain id to use.
     * @param multicall2Provider The multicall provider to use to get the pools.
     * @param retryOptions The retry options for each call to the multicall.
     */
    constructor(chainId: ChainId, multicall2Provider: IMulticallProvider, retryOptions?: V3PoolRetryOptions);
    getPools(tokenPairs: [Token, Token, FeeAmount][], providerConfig?: ProviderConfig): Promise<V3PoolAccessor>;
    getPoolAddress(tokenA: Token, tokenB: Token, feeAmount: FeeAmount): {
        poolAddress: string;
        token0: Token;
        token1: Token;
    };
    private getPoolsData;
}
