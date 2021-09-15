import NodeCache from 'node-cache';
import { ChainId } from '../util/chains';
import { ISubgraphProvider, SubgraphPool } from './subgraph-provider';

const SUBGRAPH_POOL_CACHE = new NodeCache({ stdTTL: 900, useClones: true });
const SUBGRAPH_KEY = (chainId: ChainId) => `${chainId}pools`;

export class CachingSubgraphProvider implements ISubgraphProvider {
  constructor(private chainId: ChainId, protected subgraphProvider: ISubgraphProvider) {}

  public async getPools(): Promise<SubgraphPool[]> {
    const cachedPools = SUBGRAPH_POOL_CACHE.get<SubgraphPool[]>(SUBGRAPH_KEY(this.chainId));

    if (cachedPools) {
      return cachedPools;
    }

    const pools = await this.subgraphProvider.getPools();

    SUBGRAPH_POOL_CACHE.set<SubgraphPool[]>(SUBGRAPH_KEY(this.chainId), pools);

    return pools;
  }
}
