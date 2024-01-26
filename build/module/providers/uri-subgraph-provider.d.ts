import { ChainId } from '@uniswap/sdk-core';
import { V2SubgraphPool } from './v2/subgraph-provider';
import { V3SubgraphPool } from './v3/subgraph-provider';
/**
 * Gets subgraph pools from a URI. The URI shoudl contain a JSON
 * stringified array of V2SubgraphPool objects or V3SubgraphPool
 * objects.
 *
 * @export
 * @class URISubgraphProvider
 * @template TSubgraphPool
 */
export declare class URISubgraphProvider<TSubgraphPool extends V2SubgraphPool | V3SubgraphPool> {
    private chainId;
    private uri;
    private timeout;
    private retries;
    constructor(chainId: ChainId, uri: string, timeout?: number, retries?: number);
    getPools(): Promise<TSubgraphPool[]>;
}
