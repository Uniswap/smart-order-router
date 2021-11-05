import { ChainId } from '../../util/chains';
import { ICache } from './../cache';
import { IV3SubgraphProvider, V3SubgraphPool } from './subgraph-provider';

export class CachingV3SubgraphProvider implements IV3SubgraphProvider {
  private SUBGRAPH_KEY = (chainId: ChainId) => `subgraph-pools-${chainId}`;

  constructor(private chainId: ChainId, protected subgraphProvider: IV3SubgraphProvider, private cache: ICache<V3SubgraphPool[]>) {}

  public async getPools(): Promise<V3SubgraphPool[]> {
    const cachedPools = await this.cache.get(this.SUBGRAPH_KEY(this.chainId));

    if (cachedPools) {
      return cachedPools;
    }

    const pools = await this.subgraphProvider.getPools();

    await this.cache.set(this.SUBGRAPH_KEY(this.chainId), pools);

    return pools;
  }
}
