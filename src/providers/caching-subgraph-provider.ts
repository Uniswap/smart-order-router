import { Protocol } from '@uniswap/router-sdk';
import { ChainId, Token } from '@uniswap/sdk-core';

import { SubgraphPool } from '../routers/alpha-router/functions/get-candidate-pools';
import { WRAPPED_NATIVE_CURRENCY } from '../util';

import { ICache } from './cache';
import { ProviderConfig } from './provider';
import {
  ARB_ARBITRUM,
  BTC_BNB,
  BUSD_BNB,
  CELO,
  CEUR_CELO,
  CUSD_CELO,
  DAI_ARBITRUM,
  DAI_AVAX,
  DAI_BNB,
  DAI_CELO,
  DAI_MAINNET,
  DAI_MOONBEAM,
  DAI_OPTIMISM,
  ETH_BNB,
  OP_OPTIMISM,
  USDB_BLAST,
  USDCE_ZKSYNC,
  USDC_ARBITRUM,
  USDC_AVAX,
  USDC_BASE,
  USDC_BNB,
  USDC_MAINNET,
  USDC_MOONBEAM,
  USDC_NATIVE_ARBITRUM,
  USDC_OPTIMISM,
  USDC_POLYGON,
  USDC_ZKSYNC,
  USDT_ARBITRUM,
  USDT_BNB,
  USDT_MAINNET,
  USDT_OPTIMISM,
  WBTC_ARBITRUM,
  WBTC_MAINNET,
  WBTC_MOONBEAM,
  WBTC_OPTIMISM,
  WETH_POLYGON,
  WMATIC_POLYGON,
  WSTETH_MAINNET,
} from './token-provider';
import { V3SubgraphPool } from './v3/subgraph-provider';

type ChainTokenList = {
  readonly [chainId in ChainId]: Token[];
};

export const BASES_TO_CHECK_TRADES_AGAINST: ChainTokenList = {
  [ChainId.MAINNET]: [
    WRAPPED_NATIVE_CURRENCY[ChainId.MAINNET]!,
    DAI_MAINNET,
    USDC_MAINNET,
    USDT_MAINNET,
    WBTC_MAINNET,
    WSTETH_MAINNET,
  ],
  [ChainId.GOERLI]: [WRAPPED_NATIVE_CURRENCY[ChainId.GOERLI]!],
  [ChainId.SEPOLIA]: [WRAPPED_NATIVE_CURRENCY[ChainId.SEPOLIA]!],
  //v2 not deployed on [arbitrum, polygon, celo, gnosis, moonbeam, bnb, avalanche] and their testnets
  [ChainId.OPTIMISM]: [
    WRAPPED_NATIVE_CURRENCY[ChainId.OPTIMISM]!,
    USDC_OPTIMISM,
    DAI_OPTIMISM,
    USDT_OPTIMISM,
    WBTC_OPTIMISM,
    OP_OPTIMISM,
  ],
  [ChainId.ARBITRUM_ONE]: [
    WRAPPED_NATIVE_CURRENCY[ChainId.ARBITRUM_ONE]!,
    WBTC_ARBITRUM,
    DAI_ARBITRUM,
    USDC_ARBITRUM,
    USDC_NATIVE_ARBITRUM,
    USDT_ARBITRUM,
    ARB_ARBITRUM,
  ],
  [ChainId.ARBITRUM_GOERLI]: [],
  [ChainId.ARBITRUM_SEPOLIA]: [],
  [ChainId.OPTIMISM_GOERLI]: [],
  [ChainId.OPTIMISM_SEPOLIA]: [],
  [ChainId.POLYGON]: [USDC_POLYGON, WETH_POLYGON, WMATIC_POLYGON],
  [ChainId.POLYGON_MUMBAI]: [],
  [ChainId.CELO]: [CELO, CUSD_CELO, CEUR_CELO, DAI_CELO],
  [ChainId.CELO_ALFAJORES]: [],
  [ChainId.GNOSIS]: [],
  [ChainId.MOONBEAM]: [
    WRAPPED_NATIVE_CURRENCY[ChainId.MOONBEAM],
    DAI_MOONBEAM,
    USDC_MOONBEAM,
    WBTC_MOONBEAM,
  ],
  [ChainId.BNB]: [
    WRAPPED_NATIVE_CURRENCY[ChainId.BNB],
    BUSD_BNB,
    DAI_BNB,
    USDC_BNB,
    USDT_BNB,
    BTC_BNB,
    ETH_BNB,
  ],
  [ChainId.AVALANCHE]: [
    WRAPPED_NATIVE_CURRENCY[ChainId.AVALANCHE],
    USDC_AVAX,
    DAI_AVAX,
  ],
  [ChainId.BASE_GOERLI]: [],
  [ChainId.BASE]: [WRAPPED_NATIVE_CURRENCY[ChainId.BASE], USDC_BASE],
  [ChainId.ZORA]: [WRAPPED_NATIVE_CURRENCY[ChainId.ZORA]!],
  [ChainId.ZORA_SEPOLIA]: [WRAPPED_NATIVE_CURRENCY[ChainId.ZORA_SEPOLIA]!],
  [ChainId.ROOTSTOCK]: [WRAPPED_NATIVE_CURRENCY[ChainId.ROOTSTOCK]!],
  [ChainId.BLAST]: [WRAPPED_NATIVE_CURRENCY[ChainId.BLAST]!, USDB_BLAST],
  [ChainId.ZKSYNC]: [
    WRAPPED_NATIVE_CURRENCY[ChainId.ZKSYNC]!,
    USDCE_ZKSYNC,
    USDC_ZKSYNC,
  ],
};

export interface IV3SubgraphProvider {
  getPools(
    tokenIn?: Token,
    tokenOut?: Token,
    providerConfig?: ProviderConfig
  ): Promise<V3SubgraphPool[]>;
}

export interface ISubgraphProvider<TSubgraphPool extends SubgraphPool> {
  getPools(
    tokenIn?: Token,
    tokenOut?: Token,
    providerConfig?: ProviderConfig
  ): Promise<TSubgraphPool[]>;
}

export abstract class CachingSubgraphProvider<
  TSubgraphPool extends SubgraphPool
> implements ISubgraphProvider<TSubgraphPool>
{
  private SUBGRAPH_KEY = (chainId: ChainId) =>
    `subgraph-pools-${this.protocol}-${chainId}`;

  /**
   * Creates an instance of CachingV3SubgraphProvider.
   * @param chainId The chain id to use.
   * @param subgraphProvider The provider to use to get the subgraph pools when not in the cache.
   * @param cache Cache instance to hold cached pools.
   * @param protocol Subgraph protocol version
   */
  constructor(
    private chainId: ChainId,
    protected subgraphProvider: ISubgraphProvider<TSubgraphPool>,
    private cache: ICache<TSubgraphPool[]>,
    private protocol: Protocol
  ) {}

  public async getPools(): Promise<TSubgraphPool[]> {
    const cachedPools = await this.cache.get(this.SUBGRAPH_KEY(this.chainId));

    if (cachedPools) {
      return cachedPools;
    }

    const pools = await this.subgraphProvider.getPools();

    await this.cache.set(this.SUBGRAPH_KEY(this.chainId), pools);

    return pools;
  }
}
