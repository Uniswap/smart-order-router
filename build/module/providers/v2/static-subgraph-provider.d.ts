import { ChainId, Token } from '@uniswap/sdk-core';
import { IV2SubgraphProvider, V2SubgraphPool } from './subgraph-provider';
/**
 * Provider that does not get data from an external source and instead returns
 * a hardcoded list of Subgraph pools.
 *
 * Since the pools are hardcoded, the liquidity/price values are dummys and should not
 * be depended on.
 *
 * Useful for instances where other data sources are unavailable. E.g. subgraph not available.
 *
 * @export
 * @class StaticV2SubgraphProvider
 */
export declare class StaticV2SubgraphProvider implements IV2SubgraphProvider {
    private chainId;
    constructor(chainId: ChainId);
    getPools(tokenIn?: Token, tokenOut?: Token): Promise<V2SubgraphPool[]>;
}
