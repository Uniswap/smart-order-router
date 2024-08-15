import { IV3SubgraphProvider, V3SubgraphPool } from './subgraph-provider';
import {
  SubgraphProviderWithFallBacks
} from '../subgraph-provider-with-fallback';
import { Protocol } from '@uniswap/router-sdk';

/**
 * Provider for getting V3 subgraph pools that falls back to a different provider
 * in the event of failure.
 *
 * @export
 * @class V3SubgraphProviderWithFallBacks
 */
export class V3SubgraphProviderWithFallBacks extends SubgraphProviderWithFallBacks<V3SubgraphPool> implements IV3SubgraphProvider {
  constructor(fallbacks: IV3SubgraphProvider[]) {
    super(fallbacks, Protocol.V3);
  }
}
