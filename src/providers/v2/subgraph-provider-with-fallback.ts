import { Protocol } from '@uniswap/router-sdk';
import { SubgraphProviderWithFallBacks } from '../subgraph-provider-with-fallback';
import { IV2SubgraphProvider, V2SubgraphPool } from './subgraph-provider';

/**
 * Provider for getting V2 subgraph pools that falls back to a different provider
 * in the event of failure.
 *
 * @export
 * @class V2SubgraphProviderWithFallBacks
 */
export class V2SubgraphProviderWithFallBacks
  extends SubgraphProviderWithFallBacks<V2SubgraphPool>
  implements IV2SubgraphProvider
{
  /**
   * Creates an instance of V2SubgraphProviderWithFallBacks.
   * @param fallbacks Ordered list of `IV2SubgraphProvider` to try to get pools from.
   */
  constructor(fallbacks: IV2SubgraphProvider[]) {
    super(fallbacks, Protocol.V2);
  }
}
