import { Protocol } from '@uniswap/router-sdk';
import { Token } from '@uniswap/sdk-core';
import { SubgraphPool } from '../routers/alpha-router/functions/get-candidate-pools';
import { log } from '../util';
import { ProviderConfig } from './provider';
import { ISubgraphProvider } from './subgraph-provider';

export abstract class SubgraphProviderWithFallBacks<
  TSubgraphPool extends SubgraphPool
> implements ISubgraphProvider<TSubgraphPool>
{
  protected constructor(
    private fallbacks: ISubgraphProvider<TSubgraphPool>[],
    private protocol: Protocol
  ) {}

  public async getPools(
    tokenIn?: Token,
    tokenOut?: Token,
    providerConfig?: ProviderConfig
  ): Promise<TSubgraphPool[]> {
    for (let i = 0; i < this.fallbacks.length; i++) {
      const provider = this.fallbacks[i]!;
      try {
        const pools = await provider.getPools(
          tokenIn,
          tokenOut,
          providerConfig
        );
        return pools;
      } catch (err) {
        log.info(
          `Failed to get subgraph pools for ${this.protocol} from fallback #${i}`
        );
      }
    }

    throw new Error('Failed to get subgraph pools from any providers');
  }
}
