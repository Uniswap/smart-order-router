import { Protocol } from '@uniswap/router-sdk';
import { ChainId, Currency, Token } from '@uniswap/sdk-core';

import { SubgraphPool } from '../routers/alpha-router/functions/get-candidate-pools';
import { nativeOnChain } from '../util';

import { ICache } from './cache';
import { ProviderConfig } from './provider';
import {
  ARB_ARBITRUM,
  BTC_BNB,
  BUSD_BNB,
  CELO,
  CEUR_CELO,
  CUSD_CELO,
  ETH_BNB,
  OP_OPTIMISM,
  USDB_BLAST,
  USDCE_ZKSYNC,
  USDC_NATIVE_ARBITRUM,
  USDC_ZKSYNC,
  WBTC_ARBITRUM,
  WBTC_MAINNET,
  WBTC_MOONBEAM,
  WBTC_OPTIMISM,
  WBTC_WORLDCHAIN,
  WETH_POLYGON,
  WLD_WORLDCHAIN,
  WMATIC_POLYGON,
  WSTETH_MAINNET,
  USDC_ON,
  USDT_ON,
  DAI_ON,
  WNATIVE_ON,
} from './token-provider';
import { V3SubgraphPool } from './v3/subgraph-provider';

type ChainTokenList = {
  readonly [chainId in ChainId]: Currency[];
};

export const BASES_TO_CHECK_TRADES_AGAINST: ChainTokenList = {
  [ChainId.MAINNET]: [
    nativeOnChain(ChainId.MAINNET),
    WNATIVE_ON(ChainId.MAINNET),
    DAI_ON(ChainId.MAINNET),
    USDC_ON(ChainId.MAINNET),
    USDT_ON(ChainId.MAINNET),
    WBTC_MAINNET,
    WSTETH_MAINNET,
  ],
  [ChainId.GOERLI]: [
    WNATIVE_ON(ChainId.GOERLI)
  ],
  [ChainId.SEPOLIA]: [
    nativeOnChain(ChainId.SEPOLIA),
    WNATIVE_ON(ChainId.SEPOLIA),
  ],
  //v2 not deployed on [arbitrum, polygon, celo, gnosis, moonbeam, bnb, avalanche] and their testnets
  [ChainId.OPTIMISM]: [
    nativeOnChain(ChainId.OPTIMISM),
    WNATIVE_ON(ChainId.OPTIMISM),
    USDC_ON(ChainId.OPTIMISM),
    DAI_ON(ChainId.OPTIMISM),
    USDT_ON(ChainId.OPTIMISM),
    WBTC_OPTIMISM,
    OP_OPTIMISM,
  ],
  [ChainId.ARBITRUM_ONE]: [
    nativeOnChain(ChainId.ARBITRUM_ONE),
    WNATIVE_ON(ChainId.ARBITRUM_ONE),
    WBTC_ARBITRUM,
    DAI_ON(ChainId.ARBITRUM_ONE),
    USDC_ON(ChainId.ARBITRUM_ONE),
    USDC_NATIVE_ARBITRUM,
    USDT_ON(ChainId.ARBITRUM_ONE),
    ARB_ARBITRUM,
  ],
  [ChainId.ARBITRUM_GOERLI]: [],
  [ChainId.ARBITRUM_SEPOLIA]: [
    nativeOnChain(ChainId.ARBITRUM_SEPOLIA),
    WNATIVE_ON(ChainId.ARBITRUM_SEPOLIA),
    USDC_ON(ChainId.ARBITRUM_SEPOLIA),
    DAI_ON(ChainId.ARBITRUM_SEPOLIA),
  ],
  [ChainId.OPTIMISM_GOERLI]: [],
  [ChainId.OPTIMISM_SEPOLIA]: [],
  [ChainId.POLYGON]: [
    nativeOnChain(ChainId.POLYGON),
    USDC_ON(ChainId.POLYGON),
    WETH_POLYGON,
    WMATIC_POLYGON,
  ],
  [ChainId.POLYGON_MUMBAI]: [],
  [ChainId.CELO]: [
    CELO,
    CUSD_CELO,
    CEUR_CELO,
    DAI_ON(ChainId.CELO),
  ],
  [ChainId.CELO_ALFAJORES]: [],
  [ChainId.GNOSIS]: [],
  [ChainId.MOONBEAM]: [
    WNATIVE_ON(ChainId.MOONBEAM),
    DAI_ON(ChainId.MOONBEAM),
    USDC_ON(ChainId.MOONBEAM),
    WBTC_MOONBEAM,
  ],
  [ChainId.BNB]: [
    nativeOnChain(ChainId.BNB),
    WNATIVE_ON(ChainId.BNB),
    BUSD_BNB,
    DAI_ON(ChainId.BNB),
    USDC_ON(ChainId.BNB),
    USDT_ON(ChainId.BNB),
    BTC_BNB,
    ETH_BNB,
  ],
  [ChainId.AVALANCHE]: [
    WNATIVE_ON(ChainId.AVALANCHE),
    USDC_ON(ChainId.AVALANCHE),
    DAI_ON(ChainId.AVALANCHE),
  ],
  [ChainId.BASE_GOERLI]: [],
  [ChainId.BASE]: [
    nativeOnChain(ChainId.BASE),
    WNATIVE_ON(ChainId.BASE),
    USDC_ON(ChainId.BASE),
  ],
  [ChainId.ZORA]: [
    nativeOnChain(ChainId.ZORA),
    WNATIVE_ON(ChainId.ZORA),
  ],
  [ChainId.ZORA_SEPOLIA]: [
    WNATIVE_ON(ChainId.ZORA_SEPOLIA),
  ],
  [ChainId.ROOTSTOCK]: [
    WNATIVE_ON(ChainId.ROOTSTOCK),
  ],
  [ChainId.BLAST]: [
    nativeOnChain(ChainId.BLAST),
    WNATIVE_ON(ChainId.BLAST),
    USDB_BLAST,
  ],
  [ChainId.ZKSYNC]: [
    WNATIVE_ON(ChainId.ZKSYNC),
    USDCE_ZKSYNC,
    USDC_ZKSYNC,
  ],
  [ChainId.WORLDCHAIN]: [
    nativeOnChain(ChainId.WORLDCHAIN),
    WNATIVE_ON(ChainId.WORLDCHAIN),
    USDC_ON(ChainId.WORLDCHAIN),
    WLD_WORLDCHAIN,
    WBTC_WORLDCHAIN,
  ],
  [ChainId.UNICHAIN_SEPOLIA]: [
    nativeOnChain(ChainId.UNICHAIN_SEPOLIA),
    WNATIVE_ON(ChainId.UNICHAIN_SEPOLIA),
    USDC_ON(ChainId.UNICHAIN_SEPOLIA),
  ],
  [ChainId.UNICHAIN]: [
    nativeOnChain(ChainId.UNICHAIN),
    WNATIVE_ON(ChainId.UNICHAIN),
    DAI_ON(ChainId.UNICHAIN),
    USDC_ON(ChainId.UNICHAIN),
  ],
  [ChainId.BASE_SEPOLIA]: [
    nativeOnChain(ChainId.BASE_SEPOLIA),
    WNATIVE_ON(ChainId.BASE_SEPOLIA),
    USDC_ON(ChainId.BASE_SEPOLIA),
  ],
  [ChainId.MONAD_TESTNET]: [
    nativeOnChain(ChainId.MONAD_TESTNET),
    WNATIVE_ON(ChainId.MONAD_TESTNET),
    USDT_ON(ChainId.MONAD_TESTNET),
  ],
  [ChainId.SONEIUM]: [
    nativeOnChain(ChainId.SONEIUM),
    WNATIVE_ON(ChainId.SONEIUM),
    USDC_ON(ChainId.SONEIUM),
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
