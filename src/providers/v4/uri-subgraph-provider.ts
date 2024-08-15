import { URISubgraphProvider } from '../uri-subgraph-provider';
import { IV4SubgraphProvider, V4SubgraphPool } from './subgraph-provider';

export class V4URISubgraphProvider
  extends URISubgraphProvider<V4SubgraphPool>
  implements IV4SubgraphProvider {}
