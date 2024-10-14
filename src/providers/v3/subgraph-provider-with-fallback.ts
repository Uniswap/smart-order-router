import { Protocol } from '@uniswap/router-sdk';
import { SubgraphProviderWithFallBacks } from '../subgraph-provider-with-fallback';
import { IV3SubgraphProvider, V3SubgraphPool } from './subgraph-provider';

/**
 * Provider for getting V3 subgraph pools that falls back to a different provider
 * in the event of failure.
 *
 * @export
 * @class V3SubgraphProviderWithFallBacks
 */
export class V3SubgraphProviderWithFallBacks
  extends SubgraphProviderWithFallBacks<V3SubgraphPool>
  implements IV3SubgraphProvider
{
  constructor(fallbacks: IV3SubgraphProvider[]) {
    super(fallbacks, Protocol.V3);
  }
}
