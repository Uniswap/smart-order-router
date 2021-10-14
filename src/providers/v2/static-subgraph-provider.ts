import _ from 'lodash';
import fs from 'fs';
import { IV2SubgraphProvider, V2SubgraphPool } from './subgraph-provider';

export class V2StaticSubgraphProvider implements IV2SubgraphProvider {
  constructor() {}

  public async getPools(): Promise<V2SubgraphPool[]> {
    const poolsSanitized = JSON.parse(fs.readFileSync('./v2pools.json', 'utf8')) as V2SubgraphPool[];

    return poolsSanitized;
  }

}
