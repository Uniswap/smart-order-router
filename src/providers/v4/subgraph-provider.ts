import { Protocol } from '@uniswap/router-sdk';
import { ChainId, Currency } from '@uniswap/sdk-core';

import { ProviderConfig } from '../provider';
import { SubgraphProvider } from '../subgraph-provider';

export interface V4SubgraphPool {
  id: string; // v4 pool id is the internal PoolId from pool manager
  feeTier: string;
  tickSpacing: string; // TODO: waiting on v4 subgraph to return tickSpacing
  hooks: string;
  liquidity: string;
  token0: {
    id: string;
  };
  token1: {
    id: string;
  };
  tvlETH: number;
  tvlUSD: number;
}

export type V4RawSubgraphPool = {
  id: string;
  feeTier: string;
  tickSpacing: string; // TODO: waiting on v4 subgraph to return tickSpacing
  hooks: string;
  liquidity: string;
  token0: {
    symbol: string;
    id: string;
  };
  token1: {
    symbol: string;
    id: string;
  };
  totalValueLockedUSD: string;
  totalValueLockedETH: string;
  totalValueLockedUSDUntracked: string;
};

const SUBGRAPH_URL_BY_CHAIN: { [chainId in ChainId]?: string } = {
  [ChainId.SEPOLIA]: '',
};

/**
 * Provider for getting V4 pools from the Subgraph
 *
 * @export
 * @interface IV4SubgraphProvider
 */
export interface IV4SubgraphProvider {
  getPools(
    currencyIn?: Currency,
    currencyOut?: Currency,
    providerConfig?: ProviderConfig
  ): Promise<V4SubgraphPool[]>;
}

export class V4SubgraphProvider
  extends SubgraphProvider<V4RawSubgraphPool, V4SubgraphPool>
  implements IV4SubgraphProvider
{
  constructor(
    chainId: ChainId,
    retries = 2,
    timeout = 30000,
    rollback = true,
    trackedEthThreshold = 0.01,
    untrackedUsdThreshold = Number.MAX_VALUE,
    subgraphUrlOverride?: string
  ) {
    super(
      Protocol.V4,
      chainId,
      retries,
      timeout,
      rollback,
      trackedEthThreshold,
      untrackedUsdThreshold,
      subgraphUrlOverride ?? SUBGRAPH_URL_BY_CHAIN[chainId]
    );
  }

  protected override subgraphQuery(blockNumber?: number): string {
    return `
    query getPools($pageSize: Int!, $id: String) {
      pools(
        first: $pageSize
        ${blockNumber ? `block: { number: ${blockNumber} }` : ``}
          where: { id_gt: $id }
        ) {
          id
          token0 {
            symbol
            id
          }
          token1 {
            symbol
            id
          }
          feeTier
          tickSpacing
          hooks
          liquidity
          totalValueLockedUSD
          totalValueLockedETH
          totalValueLockedUSDUntracked
        }
      }
   `;
  }

  protected override mapSubgraphPool(
    rawPool: V4RawSubgraphPool
  ): V4SubgraphPool {
    return {
      id: rawPool.id,
      feeTier: rawPool.feeTier,
      tickSpacing: rawPool.tickSpacing,
      hooks: rawPool.hooks,
      liquidity: rawPool.liquidity,
      token0: {
        id: rawPool.token0.id,
      },
      token1: {
        id: rawPool.token1.id,
      },
      tvlETH: parseFloat(rawPool.totalValueLockedETH),
      tvlUSD: parseFloat(rawPool.totalValueLockedUSD),
    };
  }
}
