import { ChainId } from '../../util/chains';
import { log } from '../../util/log';
import { IV3SubgraphProvider, V3SubgraphPool } from './subgraph-provider';
import axios from 'axios';

export class V3URISubgraphProvider implements IV3SubgraphProvider {
  constructor(private chainId: ChainId, private uri: string) {}

  public async getPools(): Promise<V3SubgraphPool[]> {
    try {
      const response = await axios.get(this.uri);
      const { data: poolsBuffer, status } = response;

      if (status != 200) {
        log.error(
          { response },
          `Unabled to get pools from ${this.uri}.`
        );

        throw new Error(`Unable to get pools from ${this.uri}`);
      }

      const pools = poolsBuffer as V3SubgraphPool[];

      log.info(
        { uri: this.uri, chain: this.chainId },
        `Got subgraph pools from uri. Num: ${pools.length}`
      );

      return pools;
    } catch (err) {
      log.info(
        { uri: this.uri, chain: this.chainId },
        `Failed to get subgraph pools from uri.`
      );

      throw err;
    }
  }
}
