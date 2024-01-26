import { Token } from '@uniswap/sdk-core';
import { ProviderConfig } from '../provider';
import { IV2SubgraphProvider, V2SubgraphPool } from './subgraph-provider';
/**
 * Provider for getting V2 subgraph pools that falls back to a different provider
 * in the event of failure.
 *
 * @export
 * @class V2SubgraphProviderWithFallBacks
 */
export declare class V2SubgraphProviderWithFallBacks implements IV2SubgraphProvider {
    private fallbacks;
    /**
     * Creates an instance of V2SubgraphProviderWithFallBacks.
     * @param fallbacks Ordered list of `IV2SubgraphProvider` to try to get pools from.
     */
    constructor(fallbacks: IV2SubgraphProvider[]);
    getPools(tokenIn?: Token, tokenOut?: Token, providerConfig?: ProviderConfig): Promise<V2SubgraphPool[]>;
}
