import { Protocol } from '@uniswap/router-sdk';
import { ChainId, Token } from '@uniswap/sdk-core';

import { ProviderConfig } from '../provider';
import { SubgraphProvider } from '../subgraph-provider';


export interface V3SubgraphPool {
  id: string;
  feeTier: string;
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

const SUBGRAPH_URL_BY_CHAIN: { [chainId in ChainId]?: string } = {
  [ChainId.MAINNET]:
    'https://api.thegraph.com/subgraphs/name/uniswap/uniswap-v3',
  [ChainId.OPTIMISM]:
    'https://api.thegraph.com/subgraphs/name/ianlapham/optimism-post-regenesis',
  // todo: add once subgraph is live
  [ChainId.OPTIMISM_SEPOLIA]: '',
  [ChainId.ARBITRUM_ONE]:
    'https://api.thegraph.com/subgraphs/name/ianlapham/arbitrum-minimal',
  // todo: add once subgraph is live
  [ChainId.ARBITRUM_SEPOLIA]: '',
  [ChainId.POLYGON]:
    'https://api.thegraph.com/subgraphs/name/ianlapham/uniswap-v3-polygon',
  [ChainId.CELO]:
    'https://api.thegraph.com/subgraphs/name/jesse-sawa/uniswap-celo',
  [ChainId.GOERLI]:
    'https://api.thegraph.com/subgraphs/name/ianlapham/uniswap-v3-gorli',
  [ChainId.BNB]:
    'https://api.thegraph.com/subgraphs/name/ilyamk/uniswap-v3---bnb-chain',
  [ChainId.AVALANCHE]:
    'https://api.thegraph.com/subgraphs/name/lynnshaoyu/uniswap-v3-avax',
  [ChainId.BASE]:
    'https://api.studio.thegraph.com/query/48211/uniswap-v3-base/version/latest',
  [ChainId.BLAST]:
    'https://gateway-arbitrum.network.thegraph.com/api/0ae45f0bf40ae2e73119b44ccd755967/subgraphs/id/2LHovKznvo8YmKC9ZprPjsYAZDCc4K5q4AYz8s3cnQn1',
};

/**
 * Provider for getting V3 pools from the Subgraph
 *
 * @export
 * @interface IV3SubgraphProvider
 */
export interface IV3SubgraphProvider {
  getPools(
    tokenIn?: Token,
    tokenOut?: Token,
    providerConfig?: ProviderConfig
  ): Promise<V3SubgraphPool[]>;
}

export class V3SubgraphProvider extends SubgraphProvider implements IV3SubgraphProvider {
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
      Protocol.V3,
      chainId,
      retries,
      timeout,
      rollback,
      trackedEthThreshold,
      untrackedUsdThreshold,
      subgraphUrlOverride ?? SUBGRAPH_URL_BY_CHAIN[chainId]);
  }
}
