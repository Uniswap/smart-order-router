import fs from 'fs';
import { IV2SubgraphProvider, V2SubgraphPool } from './subgraph-provider';

/**
 * Temporary until we have V2 IPFS cache.
 */
export class V2StaticSubgraphProvider implements IV2SubgraphProvider {
  constructor() {}

  public async getPools(): Promise<V2SubgraphPool[]> {
    const poolsSanitized = JSON.parse(
      fs.readFileSync('./v2pools.json', 'utf8')
    ) as V2SubgraphPool[];

    return poolsSanitized;
  }
}
