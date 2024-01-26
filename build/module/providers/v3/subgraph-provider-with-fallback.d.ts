import { Token } from '@uniswap/sdk-core';
import { ProviderConfig } from '../provider';
import { IV3SubgraphProvider, V3SubgraphPool } from './subgraph-provider';
/**
 * Provider for getting V3 subgraph pools that falls back to a different provider
 * in the event of failure.
 *
 * @export
 * @class V3SubgraphProviderWithFallBacks
 */
export declare class V3SubgraphProviderWithFallBacks implements IV3SubgraphProvider {
    private fallbacks;
    constructor(fallbacks: IV3SubgraphProvider[]);
    getPools(tokenIn?: Token, tokenOut?: Token, providerConfig?: ProviderConfig): Promise<V3SubgraphPool[]>;
}
