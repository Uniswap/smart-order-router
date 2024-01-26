import { ChainId, Token } from '@uniswap/sdk-core';
import { ProviderConfig } from '../provider';
import { IV3PoolProvider } from './pool-provider';
import { IV3SubgraphProvider, V3SubgraphPool } from './subgraph-provider';
/**
 * Provider that uses a hardcoded list of V3 pools to generate a list of subgraph pools.
 *
 * Since the pools are hardcoded and the data does not come from the Subgraph, the TVL values
 * are dummys and should not be depended on.
 *
 * Useful for instances where other data sources are unavailable. E.g. Subgraph not available.
 *
 * @export
 * @class StaticV3SubgraphProvider
 */
export declare class StaticV3SubgraphProvider implements IV3SubgraphProvider {
    private chainId;
    private poolProvider;
    constructor(chainId: ChainId, poolProvider: IV3PoolProvider);
    getPools(tokenIn?: Token, tokenOut?: Token, providerConfig?: ProviderConfig): Promise<V3SubgraphPool[]>;
}
