import NodeCache from 'node-cache';
import { ISubgraphProvider, SubgraphPool } from './subgraph-provider';

const SUBGRAPH_POOL_CACHE = new NodeCache({ stdTTL: 900, useClones: true });
const SUBGRAPH_KEY = 'pools';

export class CachingSubgraphProvider implements ISubgraphProvider {
  constructor(protected subgraphProvider: ISubgraphProvider) {}

  public async getPools(): Promise<SubgraphPool[]> {
    const cachedPools = SUBGRAPH_POOL_CACHE.get<SubgraphPool[]>(SUBGRAPH_KEY);

    if (cachedPools) {
      return cachedPools;
    }

    const pools = await this.subgraphProvider.getPools();

    SUBGRAPH_POOL_CACHE.set<SubgraphPool[]>(SUBGRAPH_KEY, pools);

    return pools;
  }
}
