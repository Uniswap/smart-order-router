import { BaseProvider, JsonRpcProvider } from '@ethersproject/providers';
import DEFAULT_TOKEN_LIST from '@uniswap/default-token-list';
import { TokenList } from '@uniswap/token-lists';
import NodeCache from 'node-cache';

import {
  CachingGasStationProvider,
  CachingTokenListProvider,
  CachingTokenProviderWithFallback,
  CachingV2PoolProvider,
  CachingV2SubgraphProvider,
  CachingV3PoolProvider,
  CachingV3SubgraphProvider,
  EIP1559GasPriceProvider,
  ETHGasStationInfoProvider,
  GasPrice,
  IGasPriceProvider,
  IOnChainQuoteProvider,
  IRouteCachingProvider,
  ISwapRouterProvider,
  ITokenListProvider,
  ITokenProvider,
  ITokenValidatorProvider,
  IV2PoolProvider,
  IV2QuoteProvider,
  IV2SubgraphProvider,
  IV3PoolProvider,
  IV3SubgraphProvider,
  LegacyGasPriceProvider,
  NodeJSCache,
  OnChainGasPriceProvider,
  OnChainQuoteProvider,
  Simulator,
  StaticV2SubgraphProvider,
  StaticV3SubgraphProvider,
  SwapRouterProvider,
  TokenProvider,
  TokenValidatorProvider,
  UniswapMulticallProvider,
  URISubgraphProvider,
  V2PoolProvider,
  V2QuoteProvider,
  V2SubgraphProviderWithFallBacks,
  V3PoolProvider,
  V3SubgraphProviderWithFallBacks
} from '../../providers';
import {
  ArbitrumGasData,
  ArbitrumGasDataProvider,
  IL2GasDataProvider,
  OptimismGasData,
  OptimismGasDataProvider
} from '../../providers/v3/gas-data-provider';
import { ChainId, ID_TO_CHAIN_ID, ID_TO_NETWORK_NAME } from '../../util';
import { UNSUPPORTED_TOKENS } from '../../util/unsupported-tokens';

import { BaseAlphaRouter } from './base-alpha-router';
import { ETH_GAS_STATION_API_URL } from './config';
import { IOnChainGasModelFactory, IV2GasModelFactory, V3HeuristicGasModelFactory } from './gas-models';
import { MixedRouteHeuristicGasModelFactory } from './gas-models/mixedRoute/mixed-route-heuristic-gas-model';
import { V2HeuristicGasModelFactory } from './gas-models/v2/v2-heuristic-gas-model';
import { MixedQuoter, V2Quoter, V3Quoter } from './quoters';

interface AlphaRouterParams {
  chainId: ChainId;
  provider: BaseProvider;
  multicall2Provider?: UniswapMulticallProvider;
  v3SubgraphProvider?: IV3SubgraphProvider;
  v3PoolProvider?: IV3PoolProvider;
  onChainQuoteProvider?: IOnChainQuoteProvider;
  v2SubgraphProvider?: IV2SubgraphProvider;
  v2PoolProvider?: IV2PoolProvider;
  v2QuoteProvider?: IV2QuoteProvider;
  tokenProvider?: ITokenProvider;
  blockedTokenListProvider?: ITokenListProvider;
  tokenValidatorProvider?: ITokenValidatorProvider;
  gasPriceProvider?: IGasPriceProvider;
  v3GasModelFactory?: IOnChainGasModelFactory;
  v2GasModelFactory?: IV2GasModelFactory;
  mixedRouteGasModelFactory?: IOnChainGasModelFactory;
  swapRouterProvider?: ISwapRouterProvider;
  optimismGasDataProvider?: IL2GasDataProvider<OptimismGasData>;
  arbitrumGasDataProvider?: IL2GasDataProvider<ArbitrumGasData>;
  simulator?: Simulator;
  routeCachingProvider?: IRouteCachingProvider;
}

export class AlphaRouter extends BaseAlphaRouter {

  constructor(
    {
      chainId,
      provider,
      multicall2Provider,
      v3SubgraphProvider,
      v3PoolProvider,
      onChainQuoteProvider,
      v2SubgraphProvider,
      v2PoolProvider,
      v2QuoteProvider,
      tokenProvider,
      blockedTokenListProvider,
      tokenValidatorProvider,
      gasPriceProvider,
      v3GasModelFactory,
      v2GasModelFactory,
      mixedRouteGasModelFactory,
      swapRouterProvider,
      optimismGasDataProvider,
      arbitrumGasDataProvider,
      simulator,
      routeCachingProvider
    }: AlphaRouterParams,
  ) {
    multicall2Provider ??= new UniswapMulticallProvider(chainId, provider, 375_000);
    v3PoolProvider ??= new CachingV3PoolProvider(
      chainId,
      new V3PoolProvider(ID_TO_CHAIN_ID(chainId), multicall2Provider),
      new NodeJSCache(new NodeCache({ stdTTL: 360, useClones: false }))
    );

    onChainQuoteProvider ??= AlphaRouter.buildOnChainQuoteProvider(chainId, provider, multicall2Provider);

    v2PoolProvider ??= new CachingV2PoolProvider(
      chainId,
      new V2PoolProvider(chainId, multicall2Provider),
      new NodeJSCache(new NodeCache({ stdTTL: 60, useClones: false }))
    );

    v2QuoteProvider ??= new V2QuoteProvider();

    blockedTokenListProvider ??= new CachingTokenListProvider(
      chainId,
      UNSUPPORTED_TOKENS as TokenList,
      new NodeJSCache(new NodeCache({ stdTTL: 3600, useClones: false }))
    );

    tokenProvider ??= new CachingTokenProviderWithFallback(
      chainId,
      new NodeJSCache(new NodeCache({ stdTTL: 3600, useClones: false })),
      new CachingTokenListProvider(
        chainId,
        DEFAULT_TOKEN_LIST,
        new NodeJSCache(new NodeCache({ stdTTL: 3600, useClones: false }))
      ),
      new TokenProvider(chainId, multicall2Provider)
    );

    const chainName = ID_TO_NETWORK_NAME(chainId);

    v2SubgraphProvider ??= new V2SubgraphProviderWithFallBacks([
      new CachingV2SubgraphProvider(
        chainId,
        new URISubgraphProvider(
          chainId,
          `https://cloudflare-ipfs.com/ipns/api.uniswap.org/v1/pools/v2/${chainName}.json`,
          undefined,
          0
        ),
        new NodeJSCache(new NodeCache({ stdTTL: 300, useClones: false }))
      ),
      new StaticV2SubgraphProvider(chainId),
    ]);

    v3SubgraphProvider ??= new V3SubgraphProviderWithFallBacks([
      new CachingV3SubgraphProvider(
        chainId,
        new URISubgraphProvider(
          chainId,
          `https://cloudflare-ipfs.com/ipns/api.uniswap.org/v1/pools/v3/${chainName}.json`,
          undefined,
          0
        ),
        new NodeJSCache(new NodeCache({ stdTTL: 300, useClones: false }))
      ),
      new StaticV3SubgraphProvider(chainId, v3PoolProvider),
    ]);

    let gasPriceProviderInstance: IGasPriceProvider;
    if (JsonRpcProvider.isProvider(provider)) {
      gasPriceProviderInstance = new OnChainGasPriceProvider(
        chainId,
        new EIP1559GasPriceProvider(provider as JsonRpcProvider),
        new LegacyGasPriceProvider(provider as JsonRpcProvider)
      );
    } else {
      gasPriceProviderInstance = new ETHGasStationInfoProvider(ETH_GAS_STATION_API_URL);
    }

    gasPriceProvider ??= new CachingGasStationProvider(
      chainId,
      gasPriceProviderInstance,
      new NodeJSCache<GasPrice>(
        new NodeCache({ stdTTL: 15, useClones: false })
      )
    );

    v3GasModelFactory ??= new V3HeuristicGasModelFactory();
    v2GasModelFactory ??= new V2HeuristicGasModelFactory();
    mixedRouteGasModelFactory ??= new MixedRouteHeuristicGasModelFactory();

    swapRouterProvider ??= new SwapRouterProvider(multicall2Provider, chainId);

    let l2GasDataProvider: IL2GasDataProvider<OptimismGasData> | IL2GasDataProvider<ArbitrumGasData> | undefined;
    if (chainId === ChainId.OPTIMISM || chainId === ChainId.OPTIMISTIC_KOVAN) {
      l2GasDataProvider = optimismGasDataProvider ?? new OptimismGasDataProvider(chainId, multicall2Provider);
    }
    if (
      chainId === ChainId.ARBITRUM_ONE ||
      chainId === ChainId.ARBITRUM_RINKEBY ||
      chainId === ChainId.ARBITRUM_GOERLI
    ) {
      l2GasDataProvider =
        arbitrumGasDataProvider ??
        new ArbitrumGasDataProvider(chainId, provider);
    }

    if (chainId === ChainId.MAINNET) {
      tokenValidatorProvider ??= new TokenValidatorProvider(
        chainId,
        multicall2Provider,
        new NodeJSCache(new NodeCache({ stdTTL: 30000, useClones: false }))
      );
    }

    // Initialize the Quoters.
    // Quoters are an abstraction encapsulating the business logic of fetching routes and quotes.
    const v2Quoter = new V2Quoter(
      v2SubgraphProvider,
      v2PoolProvider,
      v2QuoteProvider,
      v2GasModelFactory,
      tokenProvider,
      chainId,
      blockedTokenListProvider,
      tokenValidatorProvider
    );

    const v3Quoter = new V3Quoter(
      v3SubgraphProvider,
      v3PoolProvider,
      onChainQuoteProvider,
      tokenProvider,
      chainId,
      blockedTokenListProvider,
      tokenValidatorProvider
    );

    const mixedQuoter = new MixedQuoter(
      v3SubgraphProvider,
      v3PoolProvider,
      v2SubgraphProvider,
      v2PoolProvider,
      onChainQuoteProvider,
      tokenProvider,
      chainId,
      blockedTokenListProvider,
      tokenValidatorProvider
    );

    super({
      chainId,
      provider,
      v3PoolProvider,
      v2PoolProvider,
      gasPriceProvider,
      v3GasModelFactory,
      v2GasModelFactory,
      mixedRouteGasModelFactory,
      l2GasDataProvider,
      swapRouterProvider,
      simulator,
      v2Quoter,
      v3Quoter,
      mixedQuoter,
      routeCachingProvider,
    });
  }

  private static buildOnChainQuoteProvider(
    chainId: ChainId,
    provider: BaseProvider,
    multicall2Provider: UniswapMulticallProvider
  ): IOnChainQuoteProvider {
    switch (chainId) {
      case ChainId.OPTIMISM:
      case ChainId.OPTIMISM_GOERLI:
      case ChainId.OPTIMISTIC_KOVAN:
        return new OnChainQuoteProvider(
          chainId,
          provider,
          multicall2Provider,
          {
            retries: 2,
            minTimeout: 100,
            maxTimeout: 1000,
          },
          {
            multicallChunk: 110,
            gasLimitPerCall: 1_200_000,
            quoteMinSuccessRate: 0.1,
          },
          {
            gasLimitOverride: 3_000_000,
            multicallChunk: 45,
          },
          {
            gasLimitOverride: 3_000_000,
            multicallChunk: 45,
          },
          {
            baseBlockOffset: -10,
            rollback: {
              enabled: true,
              attemptsBeforeRollback: 1,
              rollbackBlockOffset: -10,
            },
          }
        );
      case ChainId.ARBITRUM_ONE:
      case ChainId.ARBITRUM_RINKEBY:
      case ChainId.ARBITRUM_GOERLI:
        return new OnChainQuoteProvider(
          chainId,
          provider,
          multicall2Provider,
          {
            retries: 2,
            minTimeout: 100,
            maxTimeout: 1000,
          },
          {
            multicallChunk: 10,
            gasLimitPerCall: 12_000_000,
            quoteMinSuccessRate: 0.1,
          },
          {
            gasLimitOverride: 30_000_000,
            multicallChunk: 6,
          },
          {
            gasLimitOverride: 30_000_000,
            multicallChunk: 6,
          }
        );
      case ChainId.CELO:
      case ChainId.CELO_ALFAJORES:
        return new OnChainQuoteProvider(
          chainId,
          provider,
          multicall2Provider,
          {
            retries: 2,
            minTimeout: 100,
            maxTimeout: 1000,
          },
          {
            multicallChunk: 10,
            gasLimitPerCall: 5_000_000,
            quoteMinSuccessRate: 0.1,
          },
          {
            gasLimitOverride: 5_000_000,
            multicallChunk: 5,
          },
          {
            gasLimitOverride: 6_250_000,
            multicallChunk: 4,
          }
        );
      default:
        return new OnChainQuoteProvider(
          chainId,
          provider,
          multicall2Provider,
          {
            retries: 2,
            minTimeout: 100,
            maxTimeout: 1000,
          },
          {
            multicallChunk: 210,
            gasLimitPerCall: 705_000,
            quoteMinSuccessRate: 0.15,
          },
          {
            gasLimitOverride: 2_000_000,
            multicallChunk: 70,
          }
        );
    }
  }
}