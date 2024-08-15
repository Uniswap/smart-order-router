import { Protocol } from '@uniswap/router-sdk';
import { SubgraphProviderWithFallBacks } from '../subgraph-provider-with-fallback';
import { IV4SubgraphProvider, V4SubgraphPool } from './subgraph-provider';

export class V4SubgraphProviderWithFallBacks
  extends SubgraphProviderWithFallBacks<V4SubgraphPool>
  implements IV4SubgraphProvider
{
  constructor(fallbacks: IV4SubgraphProvider[]) {
    super(fallbacks, Protocol.V4);
  }
}
