import { JsonRpcProvider } from '@ethersproject/providers';
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
  ETHGasStationInfoProvider, GasPrice,
  IGasPriceProvider,
  LegacyGasPriceProvider,
  NodeJSCache,
  OnChainGasPriceProvider,
  OnChainQuoteProvider,
  StaticV2SubgraphProvider,
  StaticV3SubgraphProvider, SwapRouterProvider,
  TokenProvider, TokenValidatorProvider,
  UniswapMulticallProvider,
  URISubgraphProvider,
  V2PoolProvider,
  V2QuoteProvider,
  V2SubgraphProviderWithFallBacks,
  V3PoolProvider,
  V3SubgraphProviderWithFallBacks
} from '../../providers';
import { ArbitrumGasDataProvider, OptimismGasDataProvider } from '../../providers/v3/gas-data-provider';
import { ChainId, ID_TO_CHAIN_ID, ID_TO_NETWORK_NAME } from '../../util';
import { UNSUPPORTED_TOKENS } from '../../util/unsupported-tokens';
import { AlphaRouterParams } from './alpha-router';
import { ETH_GAS_STATION_API_URL } from './config';
import { V3HeuristicGasModelFactory } from './gas-models';
import { MixedRouteHeuristicGasModelFactory } from './gas-models/mixedRoute/mixed-route-heuristic-gas-model';
import { V2HeuristicGasModelFactory } from './gas-models/v2/v2-heuristic-gas-model';
import { MixedQuoter, V2Quoter, V3Quoter } from './quoters';

constructor({
  chainId,
  provider,
  multicall2Provider,
  v3PoolProvider,
  onChainQuoteProvider,
  v2PoolProvider,
  v2QuoteProvider,
  v2SubgraphProvider,
  tokenProvider,
  blockedTokenListProvider,
  v3SubgraphProvider,
  gasPriceProvider,
  v3GasModelFactory,
  v2GasModelFactory,
  mixedRouteGasModelFactory,
  swapRouterProvider,
  optimismGasDataProvider,
  tokenValidatorProvider,
  arbitrumGasDataProvider,
  simulator,
  routeCachingProvider,
}: AlphaRouterParams) {
  this.chainId = chainId;
  this.provider = provider;
  multicall2Provider ??= new UniswapMulticallProvider(chainId, provider, 375_000);

  this.v3PoolProvider =
    v3PoolProvider ??
    new CachingV3PoolProvider(
      this.chainId,
      new V3PoolProvider(ID_TO_CHAIN_ID(chainId), multicall2Provider),
      new NodeJSCache(new NodeCache({ stdTTL: 360, useClones: false }))
    );
  this.simulator = simulator;
  this.routeCachingProvider = routeCachingProvider;

  if (!onChainQuoteProvider) {
    switch (chainId) {
      case ChainId.OPTIMISM:
      case ChainId.OPTIMISM_GOERLI:
      case ChainId.OPTIMISTIC_KOVAN:
        onChainQuoteProvider = new OnChainQuoteProvider(
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
        break;
      case ChainId.ARBITRUM_ONE:
      case ChainId.ARBITRUM_RINKEBY:
      case ChainId.ARBITRUM_GOERLI:
        onChainQuoteProvider = new OnChainQuoteProvider(
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
        break;
      case ChainId.CELO:
      case ChainId.CELO_ALFAJORES:
        onChainQuoteProvider = new OnChainQuoteProvider(
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
        break;
      default:
        onChainQuoteProvider = new OnChainQuoteProvider(
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
        break;
    }
  }

  this.v2PoolProvider =
    v2PoolProvider ??
    new CachingV2PoolProvider(
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
    new StaticV3SubgraphProvider(chainId, this.v3PoolProvider),
  ]);

  let gasPriceProviderInstance: IGasPriceProvider;
  if (JsonRpcProvider.isProvider(this.provider)) {
    gasPriceProviderInstance = new OnChainGasPriceProvider(
      chainId,
      new EIP1559GasPriceProvider(this.provider as JsonRpcProvider),
      new LegacyGasPriceProvider(this.provider as JsonRpcProvider)
    );
  } else {
    gasPriceProviderInstance = new ETHGasStationInfoProvider(ETH_GAS_STATION_API_URL);
  }

  this.gasPriceProvider =
    gasPriceProvider ??
    new CachingGasStationProvider(
      chainId,
      gasPriceProviderInstance,
      new NodeJSCache<GasPrice>(
        new NodeCache({ stdTTL: 15, useClones: false })
      )
    );
  this.v3GasModelFactory =
    v3GasModelFactory ?? new V3HeuristicGasModelFactory();
  this.v2GasModelFactory =
    v2GasModelFactory ?? new V2HeuristicGasModelFactory();
  this.mixedRouteGasModelFactory =
    mixedRouteGasModelFactory ?? new MixedRouteHeuristicGasModelFactory();

  this.swapRouterProvider =
    swapRouterProvider ??
    new SwapRouterProvider(multicall2Provider, this.chainId);

  if (chainId === ChainId.OPTIMISM || chainId === ChainId.OPTIMISTIC_KOVAN) {
    this.l2GasDataProvider =
      optimismGasDataProvider ??
      new OptimismGasDataProvider(chainId, multicall2Provider);
  }
  if (
    chainId === ChainId.ARBITRUM_ONE ||
    chainId === ChainId.ARBITRUM_RINKEBY ||
    chainId === ChainId.ARBITRUM_GOERLI
  ) {
    this.l2GasDataProvider =
      arbitrumGasDataProvider ??
      new ArbitrumGasDataProvider(chainId, this.provider);
  }

  if (this.chainId === ChainId.MAINNET) {
    tokenValidatorProvider ??= new TokenValidatorProvider(
      this.chainId,
      multicall2Provider,
      new NodeJSCache(new NodeCache({ stdTTL: 30000, useClones: false }))
    );
  }

  // Initialize the Quoters.
  // Quoters are an abstraction encapsulating the business logic of fetching routes and quotes.
  this.v2Quoter = new V2Quoter(
    v2SubgraphProvider,
    this.v2PoolProvider,
    v2QuoteProvider,
    this.v2GasModelFactory,
    tokenProvider,
    this.chainId,
    blockedTokenListProvider,
    tokenValidatorProvider
  );

  this.v3Quoter = new V3Quoter(
    v3SubgraphProvider,
    this.v3PoolProvider,
    onChainQuoteProvider,
    tokenProvider,
    this.chainId,
    blockedTokenListProvider,
    tokenValidatorProvider
  );

  this.mixedQuoter = new MixedQuoter(
    v3SubgraphProvider,
    this.v3PoolProvider,
    v2SubgraphProvider,
    this.v2PoolProvider,
    onChainQuoteProvider,
    tokenProvider,
    this.chainId,
    blockedTokenListProvider,
    tokenValidatorProvider
  );
}