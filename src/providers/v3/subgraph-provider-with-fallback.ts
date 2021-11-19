import { Token } from '@uniswap/sdk-core';
import { log } from '../../util';
import { ProviderConfig } from '../provider';
import { IV3SubgraphProvider, V3SubgraphPool } from './subgraph-provider';

export class V3SubgraphProviderWithFallBacks implements IV3SubgraphProvider {
  constructor(private fallbacks: IV3SubgraphProvider[]) {}

  public async getPools(
    tokenIn?: Token,
    tokenOut?: Token,
    providerConfig?: ProviderConfig
  ): Promise<V3SubgraphPool[]> {
    for (let i = 0; i < this.fallbacks.length; i++) {
      const provider = this.fallbacks[i]!;
      try {
        return provider.getPools(tokenIn, tokenOut, providerConfig);
      } catch (err) {
        log.info(`Failed to get subgraph pools for V3 from fallback #${i}`);
        continue;
      }
    }

    throw new Error('Failed to get subgraph pools from any providers');
  }
}
