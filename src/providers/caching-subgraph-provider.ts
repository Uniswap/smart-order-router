import { ChainId } from '../util/chains';
import { ICache } from './cache';
import { ISubgraphProvider, SubgraphPool } from './subgraph-provider';

export class CachingSubgraphProvider implements ISubgraphProvider {
  private SUBGRAPH_KEY = (chainId: ChainId) => `subgraph-pools-${chainId}`;

  constructor(private chainId: ChainId, protected subgraphProvider: ISubgraphProvider, private cache: ICache<SubgraphPool[]>) {}

  public async getPools(): Promise<SubgraphPool[]> {
    const cachedPools = await this.cache.get(this.SUBGRAPH_KEY(this.chainId));

    if (cachedPools) {
      return cachedPools;
    }

    const pools = await this.subgraphProvider.getPools();

    await this.cache.set(this.SUBGRAPH_KEY(this.chainId), pools);

    return pools;
  }
}
