import { Protocol } from '@uniswap/router-sdk';
import { ChainId, Token } from '@uniswap/sdk-core';

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
    tokenIn?: Token,
    tokenOut?: Token,
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
}
