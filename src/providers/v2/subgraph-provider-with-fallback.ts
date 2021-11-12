import { Token } from '@uniswap/sdk-core';
import { log } from '../../util';
import { ProviderConfig } from '../provider';
import { IV2SubgraphProvider, V2SubgraphPool } from './subgraph-provider';

export class V2SubgraphProviderWithFallBacks implements IV2SubgraphProvider {
  constructor(private fallbacks: IV2SubgraphProvider[]) {}

  public async getPools(
    tokenIn?: Token,
    tokenOut?: Token,
    providerConfig?: ProviderConfig
  ): Promise<V2SubgraphPool[]> {
    for (let i = 0; i < this.fallbacks.length; i++) {
      const provider = this.fallbacks[i]!;
      try {
        return provider.getPools(tokenIn, tokenOut, providerConfig);
      } catch (err) {
        log.info(`Failed to get subgraph pools for V2 from fallback #${i}`);
        continue;
      }
    }

    throw new Error('Failed to get subgraph pools from any providers');
  }
}
