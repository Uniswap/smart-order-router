import { BigNumber } from '@ethersproject/bignumber';
import { BaseProvider, JsonRpcProvider } from '@ethersproject/providers';
import DEFAULT_TOKEN_LIST from '@uniswap/default-token-list';
import {
  Protocol,
  SwapRouter,
  TPool as MixedPool,
  Trade,
  ZERO,
} from '@uniswap/router-sdk';
import {
  ChainId,
  Currency,
  Fraction,
  Token,
  TradeType,
} from '@uniswap/sdk-core';
import { TokenList } from '@uniswap/token-lists';
import { UniversalRouterVersion } from '@uniswap/universal-router-sdk';
import { Pair as V2Pool } from '@uniswap/v2-sdk';
import {
  Pool,
  Pool as V3Pool,
  Position,
  SqrtPriceMath,
  TickMath,
} from '@uniswap/v3-sdk';
import { Pool as V4Pool } from '@uniswap/v4-sdk';
import retry from 'async-retry';
import JSBI from 'jsbi';
import _ from 'lodash';
import NodeCache from 'node-cache';

import {
  CachedRoutes,
  CacheMode,
  CachingGasStationProvider,
  CachingTokenProviderWithFallback,
  CachingV2PoolProvider,
  CachingV2SubgraphProvider,
  CachingV3PoolProvider,
  CachingV3SubgraphProvider,
  CachingV4SubgraphProvider,
  EIP1559GasPriceProvider,
  ETHGasStationInfoProvider,
  IOnChainQuoteProvider,
  IRouteCachingProvider,
  ISwapRouterProvider,
  ITokenPropertiesProvider,
  IV2QuoteProvider,
  IV2SubgraphProvider,
  IV4SubgraphProvider,
  LegacyGasPriceProvider,
  NodeJSCache,
  OnChainGasPriceProvider,
  OnChainQuoteProvider,
  SimulationStatus,
  Simulator,
  StaticV2SubgraphProvider,
  StaticV3SubgraphProvider,
  StaticV4SubgraphProvider,
  SwapRouterProvider,
  TokenPropertiesProvider,
  UniswapMulticallProvider,
  URISubgraphProvider,
  V2QuoteProvider,
  V2SubgraphProviderWithFallBacks,
  V3SubgraphProviderWithFallBacks,
  V4SubgraphProviderWithFallBacks,
} from '../../providers';
import {
  CachingTokenListProvider,
  ITokenListProvider,
} from '../../providers/caching-token-list-provider';
import {
  GasPrice,
  IGasPriceProvider,
} from '../../providers/gas-price-provider';
import {
  IPortionProvider,
  PortionProvider,
} from '../../providers/portion-provider';
import { ProviderConfig } from '../../providers/provider';
import { OnChainTokenFeeFetcher } from '../../providers/token-fee-fetcher';
import { ITokenProvider, TokenProvider } from '../../providers/token-provider';
import {
  ITokenValidatorProvider,
  TokenValidatorProvider,
} from '../../providers/token-validator-provider';
import {
  IV2PoolProvider,
  V2PoolProvider,
} from '../../providers/v2/pool-provider';
import {
  ArbitrumGasData,
  ArbitrumGasDataProvider,
  IL2GasDataProvider,
} from '../../providers/v3/gas-data-provider';
import {
  IV3PoolProvider,
  V3PoolProvider,
} from '../../providers/v3/pool-provider';
import { IV3SubgraphProvider } from '../../providers/v3/subgraph-provider';
import { CachingV4PoolProvider } from '../../providers/v4/caching-pool-provider';
import {
  IV4PoolProvider,
  V4PoolProvider,
} from '../../providers/v4/pool-provider';
import { Erc20__factory } from '../../types/other/factories/Erc20__factory';
import {
  getAddress,
  getAddressLowerCase,
  getApplicableV4FeesTickspacingsHooks,
  HooksOptions,
  MIXED_SUPPORTED,
  shouldWipeoutCachedRoutes,
  SWAP_ROUTER_02_ADDRESSES,
  V4_SUPPORTED,
  WRAPPED_NATIVE_CURRENCY,
} from '../../util';
import { CurrencyAmount } from '../../util/amounts';
import {
  ID_TO_CHAIN_ID,
  ID_TO_NETWORK_NAME,
  V2_SUPPORTED,
} from '../../util/chains';
import { DEFAULT_BLOCKS_TO_LIVE } from '../../util/defaultBlocksToLive';
import {
  getHighestLiquidityV3NativePool,
  getHighestLiquidityV3USDPool,
} from '../../util/gas-factory-helpers';
import { INTENT } from '../../util/intent';
import { log } from '../../util/log';
import {
  buildSwapMethodParameters,
  buildTrade,
} from '../../util/methodParameters';
import { metric, MetricLoggerUnit } from '../../util/metric';
import {
  BATCH_PARAMS,
  BLOCK_NUMBER_CONFIGS,
  DEFAULT_BATCH_PARAMS,
  DEFAULT_BLOCK_NUMBER_CONFIGS,
  DEFAULT_GAS_ERROR_FAILURE_OVERRIDES,
  DEFAULT_RETRY_OPTIONS,
  DEFAULT_SUCCESS_RATE_FAILURE_OVERRIDES,
  GAS_ERROR_FAILURE_OVERRIDES,
  RETRY_OPTIONS,
  SUCCESS_RATE_FAILURE_OVERRIDES,
} from '../../util/onchainQuoteProviderConfigs';
import { serializeRouteIds } from '../../util/serializeRouteIds';
import { UNSUPPORTED_TOKENS } from '../../util/unsupported-tokens';
import {
  cloneMixedRouteWithNewPools,
  cloneV2RouteWithNewPools,
  cloneV3RouteWithNewPools,
  cloneV4RouteWithNewPools,
  IRouter,
  ISwapToRatio,
  MethodParameters,
  MixedRoute,
  SwapAndAddConfig,
  SwapAndAddOptions,
  SwapAndAddParameters,
  SwapOptions,
  SwapRoute,
  SwapToRatioResponse,
  SwapToRatioStatus,
  SwapType,
  V2Route,
  V3Route,
  V4Route,
} from '../router';

import {
  DEFAULT_ROUTING_CONFIG_BY_CHAIN,
  ETH_GAS_STATION_API_URL,
} from './config';
import {
  MixedRouteWithValidQuote,
  RouteWithValidQuote,
  V2RouteWithValidQuote,
  V3RouteWithValidQuote,
  V4RouteWithValidQuote,
} from './entities/route-with-valid-quote';
import { BestSwapRoute, getBestSwapRoute } from './functions/best-swap-route';
import { calculateRatioAmountIn } from './functions/calculate-ratio-amount-in';
import {
  CandidatePoolsBySelectionCriteria,
  getMixedCrossLiquidityCandidatePools,
  getV2CandidatePools,
  getV3CandidatePools,
  getV4CandidatePools,
  SubgraphPool,
  V2CandidatePools,
  V3CandidatePools,
  V4CandidatePools,
} from './functions/get-candidate-pools';
import { NATIVE_OVERHEAD } from './gas-models/gas-costs';
import {
  GasModelProviderConfig,
  GasModelType,
  IGasModel,
  IOnChainGasModelFactory,
  IV2GasModelFactory,
  LiquidityCalculationPools,
} from './gas-models/gas-model';
import { MixedRouteHeuristicGasModelFactory } from './gas-models/mixedRoute/mixed-route-heuristic-gas-model';
import { V2HeuristicGasModelFactory } from './gas-models/v2/v2-heuristic-gas-model';
import { V3HeuristicGasModelFactory } from './gas-models/v3/v3-heuristic-gas-model';
import { V4HeuristicGasModelFactory } from './gas-models/v4/v4-heuristic-gas-model';
import { GetQuotesResult, MixedQuoter, V2Quoter, V3Quoter } from './quoters';
import { V4Quoter } from './quoters/v4-quoter';

export type AlphaRouterParams = {
  /**
   * The chain id for this instance of the Alpha Router.
   */
  chainId: ChainId;
  /**
   * The Web3 provider for getting on-chain data.
   */
  provider: BaseProvider;
  /**
   * The provider to use for making multicalls. Used for getting on-chain data
   * like pools, tokens, quotes in batch.
   */
  multicall2Provider?: UniswapMulticallProvider;
  /**
   * The provider for getting all pools that exist on V4 from the Subgraph. The pools
   * from this provider are filtered during the algorithm to a set of candidate pools.
   */
  v4SubgraphProvider?: IV4SubgraphProvider;
  /**
   * The provider for getting data about V4 pools.
   */
  v4PoolProvider?: IV4PoolProvider;
  /**
   * The provider for getting all pools that exist on V3 from the Subgraph. The pools
   * from this provider are filtered during the algorithm to a set of candidate pools.
   */
  v3SubgraphProvider?: IV3SubgraphProvider;
  /**
   * The provider for getting data about V3 pools.
   */
  v3PoolProvider?: IV3PoolProvider;
  /**
   * The provider for getting V3 quotes.
   */
  onChainQuoteProvider?: IOnChainQuoteProvider;
  /**
   * The provider for getting all pools that exist on V2 from the Subgraph. The pools
   * from this provider are filtered during the algorithm to a set of candidate pools.
   */
  v2SubgraphProvider?: IV2SubgraphProvider;
  /**
   * The provider for getting data about V2 pools.
   */
  v2PoolProvider?: IV2PoolProvider;
  /**
   * The provider for getting V3 quotes.
   */
  v2QuoteProvider?: IV2QuoteProvider;
  /**
   * The provider for getting data about Tokens.
   */
  tokenProvider?: ITokenProvider;
  /**
   * The provider for getting the current gas price to use when account for gas in the
   * algorithm.
   */
  gasPriceProvider?: IGasPriceProvider;
  /**
   * A factory for generating a gas model that is used when estimating the gas used by
   * V4 routes.
   */
  v4GasModelFactory?: IOnChainGasModelFactory<V4RouteWithValidQuote>;
  /**
   * A factory for generating a gas model that is used when estimating the gas used by
   * V3 routes.
   */
  v3GasModelFactory?: IOnChainGasModelFactory<V3RouteWithValidQuote>;
  /**
   * A factory for generating a gas model that is used when estimating the gas used by
   * V2 routes.
   */
  v2GasModelFactory?: IV2GasModelFactory;
  /**
   * A factory for generating a gas model that is used when estimating the gas used by
   * V3 routes.
   */
  mixedRouteGasModelFactory?: IOnChainGasModelFactory<MixedRouteWithValidQuote>;
  /**
   * A token list that specifies Token that should be blocked from routing through.
   * Defaults to Uniswap's unsupported token list.
   */
  blockedTokenListProvider?: ITokenListProvider;

  /**
   * Calls lens function on SwapRouter02 to determine ERC20 approval types for
   * LP position tokens.
   */
  swapRouterProvider?: ISwapRouterProvider;

  /**
   * A token validator for detecting fee-on-transfer tokens or tokens that can't be transferred.
   */
  tokenValidatorProvider?: ITokenValidatorProvider;

  /**
   * Calls the arbitrum gas data contract to fetch constants for calculating the l1 fee.
   */
  arbitrumGasDataProvider?: IL2GasDataProvider<ArbitrumGasData>;

  /**
   * Simulates swaps and returns new SwapRoute with updated gas estimates.
   */
  simulator?: Simulator;

  /**
   * A provider for caching the best route given an amount, quoteToken, tradeType
   */
  routeCachingProvider?: IRouteCachingProvider;

  /**
   * A provider for getting token properties for special tokens like fee-on-transfer tokens.
   */
  tokenPropertiesProvider?: ITokenPropertiesProvider;

  /**
   * A provider for computing the portion-related data for routes and quotes.
   */
  portionProvider?: IPortionProvider;

  /**
   * All the supported v2 chains configuration
   */
  v2Supported?: ChainId[];

  /**
   * All the supported v4 chains configuration
   */
  v4Supported?: ChainId[];

  /**
   * All the supported mixed chains configuration
   */
  mixedSupported?: ChainId[];

  /**
   * The v4 pool params to be used for the v4 pool provider.
   * fee tiers, tickspacings, and hook addresses
   */
  v4PoolParams?: Array<[number, number, string]>;

  /**
   * We want to rollout the cached routes cache invalidation carefully.
   * Because a wrong fix might impact prod success rate and/or latency.
   */
  cachedRoutesCacheInvalidationFixRolloutPercentage?: number;

  /**
   * All the chains that have the cache invalidation enabled
   * https://linear.app/uniswap/issue/ROUTE-467/tenderly-simulation-during-caching-lambda
   */
  deleteCacheEnabledChains?: ChainId[];
};

export class MapWithLowerCaseKey<V> extends Map<string, V> {
  override set(key: string, value: V): this {
    return super.set(key.toLowerCase(), value);
  }
}

export class LowerCaseStringArray extends Array<string> {
  constructor(...items: string[]) {
    // Convert all items to lowercase before calling the parent constructor
    super(...items.map((item) => item.toLowerCase()));
  }
}

/**
 * Determines the pools that the algorithm will consider when finding the optimal swap.
 *
 * All pools on each protocol are filtered based on the heuristics specified here to generate
 * the set of candidate pools. The Top N pools are taken by Total Value Locked (TVL).
 *
 * Higher values here result in more pools to explore which results in higher latency.
 */
export type ProtocolPoolSelection = {
  /**
   * The top N pools by TVL out of all pools on the protocol.
   */
  topN: number;
  /**
   * The top N pools by TVL of pools that consist of tokenIn and tokenOut.
   */
  topNDirectSwaps: number;
  /**
   * The top N pools by TVL of pools where one token is tokenIn and the
   * top N pools by TVL of pools where one token is tokenOut tokenOut.
   */
  topNTokenInOut: number;
  /**
   * Given the topNTokenInOut pools, gets the top N pools that involve the other token.
   * E.g. for a WETH -> USDC swap, if topNTokenInOut found WETH -> DAI and WETH -> USDT,
   * a value of 2 would find the top 2 pools that involve DAI and top 2 pools that involve USDT.
   */
  topNSecondHop: number;
  /**
   * Given the topNTokenInOut pools and a token address,
   * gets the top N pools that involve the other token.
   * If token address is not on the list, we default to topNSecondHop.
   * E.g. for a WETH -> USDC swap, if topNTokenInOut found WETH -> DAI and WETH -> USDT,
   * and there's a mapping USDT => 4, but no mapping for DAI
   * it would find the top 4 pools that involve USDT, and find the topNSecondHop pools that involve DAI
   */
  topNSecondHopForTokenAddress?: MapWithLowerCaseKey<number>;
  /**
   * List of token addresses to avoid using as a second hop.
   * There might be multiple reasons why we would like to avoid a specific token,
   *   but the specific reason that we are trying to solve is when the pool is not synced properly
   *   e.g. when the pool has a rebasing token that isn't syncing the pool on every rebase.
   */
  tokensToAvoidOnSecondHops?: LowerCaseStringArray;
  /**
   * The top N pools for token in and token out that involve a token from a list of
   * hardcoded 'base tokens'. These are standard tokens such as WETH, USDC, DAI, etc.
   * This is similar to how the legacy routing algorithm used by Uniswap would select
   * pools and is intended to make the new pool selection algorithm close to a superset
   * of the old algorithm.
   */
  topNWithEachBaseToken: number;
  /**
   * Given the topNWithEachBaseToken pools, takes the top N pools from the full list.
   * E.g. for a WETH -> USDC swap, if topNWithEachBaseToken found WETH -0.05-> DAI,
   * WETH -0.01-> DAI, WETH -0.05-> USDC, WETH -0.3-> USDC, a value of 2 would reduce
   * this set to the top 2 pools from that full list.
   */
  topNWithBaseToken: number;
};

export type AlphaRouterConfig = {
  /**
   * The block number to use for all on-chain data. If not provided, the router will
   * use the latest block returned by the provider.
   */
  blockNumber?: number | Promise<number>;
  /**
   * The protocols to consider when finding the optimal swap. If not provided all protocols
   * will be used.
   */
  protocols?: Protocol[];
  /**
   * The protocols-version pools to be excluded from the mixed routes.
   */
  excludedProtocolsFromMixed?: Protocol[];
  /**
   * Config for selecting which pools to consider routing via on V2.
   */
  v2PoolSelection: ProtocolPoolSelection;
  /**
   * Config for selecting which pools to consider routing via on V3.
   */
  v3PoolSelection: ProtocolPoolSelection;
  /**
   * Config for selecting which pools to consider routing via on V4.
   */
  v4PoolSelection: ProtocolPoolSelection;
  /**
   * For each route, the maximum number of hops to consider. More hops will increase latency of the algorithm.
   */
  maxSwapsPerPath: number;
  /**
   * The maximum number of splits in the returned route. A higher maximum will increase latency of the algorithm.
   */
  maxSplits: number;
  /**
   * The minimum number of splits in the returned route.
   * This parameters should always be set to 1. It is only included for testing purposes.
   */
  minSplits: number;
  /**
   * Forces the returned swap to route across all protocols.
   * This parameter should always be false. It is only included for testing purposes.
   */
  forceCrossProtocol: boolean;
  /**
   * Force the alpha router to choose a mixed route swap.
   * Default will be falsy. It is only included for testing purposes.
   */
  forceMixedRoutes?: boolean;
  /**
   * The minimum percentage of the input token to use for each route in a split route.
   * All routes will have a multiple of this value. For example is distribution percentage is 5,
   * a potential return swap would be:
   *
   * 5% of input => Route 1
   * 55% of input => Route 2
   * 40% of input => Route 3
   */
  distributionPercent: number;
  /**
   * Flag to indicate whether to use the cached routes or not.
   * By default, the cached routes will be used.
   */
  useCachedRoutes?: boolean;
  /**
   * Flag to indicate whether to write to the cached routes or not.
   * By default, the cached routes will be written to.
   */
  writeToCachedRoutes?: boolean;
  /**
   * Flag to indicate whether to use the CachedRoutes in optimistic mode.
   * Optimistic mode means that we will allow blocksToLive greater than 1.
   */
  optimisticCachedRoutes?: boolean;
  /**
   * Debug param that helps to see the short-term latencies improvements without impacting the main path.
   */
  debugRouting?: boolean;
  /**
   * Flag that allow us to override the cache mode.
   */
  overwriteCacheMode?: CacheMode;
  /**
   * Flag for token properties provider to enable fetching fee-on-transfer tokens.
   */
  enableFeeOnTransferFeeFetching?: boolean;
  /**
   * Tenderly natively support save simulation failures if failed,
   * we need this as a pass-through flag to enable/disable this feature.
   */
  saveTenderlySimulationIfFailed?: boolean;
  /**
   * Include an additional response field specifying the swap gas estimation in terms of a specific gas token.
   * This requires a suitable Native/GasToken pool to exist on V3. If one does not exist this field will return null.
   */
  gasToken?: string;
  /**
   * The version of the universal router to use.
   */
  universalRouterVersion?: UniversalRouterVersion;
  /**
   * pass in routing-api intent to align the intent between routing-api and SOR
   */
  intent?: INTENT;
  /**
   * boolean flag to control whether we should enable mixed route that connects ETH <-> WETH
   */
  shouldEnableMixedRouteEthWeth?: boolean;
  /**
   * hashed router ids of the cached route, if the online routing lambda uses the cached route to serve the quote
   */
  cachedRoutesRouteIds?: string;
  /**
   * enable mixed route with UR1_2 version backward compatibility issue
   */
  enableMixedRouteWithUR1_2?: boolean;
  /**
   * enable debug mode for async routing lambda
   */
  enableDebug?: boolean;
  /**
   * pass in hooks options for hooks routing toggles from the frontend
   */
  hooksOptions?: HooksOptions;
};

export class AlphaRouter
  implements
    IRouter<AlphaRouterConfig>,
    ISwapToRatio<AlphaRouterConfig, SwapAndAddConfig>
{
  protected chainId: ChainId;
  protected provider: BaseProvider;
  protected multicall2Provider: UniswapMulticallProvider;
  protected v4SubgraphProvider: IV4SubgraphProvider;
  protected v4PoolProvider: IV4PoolProvider;
  protected v3SubgraphProvider: IV3SubgraphProvider;
  protected v3PoolProvider: IV3PoolProvider;
  protected onChainQuoteProvider: IOnChainQuoteProvider;
  protected v2SubgraphProvider: IV2SubgraphProvider;
  protected v2QuoteProvider: IV2QuoteProvider;
  protected v2PoolProvider: IV2PoolProvider;
  protected tokenProvider: ITokenProvider;
  protected gasPriceProvider: IGasPriceProvider;
  protected swapRouterProvider: ISwapRouterProvider;
  protected v4GasModelFactory: IOnChainGasModelFactory<V4RouteWithValidQuote>;
  protected v3GasModelFactory: IOnChainGasModelFactory<V3RouteWithValidQuote>;
  protected v2GasModelFactory: IV2GasModelFactory;
  protected mixedRouteGasModelFactory: IOnChainGasModelFactory<MixedRouteWithValidQuote>;
  protected tokenValidatorProvider?: ITokenValidatorProvider;
  protected blockedTokenListProvider?: ITokenListProvider;
  protected l2GasDataProvider?: IL2GasDataProvider<ArbitrumGasData>;
  protected simulator?: Simulator;
  protected v2Quoter: V2Quoter;
  protected v3Quoter: V3Quoter;
  protected v4Quoter: V4Quoter;
  protected mixedQuoter: MixedQuoter;
  protected routeCachingProvider?: IRouteCachingProvider;
  protected tokenPropertiesProvider: ITokenPropertiesProvider;
  protected portionProvider: IPortionProvider;
  protected v2Supported?: ChainId[];
  protected v4Supported?: ChainId[];
  protected mixedSupported?: ChainId[];
  protected v4PoolParams?: Array<[number, number, string]>;
  protected cachedRoutesCacheInvalidationFixRolloutPercentage?: number;
  protected shouldEnableMixedRouteEthWeth?: boolean;
  protected deleteCacheEnabledChains?: ChainId[];

  constructor({
    chainId,
    provider,
    multicall2Provider,
    v4SubgraphProvider,
    v4PoolProvider,
    v3PoolProvider,
    onChainQuoteProvider,
    v2PoolProvider,
    v2QuoteProvider,
    v2SubgraphProvider,
    tokenProvider,
    blockedTokenListProvider,
    v3SubgraphProvider,
    gasPriceProvider,
    v4GasModelFactory,
    v3GasModelFactory,
    v2GasModelFactory,
    mixedRouteGasModelFactory,
    swapRouterProvider,
    tokenValidatorProvider,
    arbitrumGasDataProvider,
    simulator,
    routeCachingProvider,
    tokenPropertiesProvider,
    portionProvider,
    v2Supported,
    v4Supported,
    mixedSupported,
    v4PoolParams,
    cachedRoutesCacheInvalidationFixRolloutPercentage,
    deleteCacheEnabledChains,
  }: AlphaRouterParams) {
    this.chainId = chainId;
    this.provider = provider;
    this.multicall2Provider =
      multicall2Provider ??
      new UniswapMulticallProvider(chainId, provider, 375_000);
    this.v4PoolProvider =
      v4PoolProvider ??
      new CachingV4PoolProvider(
        this.chainId,
        new V4PoolProvider(ID_TO_CHAIN_ID(chainId), this.multicall2Provider),
        new NodeJSCache(new NodeCache({ stdTTL: 360, useClones: false }))
      );
    this.v3PoolProvider =
      v3PoolProvider ??
      new CachingV3PoolProvider(
        this.chainId,
        new V3PoolProvider(ID_TO_CHAIN_ID(chainId), this.multicall2Provider),
        new NodeJSCache(new NodeCache({ stdTTL: 360, useClones: false }))
      );
    this.simulator = simulator;
    this.routeCachingProvider = routeCachingProvider;

    if (onChainQuoteProvider) {
      this.onChainQuoteProvider = onChainQuoteProvider;
    } else {
      switch (chainId) {
        case ChainId.OPTIMISM:
        case ChainId.OPTIMISM_GOERLI:
        case ChainId.OPTIMISM_SEPOLIA:
          this.onChainQuoteProvider = new OnChainQuoteProvider(
            chainId,
            provider,
            this.multicall2Provider,
            {
              retries: 2,
              minTimeout: 100,
              maxTimeout: 1000,
            },
            (_) => {
              return {
                multicallChunk: 110,
                gasLimitPerCall: 1_200_000,
                quoteMinSuccessRate: 0.1,
              };
            },
            (_) => {
              return {
                gasLimitOverride: 3_000_000,
                multicallChunk: 45,
              };
            },
            (_) => {
              return {
                gasLimitOverride: 3_000_000,
                multicallChunk: 45,
              };
            },
            (_) => {
              return {
                baseBlockOffset: -10,
                rollback: {
                  enabled: true,
                  attemptsBeforeRollback: 1,
                  rollbackBlockOffset: -10,
                },
              };
            }
          );
          break;
        case ChainId.BASE:
        case ChainId.BLAST:
        case ChainId.ZORA:
        case ChainId.WORLDCHAIN:
        case ChainId.UNICHAIN_SEPOLIA:
        case ChainId.MONAD_TESTNET:
        case ChainId.BASE_SEPOLIA:
        case ChainId.UNICHAIN:
        case ChainId.BASE_GOERLI:
        case ChainId.SONEIUM:
          this.onChainQuoteProvider = new OnChainQuoteProvider(
            chainId,
            provider,
            this.multicall2Provider,
            {
              retries: 2,
              minTimeout: 100,
              maxTimeout: 1000,
            },
            (_) => {
              return {
                multicallChunk: 80,
                gasLimitPerCall: 1_200_000,
                quoteMinSuccessRate: 0.1,
              };
            },
            (_) => {
              return {
                gasLimitOverride: 3_000_000,
                multicallChunk: 45,
              };
            },
            (_) => {
              return {
                gasLimitOverride: 3_000_000,
                multicallChunk: 45,
              };
            },
            (_) => {
              return {
                baseBlockOffset: -10,
                rollback: {
                  enabled: true,
                  attemptsBeforeRollback: 1,
                  rollbackBlockOffset: -10,
                },
              };
            }
          );
          break;
        case ChainId.ZKSYNC:
          this.onChainQuoteProvider = new OnChainQuoteProvider(
            chainId,
            provider,
            this.multicall2Provider,
            {
              retries: 2,
              minTimeout: 100,
              maxTimeout: 1000,
            },
            (_) => {
              return {
                multicallChunk: 27,
                gasLimitPerCall: 3_000_000,
                quoteMinSuccessRate: 0.1,
              };
            },
            (_) => {
              return {
                gasLimitOverride: 6_000_000,
                multicallChunk: 13,
              };
            },
            (_) => {
              return {
                gasLimitOverride: 6_000_000,
                multicallChunk: 13,
              };
            },
            (_) => {
              return {
                baseBlockOffset: -10,
                rollback: {
                  enabled: true,
                  attemptsBeforeRollback: 1,
                  rollbackBlockOffset: -10,
                },
              };
            }
          );
          break;
        case ChainId.ARBITRUM_ONE:
        case ChainId.ARBITRUM_GOERLI:
        case ChainId.ARBITRUM_SEPOLIA:
          this.onChainQuoteProvider = new OnChainQuoteProvider(
            chainId,
            provider,
            this.multicall2Provider,
            {
              retries: 2,
              minTimeout: 100,
              maxTimeout: 1000,
            },
            (_) => {
              return {
                multicallChunk: 10,
                gasLimitPerCall: 12_000_000,
                quoteMinSuccessRate: 0.1,
              };
            },
            (_) => {
              return {
                gasLimitOverride: 30_000_000,
                multicallChunk: 6,
              };
            },
            (_) => {
              return {
                gasLimitOverride: 30_000_000,
                multicallChunk: 6,
              };
            }
          );
          break;
        case ChainId.CELO:
        case ChainId.CELO_ALFAJORES:
          this.onChainQuoteProvider = new OnChainQuoteProvider(
            chainId,
            provider,
            this.multicall2Provider,
            {
              retries: 2,
              minTimeout: 100,
              maxTimeout: 1000,
            },
            (_) => {
              return {
                multicallChunk: 10,
                gasLimitPerCall: 5_000_000,
                quoteMinSuccessRate: 0.1,
              };
            },
            (_) => {
              return {
                gasLimitOverride: 5_000_000,
                multicallChunk: 5,
              };
            },
            (_) => {
              return {
                gasLimitOverride: 6_250_000,
                multicallChunk: 4,
              };
            }
          );
          break;
        case ChainId.POLYGON_MUMBAI:
        case ChainId.SEPOLIA:
        case ChainId.MAINNET:
        case ChainId.POLYGON:
          this.onChainQuoteProvider = new OnChainQuoteProvider(
            chainId,
            provider,
            this.multicall2Provider,
            RETRY_OPTIONS[chainId],
            (_) => BATCH_PARAMS[chainId]!,
            (_) => GAS_ERROR_FAILURE_OVERRIDES[chainId]!,
            (_) => SUCCESS_RATE_FAILURE_OVERRIDES[chainId]!,
            (_) => BLOCK_NUMBER_CONFIGS[chainId]!
          );
          break;
        default:
          this.onChainQuoteProvider = new OnChainQuoteProvider(
            chainId,
            provider,
            this.multicall2Provider,
            DEFAULT_RETRY_OPTIONS,
            (_) => DEFAULT_BATCH_PARAMS,
            (_) => DEFAULT_GAS_ERROR_FAILURE_OVERRIDES,
            (_) => DEFAULT_SUCCESS_RATE_FAILURE_OVERRIDES,
            (_) => DEFAULT_BLOCK_NUMBER_CONFIGS
          );
          break;
      }
    }

    if (tokenValidatorProvider) {
      this.tokenValidatorProvider = tokenValidatorProvider;
    } else if (this.chainId === ChainId.MAINNET) {
      this.tokenValidatorProvider = new TokenValidatorProvider(
        this.chainId,
        this.multicall2Provider,
        new NodeJSCache(new NodeCache({ stdTTL: 30000, useClones: false }))
      );
    }
    if (tokenPropertiesProvider) {
      this.tokenPropertiesProvider = tokenPropertiesProvider;
    } else {
      this.tokenPropertiesProvider = new TokenPropertiesProvider(
        this.chainId,
        new NodeJSCache(new NodeCache({ stdTTL: 86400, useClones: false })),
        new OnChainTokenFeeFetcher(this.chainId, provider)
      );
    }
    this.v2PoolProvider =
      v2PoolProvider ??
      new CachingV2PoolProvider(
        chainId,
        new V2PoolProvider(
          chainId,
          this.multicall2Provider,
          this.tokenPropertiesProvider
        ),
        new NodeJSCache(new NodeCache({ stdTTL: 60, useClones: false }))
      );

    this.v2QuoteProvider = v2QuoteProvider ?? new V2QuoteProvider();

    this.blockedTokenListProvider =
      blockedTokenListProvider ??
      new CachingTokenListProvider(
        chainId,
        UNSUPPORTED_TOKENS as TokenList,
        new NodeJSCache(new NodeCache({ stdTTL: 3600, useClones: false }))
      );
    this.tokenProvider =
      tokenProvider ??
      new CachingTokenProviderWithFallback(
        chainId,
        new NodeJSCache(new NodeCache({ stdTTL: 3600, useClones: false })),
        new CachingTokenListProvider(
          chainId,
          DEFAULT_TOKEN_LIST,
          new NodeJSCache(new NodeCache({ stdTTL: 3600, useClones: false }))
        ),
        new TokenProvider(chainId, this.multicall2Provider)
      );
    this.portionProvider = portionProvider ?? new PortionProvider();

    const chainName = ID_TO_NETWORK_NAME(chainId);

    // ipfs urls in the following format: `https://cloudflare-ipfs.com/ipns/api.uniswap.org/v1/pools/${protocol}/${chainName}.json`;
    if (v2SubgraphProvider) {
      this.v2SubgraphProvider = v2SubgraphProvider;
    } else {
      this.v2SubgraphProvider = new V2SubgraphProviderWithFallBacks([
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
    }

    if (v3SubgraphProvider) {
      this.v3SubgraphProvider = v3SubgraphProvider;
    } else {
      this.v3SubgraphProvider = new V3SubgraphProviderWithFallBacks([
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
    }

    this.v4PoolParams =
      v4PoolParams ?? getApplicableV4FeesTickspacingsHooks(chainId);
    if (v4SubgraphProvider) {
      this.v4SubgraphProvider = v4SubgraphProvider;
    } else {
      this.v4SubgraphProvider = new V4SubgraphProviderWithFallBacks([
        new CachingV4SubgraphProvider(
          chainId,
          new URISubgraphProvider(
            chainId,
            `https://cloudflare-ipfs.com/ipns/api.uniswap.org/v1/pools/v4/${chainName}.json`,
            undefined,
            0
          ),
          new NodeJSCache(new NodeCache({ stdTTL: 300, useClones: false }))
        ),
        new StaticV4SubgraphProvider(
          chainId,
          this.v4PoolProvider,
          this.v4PoolParams
        ),
      ]);
    }

    let gasPriceProviderInstance: IGasPriceProvider;
    if (JsonRpcProvider.isProvider(this.provider)) {
      gasPriceProviderInstance = new OnChainGasPriceProvider(
        chainId,
        new EIP1559GasPriceProvider(this.provider as JsonRpcProvider),
        new LegacyGasPriceProvider(this.provider as JsonRpcProvider)
      );
    } else {
      gasPriceProviderInstance = new ETHGasStationInfoProvider(
        ETH_GAS_STATION_API_URL
      );
    }

    this.gasPriceProvider =
      gasPriceProvider ??
      new CachingGasStationProvider(
        chainId,
        gasPriceProviderInstance,
        new NodeJSCache<GasPrice>(
          new NodeCache({ stdTTL: 7, useClones: false })
        )
      );
    this.v4GasModelFactory =
      v4GasModelFactory ?? new V4HeuristicGasModelFactory(this.provider);
    this.v3GasModelFactory =
      v3GasModelFactory ?? new V3HeuristicGasModelFactory(this.provider);
    this.v2GasModelFactory =
      v2GasModelFactory ?? new V2HeuristicGasModelFactory(this.provider);
    this.mixedRouteGasModelFactory =
      mixedRouteGasModelFactory ?? new MixedRouteHeuristicGasModelFactory();

    this.swapRouterProvider =
      swapRouterProvider ??
      new SwapRouterProvider(this.multicall2Provider, this.chainId);

    if (
      chainId === ChainId.ARBITRUM_ONE ||
      chainId === ChainId.ARBITRUM_GOERLI
    ) {
      this.l2GasDataProvider =
        arbitrumGasDataProvider ??
        new ArbitrumGasDataProvider(chainId, this.provider);
    }

    // Initialize the Quoters.
    // Quoters are an abstraction encapsulating the business logic of fetching routes and quotes.
    this.v2Quoter = new V2Quoter(
      this.v2SubgraphProvider,
      this.v2PoolProvider,
      this.v2QuoteProvider,
      this.v2GasModelFactory,
      this.tokenProvider,
      this.chainId,
      this.blockedTokenListProvider,
      this.tokenValidatorProvider,
      this.l2GasDataProvider
    );

    this.v3Quoter = new V3Quoter(
      this.v3SubgraphProvider,
      this.v3PoolProvider,
      this.onChainQuoteProvider,
      this.tokenProvider,
      this.chainId,
      this.blockedTokenListProvider,
      this.tokenValidatorProvider
    );

    this.v4Quoter = new V4Quoter(
      this.v4SubgraphProvider,
      this.v4PoolProvider,
      this.onChainQuoteProvider,
      this.tokenProvider,
      this.chainId,
      this.blockedTokenListProvider,
      this.tokenValidatorProvider
    );

    this.mixedQuoter = new MixedQuoter(
      this.v4SubgraphProvider,
      this.v4PoolProvider,
      this.v3SubgraphProvider,
      this.v3PoolProvider,
      this.v2SubgraphProvider,
      this.v2PoolProvider,
      this.onChainQuoteProvider,
      this.tokenProvider,
      this.chainId,
      this.blockedTokenListProvider,
      this.tokenValidatorProvider
    );

    this.v2Supported = v2Supported ?? V2_SUPPORTED;
    this.v4Supported = v4Supported ?? V4_SUPPORTED;
    this.mixedSupported = mixedSupported ?? MIXED_SUPPORTED;

    this.cachedRoutesCacheInvalidationFixRolloutPercentage =
      cachedRoutesCacheInvalidationFixRolloutPercentage;

    // https://linear.app/uniswap/issue/ROUTE-467/tenderly-simulation-during-caching-lambda
    this.deleteCacheEnabledChains = deleteCacheEnabledChains;
  }

  public async routeToRatio(
    token0Balance: CurrencyAmount,
    token1Balance: CurrencyAmount,
    position: Position,
    swapAndAddConfig: SwapAndAddConfig,
    swapAndAddOptions?: SwapAndAddOptions,
    routingConfig: Partial<AlphaRouterConfig> = DEFAULT_ROUTING_CONFIG_BY_CHAIN(
      this.chainId
    )
  ): Promise<SwapToRatioResponse> {
    if (
      token1Balance.currency.wrapped.sortsBefore(token0Balance.currency.wrapped)
    ) {
      [token0Balance, token1Balance] = [token1Balance, token0Balance];
    }

    let preSwapOptimalRatio = this.calculateOptimalRatio(
      position,
      position.pool.sqrtRatioX96,
      true
    );
    // set up parameters according to which token will be swapped
    let zeroForOne: boolean;
    if (position.pool.tickCurrent > position.tickUpper) {
      zeroForOne = true;
    } else if (position.pool.tickCurrent < position.tickLower) {
      zeroForOne = false;
    } else {
      zeroForOne = new Fraction(
        token0Balance.quotient,
        token1Balance.quotient
      ).greaterThan(preSwapOptimalRatio);
      if (!zeroForOne) preSwapOptimalRatio = preSwapOptimalRatio.invert();
    }

    const [inputBalance, outputBalance] = zeroForOne
      ? [token0Balance, token1Balance]
      : [token1Balance, token0Balance];

    let optimalRatio = preSwapOptimalRatio;
    let postSwapTargetPool = position.pool;
    let exchangeRate: Fraction = zeroForOne
      ? position.pool.token0Price
      : position.pool.token1Price;
    let swap: SwapRoute | null = null;
    let ratioAchieved = false;
    let n = 0;
    // iterate until we find a swap with a sufficient ratio or return null
    while (!ratioAchieved) {
      n++;
      if (n > swapAndAddConfig.maxIterations) {
        log.info('max iterations exceeded');
        return {
          status: SwapToRatioStatus.NO_ROUTE_FOUND,
          error: 'max iterations exceeded',
        };
      }

      const amountToSwap = calculateRatioAmountIn(
        optimalRatio,
        exchangeRate,
        inputBalance,
        outputBalance
      );
      if (amountToSwap.equalTo(0)) {
        log.info(`no swap needed: amountToSwap = 0`);
        return {
          status: SwapToRatioStatus.NO_SWAP_NEEDED,
        };
      }
      swap = await this.route(
        amountToSwap,
        outputBalance.currency,
        TradeType.EXACT_INPUT,
        undefined,
        {
          ...DEFAULT_ROUTING_CONFIG_BY_CHAIN(this.chainId),
          ...routingConfig,
          /// @dev We do not want to query for mixedRoutes for routeToRatio as they are not supported
          /// [Protocol.V3, Protocol.V2] will make sure we only query for V3 and V2
          protocols: [Protocol.V3, Protocol.V2],
        }
      );
      if (!swap) {
        log.info('no route found from this.route()');
        return {
          status: SwapToRatioStatus.NO_ROUTE_FOUND,
          error: 'no route found',
        };
      }

      const inputBalanceUpdated = inputBalance.subtract(
        swap.trade!.inputAmount
      );
      const outputBalanceUpdated = outputBalance.add(swap.trade!.outputAmount);
      const newRatio = inputBalanceUpdated.divide(outputBalanceUpdated);

      let targetPoolPriceUpdate;
      swap.route.forEach((route) => {
        if (route.protocol === Protocol.V3) {
          const v3Route = route as V3RouteWithValidQuote;
          v3Route.route.pools.forEach((pool, i) => {
            if (
              pool.token0.equals(position.pool.token0) &&
              pool.token1.equals(position.pool.token1) &&
              pool.fee === position.pool.fee
            ) {
              targetPoolPriceUpdate = JSBI.BigInt(
                v3Route.sqrtPriceX96AfterList[i]!.toString()
              );
              optimalRatio = this.calculateOptimalRatio(
                position,
                JSBI.BigInt(targetPoolPriceUpdate!.toString()),
                zeroForOne
              );
            }
          });
        }
      });
      if (!targetPoolPriceUpdate) {
        optimalRatio = preSwapOptimalRatio;
      }
      ratioAchieved =
        newRatio.equalTo(optimalRatio) ||
        this.absoluteValue(
          newRatio.asFraction.divide(optimalRatio).subtract(1)
        ).lessThan(swapAndAddConfig.ratioErrorTolerance);

      if (ratioAchieved && targetPoolPriceUpdate) {
        postSwapTargetPool = new Pool(
          position.pool.token0,
          position.pool.token1,
          position.pool.fee,
          targetPoolPriceUpdate,
          position.pool.liquidity,
          TickMath.getTickAtSqrtRatio(targetPoolPriceUpdate),
          position.pool.tickDataProvider
        );
      }
      exchangeRate = swap.trade!.outputAmount.divide(swap.trade!.inputAmount);

      log.info(
        {
          exchangeRate: exchangeRate.asFraction.toFixed(18),
          optimalRatio: optimalRatio.asFraction.toFixed(18),
          newRatio: newRatio.asFraction.toFixed(18),
          inputBalanceUpdated: inputBalanceUpdated.asFraction.toFixed(18),
          outputBalanceUpdated: outputBalanceUpdated.asFraction.toFixed(18),
          ratioErrorTolerance: swapAndAddConfig.ratioErrorTolerance.toFixed(18),
          iterationN: n.toString(),
        },
        'QuoteToRatio Iteration Parameters'
      );

      if (exchangeRate.equalTo(0)) {
        log.info('exchangeRate to 0');
        return {
          status: SwapToRatioStatus.NO_ROUTE_FOUND,
          error: 'insufficient liquidity to swap to optimal ratio',
        };
      }
    }

    if (!swap) {
      return {
        status: SwapToRatioStatus.NO_ROUTE_FOUND,
        error: 'no route found',
      };
    }
    let methodParameters: MethodParameters | undefined;
    if (swapAndAddOptions) {
      methodParameters = await this.buildSwapAndAddMethodParameters(
        swap.trade,
        swapAndAddOptions,
        {
          initialBalanceTokenIn: inputBalance,
          initialBalanceTokenOut: outputBalance,
          preLiquidityPosition: position,
        }
      );
    }

    return {
      status: SwapToRatioStatus.SUCCESS,
      result: { ...swap, methodParameters, optimalRatio, postSwapTargetPool },
    };
  }

  /**
   * @inheritdoc IRouter
   */
  public async route(
    amount: CurrencyAmount,
    quoteCurrency: Currency,
    tradeType: TradeType,
    swapConfig?: SwapOptions,
    partialRoutingConfig: Partial<AlphaRouterConfig> = {}
  ): Promise<SwapRoute | null> {
    const originalAmount = amount;

    const { currencyIn, currencyOut } =
      this.determineCurrencyInOutFromTradeType(
        tradeType,
        amount,
        quoteCurrency
      );

    const tokenOutProperties =
      await this.tokenPropertiesProvider.getTokensProperties(
        [currencyOut],
        partialRoutingConfig
      );

    const feeTakenOnTransfer =
      tokenOutProperties[getAddressLowerCase(currencyOut)]?.tokenFeeResult
        ?.feeTakenOnTransfer;
    const externalTransferFailed =
      tokenOutProperties[getAddressLowerCase(currencyOut)]?.tokenFeeResult
        ?.externalTransferFailed;

    // We want to log the fee on transfer output tokens that we are taking fee or not
    // Ideally the trade size (normalized in USD) would be ideal to log here, but we don't have spot price of output tokens here.
    // We have to make sure token out is FOT with either buy/sell fee bps > 0
    if (
      tokenOutProperties[
        getAddressLowerCase(currencyOut)
      ]?.tokenFeeResult?.buyFeeBps?.gt(0) ||
      tokenOutProperties[
        getAddressLowerCase(currencyOut)
      ]?.tokenFeeResult?.sellFeeBps?.gt(0)
    ) {
      if (feeTakenOnTransfer || externalTransferFailed) {
        // also to be extra safe, in case of FOT with feeTakenOnTransfer or externalTransferFailed,
        // we nullify the fee and flat fee to avoid any potential issues.
        // although neither web nor wallet should use the calldata returned from routing/SOR
        if (swapConfig?.type === SwapType.UNIVERSAL_ROUTER) {
          swapConfig.fee = undefined;
          swapConfig.flatFee = undefined;
        }

        metric.putMetric(
          'TokenOutFeeOnTransferNotTakingFee',
          1,
          MetricLoggerUnit.Count
        );
      } else {
        metric.putMetric(
          'TokenOutFeeOnTransferTakingFee',
          1,
          MetricLoggerUnit.Count
        );
      }
    }

    if (tradeType === TradeType.EXACT_OUTPUT) {
      const portionAmount = this.portionProvider.getPortionAmount(
        amount,
        tradeType,
        feeTakenOnTransfer,
        externalTransferFailed,
        swapConfig
      );
      if (portionAmount && portionAmount.greaterThan(ZERO)) {
        // In case of exact out swap, before we route, we need to make sure that the
        // token out amount accounts for flat portion, and token in amount after the best swap route contains the token in equivalent of portion.
        // In other words, in case a pool's LP fee bps is lower than the portion bps (0.01%/0.05% for v3), a pool can go insolvency.
        // This is because instead of the swapper being responsible for the portion,
        // the pool instead gets responsible for the portion.
        // The addition below avoids that situation.
        amount = amount.add(portionAmount);
      }
    }

    metric.setProperty('chainId', this.chainId);
    metric.setProperty('pair', `${currencyIn.symbol}/${currencyOut.symbol}`);
    metric.setProperty('tokenIn', getAddress(currencyIn));
    metric.setProperty('tokenOut', getAddress(currencyOut));
    metric.setProperty(
      'tradeType',
      tradeType === TradeType.EXACT_INPUT ? 'ExactIn' : 'ExactOut'
    );

    metric.putMetric(
      `QuoteRequestedForChain${this.chainId}`,
      1,
      MetricLoggerUnit.Count
    );

    // Get a block number to specify in all our calls. Ensures data we fetch from chain is
    // from the same block.
    const blockNumber =
      partialRoutingConfig.blockNumber ?? this.getBlockNumberPromise();

    const routingConfig: AlphaRouterConfig = _.merge(
      {
        // These settings could be changed by the partialRoutingConfig
        useCachedRoutes: true,
        writeToCachedRoutes: true,
        optimisticCachedRoutes: false,
      },
      DEFAULT_ROUTING_CONFIG_BY_CHAIN(this.chainId),
      partialRoutingConfig,
      { blockNumber }
    );

    if (routingConfig.debugRouting) {
      log.warn(`Finalized routing config is ${JSON.stringify(routingConfig)}`);
    }

    const gasPriceWei = await this.getGasPriceWei(
      await blockNumber,
      await partialRoutingConfig.blockNumber
    );

    // const gasTokenAccessor = await this.tokenProvider.getTokens([routingConfig.gasToken!]);
    const gasToken = routingConfig.gasToken
      ? (
          await this.tokenProvider.getTokens([routingConfig.gasToken])
        ).getTokenByAddress(routingConfig.gasToken)
      : undefined;

    const providerConfig: GasModelProviderConfig = {
      ...routingConfig,
      blockNumber,
      additionalGasOverhead: NATIVE_OVERHEAD(
        this.chainId,
        amount.currency,
        quoteCurrency
      ),
      gasToken,
      externalTransferFailed,
      feeTakenOnTransfer,
    };

    const {
      v2GasModel: v2GasModel,
      v3GasModel: v3GasModel,
      v4GasModel: v4GasModel,
      mixedRouteGasModel: mixedRouteGasModel,
    } = await this.getGasModels(
      gasPriceWei,
      amount.currency.wrapped,
      quoteCurrency.wrapped,
      providerConfig
    );

    // Create a Set to sanitize the protocols input, a Set of undefined becomes an empty set,
    // Then create an Array from the values of that Set.
    const protocols: Protocol[] = Array.from(
      new Set(routingConfig.protocols).values()
    );

    const cacheMode =
      routingConfig.overwriteCacheMode ??
      (await this.routeCachingProvider?.getCacheMode(
        this.chainId,
        amount,
        quoteCurrency,
        tradeType,
        protocols
      ));

    // Fetch CachedRoutes
    let cachedRoutes: CachedRoutes | undefined;

    // Decide whether to use cached routes or not - If |enabledAndRequestedProtocolsMatch| is true we are good to use cached routes.
    // In order to use cached routes, we need to have all enabled protocols specified in the request.
    // By default, all protocols are enabled but for UniversalRouterVersion.V1_2, V4 is not.
    // - ref: https://github.com/Uniswap/routing-api/blob/663b607d80d9249f85e7ab0925a611ec3701da2a/lib/util/supportedProtocolVersions.ts#L15
    // So we take this into account when deciding whether to use cached routes or not.
    // We only want to use cache if all enabled protocols are specified (V2,V3,V4? + MIXED). In any other case, use onchain path.
    // - Cache is optimized for global search, not for specific protocol(s) search.
    // For legacy systems (SWAP_ROUTER_02) or missing swapConfig, follow UniversalRouterVersion.V1_2 logic.
    const availableProtocolsSet = new Set(Object.values(Protocol));
    const requestedProtocolsSet = new Set(protocols);
    const swapRouter =
      !swapConfig ||
      swapConfig.type === SwapType.SWAP_ROUTER_02 ||
      (swapConfig.type === SwapType.UNIVERSAL_ROUTER &&
        swapConfig.version === UniversalRouterVersion.V1_2);
    if (swapRouter) {
      availableProtocolsSet.delete(Protocol.V4);
      if (requestedProtocolsSet.has(Protocol.V4)) {
        requestedProtocolsSet.delete(Protocol.V4);
      }
    }
    const enabledAndRequestedProtocolsMatch =
      availableProtocolsSet.size === requestedProtocolsSet.size &&
      [...availableProtocolsSet].every((protocol) =>
        requestedProtocolsSet.has(protocol)
      );

    // If the requested protocols do not match the enabled protocols, we need to set the hooks options to NO_HOOKS.
    if (!requestedProtocolsSet.has(Protocol.V4)) {
      routingConfig.hooksOptions = HooksOptions.NO_HOOKS;
    }

    // If hooksOptions not specified and it's not a swapRouter (i.e. Universal Router it is),
    // we should also set it to HOOKS_INCLUSIVE, as this is default behavior even without hooksOptions.
    if (!routingConfig.hooksOptions) {
      routingConfig.hooksOptions = HooksOptions.HOOKS_INCLUSIVE;
    }

    log.debug('UniversalRouterVersion_CacheGate_Check', {
      availableProtocolsSet: Array.from(availableProtocolsSet),
      requestedProtocolsSet: Array.from(requestedProtocolsSet),
      enabledAndRequestedProtocolsMatch,
      swapConfigType: swapConfig?.type,
      swapConfigUniversalRouterVersion:
        swapConfig?.type === SwapType.UNIVERSAL_ROUTER
          ? swapConfig?.version
          : 'N/A',
    });

    if (
      routingConfig.useCachedRoutes &&
      cacheMode !== CacheMode.Darkmode &&
      AlphaRouter.isAllowedToEnterCachedRoutes(
        routingConfig.intent,
        routingConfig.hooksOptions,
        swapRouter
      )
    ) {
      if (enabledAndRequestedProtocolsMatch) {
        if (
          protocols.includes(Protocol.V4) &&
          (currencyIn.isNative || currencyOut.isNative)
        ) {
          const [wrappedNativeCachedRoutes, nativeCachedRoutes] =
            await Promise.all([
              this.routeCachingProvider?.getCachedRoute(
                this.chainId,
                CurrencyAmount.fromRawAmount(
                  amount.currency.wrapped,
                  amount.quotient
                ),
                quoteCurrency.wrapped,
                tradeType,
                protocols,
                await blockNumber,
                routingConfig.optimisticCachedRoutes,
                routingConfig,
                swapConfig
              ),
              this.routeCachingProvider?.getCachedRoute(
                this.chainId,
                amount,
                quoteCurrency,
                tradeType,
                [Protocol.V4],
                await blockNumber,
                routingConfig.optimisticCachedRoutes,
                routingConfig,
                swapConfig
              ),
            ]);

          if (
            (wrappedNativeCachedRoutes &&
              wrappedNativeCachedRoutes?.routes.length > 0) ||
            (nativeCachedRoutes && nativeCachedRoutes?.routes.length > 0)
          ) {
            cachedRoutes = new CachedRoutes({
              routes: [
                ...(nativeCachedRoutes?.routes ?? []),
                ...(wrappedNativeCachedRoutes?.routes ?? []),
              ],
              chainId: this.chainId,
              currencyIn: currencyIn,
              currencyOut: currencyOut,
              protocolsCovered: protocols,
              blockNumber: await blockNumber,
              tradeType: tradeType,
              originalAmount:
                wrappedNativeCachedRoutes?.originalAmount ??
                nativeCachedRoutes?.originalAmount ??
                amount.quotient.toString(),
              blocksToLive:
                wrappedNativeCachedRoutes?.blocksToLive ??
                nativeCachedRoutes?.blocksToLive ??
                DEFAULT_BLOCKS_TO_LIVE[this.chainId],
            });
          }
        } else {
          cachedRoutes = await this.routeCachingProvider?.getCachedRoute(
            this.chainId,
            amount,
            quoteCurrency,
            tradeType,
            protocols,
            await blockNumber,
            routingConfig.optimisticCachedRoutes,
            routingConfig,
            swapConfig
          );
        }
      }
    }

    if (shouldWipeoutCachedRoutes(cachedRoutes, routingConfig)) {
      cachedRoutes = undefined;
    }

    metric.putMetric(
      routingConfig.useCachedRoutes
        ? 'GetQuoteUsingCachedRoutes'
        : 'GetQuoteNotUsingCachedRoutes',
      1,
      MetricLoggerUnit.Count
    );

    if (
      cacheMode &&
      routingConfig.useCachedRoutes &&
      cacheMode !== CacheMode.Darkmode &&
      !cachedRoutes
    ) {
      metric.putMetric(
        `GetCachedRoute_miss_${cacheMode}`,
        1,
        MetricLoggerUnit.Count
      );
      log.info(
        {
          currencyIn: currencyIn.symbol,
          currencyInAddress: getAddress(currencyIn),
          currencyOut: currencyOut.symbol,
          currencyOutAddress: getAddress(currencyOut),
          cacheMode,
          amount: amount.toExact(),
          chainId: this.chainId,
          tradeType: this.tradeTypeStr(tradeType),
        },
        `GetCachedRoute miss ${cacheMode} for ${this.tokenPairSymbolTradeTypeChainId(
          currencyIn,
          currencyOut,
          tradeType
        )}`
      );
    } else if (cachedRoutes && routingConfig.useCachedRoutes) {
      metric.putMetric(
        `GetCachedRoute_hit_${cacheMode}`,
        1,
        MetricLoggerUnit.Count
      );
      log.info(
        {
          currencyIn: currencyIn.symbol,
          currencyInAddress: getAddress(currencyIn),
          currencyOut: currencyOut.symbol,
          currencyOutAddress: getAddress(currencyOut),
          cacheMode,
          amount: amount.toExact(),
          chainId: this.chainId,
          tradeType: this.tradeTypeStr(tradeType),
        },
        `GetCachedRoute hit ${cacheMode} for ${this.tokenPairSymbolTradeTypeChainId(
          currencyIn,
          currencyOut,
          tradeType
        )}`
      );
    }

    let swapRouteFromCachePromise: Promise<BestSwapRoute | null> =
      Promise.resolve(null);
    if (cachedRoutes) {
      swapRouteFromCachePromise = this.getSwapRouteFromCache(
        currencyIn,
        currencyOut,
        cachedRoutes,
        await blockNumber,
        amount,
        quoteCurrency,
        tradeType,
        routingConfig,
        v3GasModel,
        v4GasModel,
        mixedRouteGasModel,
        gasPriceWei,
        v2GasModel,
        swapConfig,
        providerConfig
      );
    }

    let swapRouteFromChainPromise: Promise<BestSwapRoute | null> =
      Promise.resolve(null);
    if (!cachedRoutes || cacheMode !== CacheMode.Livemode) {
      swapRouteFromChainPromise = this.getSwapRouteFromChain(
        amount,
        currencyIn,
        currencyOut,
        protocols,
        quoteCurrency,
        tradeType,
        routingConfig,
        v3GasModel,
        v4GasModel,
        mixedRouteGasModel,
        gasPriceWei,
        v2GasModel,
        swapConfig,
        providerConfig
      );
    }

    const [swapRouteFromCache, swapRouteFromChain] = await Promise.all([
      swapRouteFromCachePromise,
      swapRouteFromChainPromise,
    ]);

    let swapRouteRaw: BestSwapRoute | null;
    let hitsCachedRoute = false;
    if (cacheMode === CacheMode.Livemode && swapRouteFromCache) {
      // offline lambda is never in cache mode
      // refresh pools to avoid stale data
      const beforeRefreshPools = Date.now();

      await this.refreshPools(
        swapRouteFromCache.routes,
        routingConfig,
        this.v2PoolProvider,
        this.v3PoolProvider,
        this.v4PoolProvider
      );

      metric.putMetric(
        `Route_RefreshPools_Latency`,
        Date.now() - beforeRefreshPools,
        MetricLoggerUnit.Milliseconds
      );

      log.info(
        `CacheMode is ${cacheMode}, and we are using swapRoute from cache`
      );
      hitsCachedRoute = true;
      swapRouteRaw = swapRouteFromCache;
    } else {
      log.info(
        `CacheMode is ${cacheMode}, and we are using materialized swapRoute`
      );
      swapRouteRaw = swapRouteFromChain;
    }

    if (
      cacheMode === CacheMode.Tapcompare &&
      swapRouteFromCache &&
      swapRouteFromChain
    ) {
      const quoteDiff = swapRouteFromChain.quote.subtract(
        swapRouteFromCache.quote
      );
      const quoteGasAdjustedDiff = swapRouteFromChain.quoteGasAdjusted.subtract(
        swapRouteFromCache.quoteGasAdjusted
      );
      const gasUsedDiff = swapRouteFromChain.estimatedGasUsed.sub(
        swapRouteFromCache.estimatedGasUsed
      );

      // Only log if quoteDiff is different from 0, or if quoteGasAdjustedDiff and gasUsedDiff are both different from 0
      if (
        !quoteDiff.equalTo(0) ||
        !(quoteGasAdjustedDiff.equalTo(0) || gasUsedDiff.eq(0))
      ) {
        try {
          // Calculates the percentage of the difference with respect to the quoteFromChain (not from cache)
          const misquotePercent = quoteGasAdjustedDiff
            .divide(swapRouteFromChain.quoteGasAdjusted)
            .multiply(100);

          metric.putMetric(
            `TapcompareCachedRoute_quoteGasAdjustedDiffPercent`,
            Number(misquotePercent.toExact()),
            MetricLoggerUnit.Percent
          );

          log.warn(
            {
              quoteFromChain: swapRouteFromChain.quote.toExact(),
              quoteFromCache: swapRouteFromCache.quote.toExact(),
              quoteDiff: quoteDiff.toExact(),
              quoteGasAdjustedFromChain:
                swapRouteFromChain.quoteGasAdjusted.toExact(),
              quoteGasAdjustedFromCache:
                swapRouteFromCache.quoteGasAdjusted.toExact(),
              quoteGasAdjustedDiff: quoteGasAdjustedDiff.toExact(),
              gasUsedFromChain: swapRouteFromChain.estimatedGasUsed.toString(),
              gasUsedFromCache: swapRouteFromCache.estimatedGasUsed.toString(),
              gasUsedDiff: gasUsedDiff.toString(),
              routesFromChain: swapRouteFromChain.routes.toString(),
              routesFromCache: swapRouteFromCache.routes.toString(),
              amount: amount.toExact(),
              originalAmount: cachedRoutes?.originalAmount,
              pair: this.tokenPairSymbolTradeTypeChainId(
                currencyIn,
                currencyOut,
                tradeType
              ),
              blockNumber,
            },
            `Comparing quotes between Chain and Cache for ${this.tokenPairSymbolTradeTypeChainId(
              currencyIn,
              currencyOut,
              tradeType
            )}`
          );
        } catch (error) {
          // This is in response to the 'division by zero' error
          // during https://uniswapteam.slack.com/archives/C059TGEC57W/p1723997015399579
          if (
            error instanceof RangeError &&
            error.message.includes('Division by zero')
          ) {
            log.error(
              {
                quoteGasAdjustedDiff: quoteGasAdjustedDiff.toExact(),
                swapRouteFromChainQuoteGasAdjusted:
                  swapRouteFromChain.quoteGasAdjusted.toExact(),
              },
              'Error calculating misquote percent'
            );

            metric.putMetric(
              `TapcompareCachedRoute_quoteGasAdjustedDiffPercent_divzero`,
              1,
              MetricLoggerUnit.Count
            );
          }

          // Log but don't throw here - this is only for logging.
        }
      }
    }

    let newSetCachedRoutesPath = false;
    const shouldEnableCachedRoutesCacheInvalidationFix =
      Math.random() * 100 <
      (this.cachedRoutesCacheInvalidationFixRolloutPercentage ?? 0);

    // we have to write cached routes right before checking swapRouteRaw is null or not
    // because getCachedRoutes in routing-api do not use the blocks-to-live to filter out the expired routes at all
    // there's a possibility the cachedRoutes is always populated, but swapRouteFromCache is always null, because we don't update cachedRoutes in this case at all,
    // as long as it's within 24 hours sliding window TTL
    if (shouldEnableCachedRoutesCacheInvalidationFix) {
      // theoretically, when routingConfig.intent === INTENT.CACHING, optimisticCachedRoutes should be false
      // so that we can always pass in cachedRoutes?.notExpired(await blockNumber, !routingConfig.optimisticCachedRoutes)
      // but just to be safe, we just hardcode true when checking the cached routes expiry for write update
      // we decide to not check cached routes expiry in the read path anyway
      if (!cachedRoutes?.notExpired(await blockNumber, true)) {
        // optimisticCachedRoutes === false means at routing-api level, we only want to set cached routes during intent=caching, not intent=quote
        // this means during the online quote endpoint path, we should not reset cached routes
        if (routingConfig.intent === INTENT.CACHING) {
          // due to fire and forget nature, we already take note that we should set new cached routes during the new path
          newSetCachedRoutesPath = true;
          metric.putMetric(`SetCachedRoute_NewPath`, 1, MetricLoggerUnit.Count);

          // there's a chance that swapRouteFromChain might be populated already,
          // when there's no cachedroutes in the dynamo DB.
          // in that case, we don't try to swap route from chain again
          const swapRouteFromChainAgain =
            swapRouteFromChain ??
            // we have to intentionally await here, because routing-api lambda has a chance to return the swapRoute/swapRouteWithSimulation
            // before the routing-api quote handler can finish running getSwapRouteFromChain (getSwapRouteFromChain is runtime intensive)
            (await this.getSwapRouteFromChain(
              amount,
              currencyIn,
              currencyOut,
              protocols,
              quoteCurrency,
              tradeType,
              routingConfig,
              v3GasModel,
              v4GasModel,
              mixedRouteGasModel,
              gasPriceWei,
              v2GasModel,
              swapConfig,
              providerConfig
            ));

          if (swapRouteFromChainAgain) {
            const routesToCache = CachedRoutes.fromRoutesWithValidQuotes(
              swapRouteFromChainAgain.routes,
              this.chainId,
              currencyIn,
              currencyOut,
              protocols.sort(),
              await blockNumber,
              tradeType,
              amount.toExact()
            );

            await this.setCachedRoutesAndLog(
              amount,
              currencyIn,
              currencyOut,
              tradeType,
              'SetCachedRoute_NewPath',
              routesToCache,
              routingConfig.cachedRoutesRouteIds
            );
          }
        }
      }
    }

    if (!swapRouteRaw) {
      return null;
    }

    const {
      quote,
      quoteGasAdjusted,
      estimatedGasUsed,
      routes: routeAmounts,
      estimatedGasUsedQuoteToken,
      estimatedGasUsedUSD,
      estimatedGasUsedGasToken,
    } = swapRouteRaw;

    // we intentionally dont add shouldEnableCachedRoutesCacheInvalidationFix in if condition below
    // because we know cached routes in prod dont filter by blocks-to-live
    // so that we know that swapRouteFromChain is always not populated, because
    // if (!cachedRoutes || cacheMode !== CacheMode.Livemode) above always have the cachedRoutes as populated
    if (
      this.routeCachingProvider &&
      routingConfig.writeToCachedRoutes &&
      cacheMode !== CacheMode.Darkmode &&
      swapRouteFromChain
    ) {
      if (newSetCachedRoutesPath) {
        // SetCachedRoute_NewPath and SetCachedRoute_OldPath metrics might have counts during short timeframe.
        // over time, we should expect to see less SetCachedRoute_OldPath metrics count.
        // in AWS metrics, one can investigate, by:
        // 1) seeing the overall metrics count of SetCachedRoute_NewPath and SetCachedRoute_OldPath. SetCachedRoute_NewPath should steadily go up, while SetCachedRoute_OldPath should go down.
        // 2) using the same requestId, one should see eventually when SetCachedRoute_NewPath metric is logged, SetCachedRoute_OldPath metric should not be called.
        metric.putMetric(
          `SetCachedRoute_OldPath_INTENT_${routingConfig.intent}`,
          1,
          MetricLoggerUnit.Count
        );
      }

      // Generate the object to be cached
      const routesToCache = CachedRoutes.fromRoutesWithValidQuotes(
        swapRouteFromChain.routes,
        this.chainId,
        currencyIn,
        currencyOut,
        protocols.sort(),
        await blockNumber,
        tradeType,
        amount.toExact()
      );

      await this.setCachedRoutesAndLog(
        amount,
        currencyIn,
        currencyOut,
        tradeType,
        'SetCachedRoute_OldPath',
        routesToCache,
        routingConfig.cachedRoutesRouteIds
      );
    }

    metric.putMetric(
      `QuoteFoundForChain${this.chainId}`,
      1,
      MetricLoggerUnit.Count
    );

    // Build Trade object that represents the optimal swap.
    const trade = buildTrade<typeof tradeType>(
      currencyIn,
      currencyOut,
      tradeType,
      routeAmounts
    );

    let methodParameters: MethodParameters | undefined;

    // If user provided recipient, deadline etc. we also generate the calldata required to execute
    // the swap and return it too.
    if (swapConfig) {
      methodParameters = buildSwapMethodParameters(
        trade,
        swapConfig,
        this.chainId
      );
    }

    const tokenOutAmount =
      tradeType === TradeType.EXACT_OUTPUT
        ? originalAmount // we need to pass in originalAmount instead of amount, because amount already added portionAmount in case of exact out swap
        : quote;
    const portionAmount = this.portionProvider.getPortionAmount(
      tokenOutAmount,
      tradeType,
      feeTakenOnTransfer,
      externalTransferFailed,
      swapConfig
    );
    const portionQuoteAmount = this.portionProvider.getPortionQuoteAmount(
      tradeType,
      quote,
      amount, // we need to pass in amount instead of originalAmount here, because amount here needs to add the portion for exact out
      portionAmount
    );

    // we need to correct quote and quote gas adjusted for exact output when portion is part of the exact out swap
    const correctedQuote = this.portionProvider.getQuote(
      tradeType,
      quote,
      portionQuoteAmount
    );

    const correctedQuoteGasAdjusted = this.portionProvider.getQuoteGasAdjusted(
      tradeType,
      quoteGasAdjusted,
      portionQuoteAmount
    );
    const quoteGasAndPortionAdjusted =
      this.portionProvider.getQuoteGasAndPortionAdjusted(
        tradeType,
        quoteGasAdjusted,
        portionAmount
      );
    const swapRoute: SwapRoute = {
      quote: correctedQuote,
      quoteGasAdjusted: correctedQuoteGasAdjusted,
      estimatedGasUsed,
      estimatedGasUsedQuoteToken,
      estimatedGasUsedUSD,
      estimatedGasUsedGasToken,
      gasPriceWei,
      route: routeAmounts,
      trade,
      methodParameters,
      blockNumber: BigNumber.from(await blockNumber),
      hitsCachedRoute: hitsCachedRoute,
      portionAmount: portionAmount,
      quoteGasAndPortionAdjusted: quoteGasAndPortionAdjusted,
    };

    if (
      swapConfig &&
      swapConfig.simulate &&
      methodParameters &&
      methodParameters.calldata
    ) {
      if (!this.simulator) {
        throw new Error('Simulator not initialized!');
      }

      log.info(
        JSON.stringify(
          { swapConfig, methodParameters, providerConfig },
          null,
          2
        ),
        `Starting simulation`
      );
      const fromAddress = swapConfig.simulate.fromAddress;
      const beforeSimulate = Date.now();
      const swapRouteWithSimulation = await this.simulator.simulate(
        fromAddress,
        swapConfig,
        swapRoute,
        amount,
        // Quote will be in WETH even if quoteCurrency is ETH
        // So we init a new CurrencyAmount object here
        CurrencyAmount.fromRawAmount(quoteCurrency, quote.quotient.toString()),
        providerConfig
      );

      if (
        this.deleteCacheEnabledChains?.includes(this.chainId) &&
        swapRouteWithSimulation.simulationStatus === SimulationStatus.Failed
      ) {
        // invalidate cached route if simulation failed
        log.info(
          {
            simulationStatus: swapRouteWithSimulation.simulationStatus,
            swapRoute: swapRouteWithSimulation,
          },
          `Simulation failed - detailed failure information: CacheInvalidationCount_${this.chainId}`
        );
        metric.putMetric(
          `CacheInvalidationCount_${this.chainId}`,
          1,
          MetricLoggerUnit.Count
        );

        // Generate the object to be cached
        const routesToCache = CachedRoutes.fromRoutesWithValidQuotes(
          swapRouteWithSimulation.route,
          this.chainId,
          currencyIn,
          currencyOut,
          protocols.sort(),
          await blockNumber,
          tradeType,
          amount.toExact()
        );

        if (!routesToCache) {
          log.error(
            { swapRouteWithSimulation },
            'Failed to generate cached routes after simulation failure'
          );
        } else {
          try {
            await this.routeCachingProvider?.deleteCachedRoute(routesToCache);
          } catch (err) {
            log.error(
              { err, routesToCache },
              'Failed to delete cached route after simulation failure'
            );
          }
        }
      }

      metric.putMetric(
        'SimulateTransaction',
        Date.now() - beforeSimulate,
        MetricLoggerUnit.Milliseconds
      );
      return swapRouteWithSimulation;
    }

    return swapRoute;
  }

  /**
   * Refreshes the pools for the given routes.
   *
   * @param routes the routes to refresh the pools for
   * @param routingConfig the routing config
   */
  protected async refreshPools(
    routes: RouteWithValidQuote[],
    routingConfig: AlphaRouterConfig,
    v2PoolProvider: IV2PoolProvider,
    v3PoolProvider: IV3PoolProvider,
    v4PoolProvider: IV4PoolProvider
  ) {
    for (const route of routes) {
      switch (route.protocol) {
        case Protocol.V2:
          route.route = await AlphaRouter.refreshV2Pools(
            route.route as V2Route,
            routingConfig,
            v2PoolProvider
          );
          break;
        case Protocol.V3:
          route.route = await AlphaRouter.refreshV3Pools(
            route.route as V3Route,
            routingConfig,
            v3PoolProvider
          );
          break;
        case Protocol.V4:
          route.route = await AlphaRouter.refreshV4Pools(
            route.route as V4Route,
            routingConfig,
            v4PoolProvider
          );
          break;
        case Protocol.MIXED:
          route.route = await AlphaRouter.refreshMixedPools(
            route.route as MixedRoute,
            routingConfig,
            v2PoolProvider,
            v3PoolProvider,
            v4PoolProvider
          );
          break;
        default:
          throw new Error(
            `Unknown protocol: ${(route as { protocol: Protocol }).protocol}`
          );
      }
    }
  }

  /**
   * Refreshes the V2 pools for the given route.
   *
   * @param route the route to refresh the V2 pools for
   * @param config the routing config
   * @param v2PoolProvider the V2 pool provider
   * @returns the refreshed route
   */
  protected static async refreshV2Pools(
    route: V2Route,
    config: AlphaRouterConfig,
    v2PoolProvider: IV2PoolProvider
  ): Promise<V2Route> {
    const refreshedPairs: V2Pool[] = [];
    for (const pair of route.pairs) {
      const v2Pools = await v2PoolProvider.getPools(
        [[pair.token0, pair.token1]],
        config
      );
      const refreshed = v2Pools.getPool(pair.token0, pair.token1);
      if (refreshed) refreshedPairs.push(refreshed);
      else {
        // if the pool is not found, we need to log the error and add the original pool back in
        AlphaRouter.logV2PoolRefreshError(pair);
        refreshedPairs.push(pair);
      }
    }

    return cloneV2RouteWithNewPools(route, refreshedPairs);
  }

  /**
   * Refreshes the V3 pools for the given route.
   *
   * @param route the route to refresh the V3 pools for
   * @param config the routing config
   * @param v3PoolProvider the V3 pool provider
   * @returns the refreshed route
   */
  protected static async refreshV3Pools(
    route: V3Route,
    config: AlphaRouterConfig,
    v3PoolProvider: IV3PoolProvider
  ): Promise<V3Route> {
    const refreshedPools: V3Pool[] = [];
    for (const pool of route.pools) {
      const v3Pools = await v3PoolProvider.getPools(
        [[pool.token0, pool.token1, pool.fee]],
        config
      );
      const refreshed = v3Pools.getPool(pool.token0, pool.token1, pool.fee);
      if (refreshed) refreshedPools.push(refreshed);
      else {
        // if the pool is not found, we need to log the error and add the original pool back in
        AlphaRouter.logV3PoolRefreshError(pool);
        refreshedPools.push(pool);
      }
    }

    return cloneV3RouteWithNewPools(route, refreshedPools);
  }

  /**
   * Refreshes the V4 pools for the given route.
   *
   * @param route the route to refresh the V4 pools for
   * @param config the routing config
   * @param v4PoolProvider the V4 pool provider
   * @returns the refreshed route
   */
  protected static async refreshV4Pools(
    route: V4Route,
    config: AlphaRouterConfig,
    v4PoolProvider: IV4PoolProvider
  ): Promise<V4Route> {
    const refreshedPools: V4Pool[] = [];
    for (const pool of route.pools) {
      const v4Pools = await v4PoolProvider.getPools(
        [
          [
            pool.currency0,
            pool.currency1,
            pool.fee,
            pool.tickSpacing,
            pool.hooks,
          ],
        ],
        config
      );
      const refreshed = v4Pools.getPool(
        pool.currency0,
        pool.currency1,
        pool.fee,
        pool.tickSpacing,
        pool.hooks
      );
      if (refreshed) refreshedPools.push(refreshed);
      else {
        // if the pool is not found, we need to log the error and add the original pool back in
        AlphaRouter.logV4PoolRefreshError(pool);
        refreshedPools.push(pool);
      }
    }

    return cloneV4RouteWithNewPools(route, refreshedPools);
  }

  /**
   * Refreshes the mixed pools for the given route.
   *
   * @param route the route to refresh the mixed pools for
   * @param config the routing config
   * @param v2PoolProvider the V2 pool provider
   * @param v3PoolProvider the V3 pool provider
   * @param v4PoolProvider the V4 pool provider
   * @returns the refreshed route
   */
  protected static async refreshMixedPools(
    route: MixedRoute,
    config: AlphaRouterConfig,
    v2PoolProvider: IV2PoolProvider,
    v3PoolProvider: IV3PoolProvider,
    v4PoolProvider: IV4PoolProvider
  ): Promise<MixedRoute> {
    const refreshedPools: MixedPool[] = [];
    for (const pool of route.pools) {
      if (pool instanceof V2Pool) {
        const v2Pools = await v2PoolProvider.getPools(
          [[pool.token0, pool.token1]],
          config
        );
        const refreshed = v2Pools.getPool(pool.token0, pool.token1);
        if (refreshed) refreshedPools.push(refreshed);
        else {
          // if the pool is not found, we need to log the error and add the original pool back in
          AlphaRouter.logV2PoolRefreshError(pool);
          refreshedPools.push(pool);
        }
      } else if (pool instanceof V3Pool) {
        const v3Pools = await v3PoolProvider.getPools(
          [[pool.token0, pool.token1, pool.fee]],
          config
        );
        const refreshed = v3Pools.getPool(pool.token0, pool.token1, pool.fee);
        if (refreshed) refreshedPools.push(refreshed);
        else {
          // if the pool is not found, we need to log the error and add the original pool back in
          AlphaRouter.logV3PoolRefreshError(pool);
          refreshedPools.push(pool);
        }
      } else if (pool instanceof V4Pool) {
        const v4Pools = await v4PoolProvider.getPools(
          [
            [
              pool.currency0,
              pool.currency1,
              pool.fee,
              pool.tickSpacing,
              pool.hooks,
            ],
          ],
          config
        );
        const refreshed = v4Pools.getPool(
          pool.currency0,
          pool.currency1,
          pool.fee,
          pool.tickSpacing,
          pool.hooks
        );
        if (refreshed) refreshedPools.push(refreshed);
        else {
          // if the pool is not found, we need to log the error and add the original pool back in
          AlphaRouter.logV4PoolRefreshError(pool);
          refreshedPools.push(pool);
        }
      } else {
        throw new Error('Unknown pool type in mixed route');
      }
    }

    return cloneMixedRouteWithNewPools(route, refreshedPools);
  }

  private static logV2PoolRefreshError(v2Pool: V2Pool) {
    log.error(
      {
        token0: v2Pool.token0,
        token1: v2Pool.token1,
      },
      'Failed to refresh V2 pool'
    );
  }

  private static logV3PoolRefreshError(v3Pool: V3Pool) {
    log.error(
      {
        token0: v3Pool.token0,
        token1: v3Pool.token1,
        fee: v3Pool.fee,
      },
      'Failed to refresh V3 pool'
    );
  }

  private static logV4PoolRefreshError(v4Pool: V4Pool) {
    log.error(
      {
        token0: v4Pool.currency0,
        token1: v4Pool.currency1,
        fee: v4Pool.fee,
        tickSpacing: v4Pool.tickSpacing,
        hooks: v4Pool.hooks,
      },
      'Failed to refresh V4 pool'
    );
  }

  private async setCachedRoutesAndLog(
    amount: CurrencyAmount,
    currencyIn: Currency,
    currencyOut: Currency,
    tradeType: TradeType,
    metricsPrefix: string,
    routesToCache?: CachedRoutes,
    cachedRoutesRouteIds?: string
  ): Promise<void> {
    if (routesToCache) {
      const cachedRoutesChanged =
        cachedRoutesRouteIds !== undefined &&
        // it's possible that top cached routes may be split routes,
        // so that we always serialize all the top 8 retrieved cached routes vs the top routes.
        !cachedRoutesRouteIds.startsWith(
          serializeRouteIds(routesToCache.routes.map((r) => r.routeId))
        );

      if (cachedRoutesChanged) {
        metric.putMetric('cachedRoutesChanged', 1, MetricLoggerUnit.Count);
        metric.putMetric(
          `cachedRoutesChanged_chainId${currencyIn.chainId}`,
          1,
          MetricLoggerUnit.Count
        );
        metric.putMetric(
          `cachedRoutesChanged_chainId${currencyOut.chainId}_pair${currencyIn.symbol}${currencyOut.symbol}`,
          1,
          MetricLoggerUnit.Count
        );
      } else {
        metric.putMetric('cachedRoutesNotChanged', 1, MetricLoggerUnit.Count);
        metric.putMetric(
          `cachedRoutesNotChanged_chainId${currencyIn.chainId}`,
          1,
          MetricLoggerUnit.Count
        );
        metric.putMetric(
          `cachedRoutesNotChanged_chainId${currencyOut.chainId}_pair${currencyIn.symbol}${currencyOut.symbol}`,
          1,
          MetricLoggerUnit.Count
        );
      }

      await this.routeCachingProvider
        ?.setCachedRoute(routesToCache, amount)
        .then((success) => {
          const status = success ? 'success' : 'rejected';
          metric.putMetric(
            `${metricsPrefix}_${status}`,
            1,
            MetricLoggerUnit.Count
          );
        })
        .catch((reason) => {
          log.error(
            {
              reason: reason,
              tokenPair: this.tokenPairSymbolTradeTypeChainId(
                currencyIn,
                currencyOut,
                tradeType
              ),
            },
            `SetCachedRoute failure`
          );

          metric.putMetric(
            `${metricsPrefix}_failure`,
            1,
            MetricLoggerUnit.Count
          );
        });
    } else {
      metric.putMetric(
        `${metricsPrefix}_unnecessary`,
        1,
        MetricLoggerUnit.Count
      );
    }
  }

  private async getSwapRouteFromCache(
    currencyIn: Currency,
    currencyOut: Currency,
    cachedRoutes: CachedRoutes,
    blockNumber: number,
    amount: CurrencyAmount,
    quoteCurrency: Currency,
    tradeType: TradeType,
    routingConfig: AlphaRouterConfig,
    v3GasModel: IGasModel<V3RouteWithValidQuote>,
    v4GasModel: IGasModel<V4RouteWithValidQuote>,
    mixedRouteGasModel: IGasModel<MixedRouteWithValidQuote>,
    gasPriceWei: BigNumber,
    v2GasModel?: IGasModel<V2RouteWithValidQuote>,
    swapConfig?: SwapOptions,
    providerConfig?: ProviderConfig
  ): Promise<BestSwapRoute | null> {
    const tokenPairProperties =
      await this.tokenPropertiesProvider.getTokensProperties(
        [currencyIn, currencyOut],
        providerConfig
      );

    const sellTokenIsFot =
      tokenPairProperties[
        getAddressLowerCase(currencyIn)
      ]?.tokenFeeResult?.sellFeeBps?.gt(0);
    const buyTokenIsFot =
      tokenPairProperties[
        getAddressLowerCase(currencyOut)
      ]?.tokenFeeResult?.buyFeeBps?.gt(0);
    const fotInDirectSwap = sellTokenIsFot || buyTokenIsFot;

    log.info(
      {
        protocols: cachedRoutes.protocolsCovered,
        tradeType: cachedRoutes.tradeType,
        cachedBlockNumber: cachedRoutes.blockNumber,
        quoteBlockNumber: blockNumber,
      },
      'Routing across CachedRoute'
    );
    const quotePromises: Promise<GetQuotesResult>[] = [];

    const v4Routes = cachedRoutes.routes.filter(
      (route) => route.protocol === Protocol.V4
    );
    const v3Routes = cachedRoutes.routes.filter(
      (route) => route.protocol === Protocol.V3
    );
    const v2Routes = cachedRoutes.routes.filter(
      (route) => route.protocol === Protocol.V2
    );
    const mixedRoutes = cachedRoutes.routes.filter(
      (route) => route.protocol === Protocol.MIXED
    );

    let percents: number[];
    let amounts: CurrencyAmount[];
    if (cachedRoutes.routes.length > 1) {
      // If we have more than 1 route, we will quote the different percents for it, following the regular process
      [percents, amounts] = this.getAmountDistribution(amount, routingConfig);
    } else if (cachedRoutes.routes.length == 1) {
      [percents, amounts] = [[100], [amount]];
    } else {
      // In this case this means that there's no route, so we return null
      return Promise.resolve(null);
    }

    if (v4Routes.length > 0) {
      const v4RoutesFromCache: V4Route[] = v4Routes.map(
        (cachedRoute) => cachedRoute.route as V4Route
      );
      metric.putMetric(
        'SwapRouteFromCache_V4_GetQuotes_Request',
        1,
        MetricLoggerUnit.Count
      );

      const beforeGetQuotes = Date.now();

      quotePromises.push(
        this.v4Quoter
          .getQuotes(
            v4RoutesFromCache,
            amounts,
            percents,
            quoteCurrency,
            tradeType,
            routingConfig,
            undefined,
            v4GasModel
          )
          .then((result) => {
            metric.putMetric(
              `SwapRouteFromCache_V4_GetQuotes_Load`,
              Date.now() - beforeGetQuotes,
              MetricLoggerUnit.Milliseconds
            );

            return result;
          })
      );
    }

    if (!fotInDirectSwap) {
      if (v3Routes.length > 0) {
        const v3RoutesFromCache: V3Route[] = v3Routes.map(
          (cachedRoute) => cachedRoute.route as V3Route
        );
        metric.putMetric(
          'SwapRouteFromCache_V3_GetQuotes_Request',
          1,
          MetricLoggerUnit.Count
        );

        const beforeGetQuotes = Date.now();

        quotePromises.push(
          this.v3Quoter
            .getQuotes(
              v3RoutesFromCache,
              amounts,
              percents,
              quoteCurrency.wrapped,
              tradeType,
              routingConfig,
              undefined,
              v3GasModel
            )
            .then((result) => {
              metric.putMetric(
                `SwapRouteFromCache_V3_GetQuotes_Load`,
                Date.now() - beforeGetQuotes,
                MetricLoggerUnit.Milliseconds
              );

              return result;
            })
        );
      }
    }

    if (v2Routes.length > 0) {
      const v2RoutesFromCache: V2Route[] = v2Routes.map(
        (cachedRoute) => cachedRoute.route as V2Route
      );
      metric.putMetric(
        'SwapRouteFromCache_V2_GetQuotes_Request',
        1,
        MetricLoggerUnit.Count
      );

      const beforeGetQuotes = Date.now();

      quotePromises.push(
        this.v2Quoter
          .refreshRoutesThenGetQuotes(
            cachedRoutes.currencyIn.wrapped,
            cachedRoutes.currencyOut.wrapped,
            v2RoutesFromCache,
            amounts,
            percents,
            quoteCurrency.wrapped,
            tradeType,
            routingConfig,
            gasPriceWei
          )
          .then((result) => {
            metric.putMetric(
              `SwapRouteFromCache_V2_GetQuotes_Load`,
              Date.now() - beforeGetQuotes,
              MetricLoggerUnit.Milliseconds
            );

            return result;
          })
      );
    }

    if (!fotInDirectSwap) {
      if (mixedRoutes.length > 0) {
        const mixedRoutesFromCache: MixedRoute[] = mixedRoutes.map(
          (cachedRoute) => cachedRoute.route as MixedRoute
        );
        metric.putMetric(
          'SwapRouteFromCache_Mixed_GetQuotes_Request',
          1,
          MetricLoggerUnit.Count
        );

        const beforeGetQuotes = Date.now();

        quotePromises.push(
          this.mixedQuoter
            .getQuotes(
              mixedRoutesFromCache,
              amounts,
              percents,
              quoteCurrency.wrapped,
              tradeType,
              routingConfig,
              undefined,
              mixedRouteGasModel
            )
            .then((result) => {
              metric.putMetric(
                `SwapRouteFromCache_Mixed_GetQuotes_Load`,
                Date.now() - beforeGetQuotes,
                MetricLoggerUnit.Milliseconds
              );

              return result;
            })
        );
      }
    }

    const getQuotesResults = await Promise.all(quotePromises);
    const allRoutesWithValidQuotes = _.flatMap(
      getQuotesResults,
      (quoteResult) => quoteResult.routesWithValidQuotes
    );

    return getBestSwapRoute(
      amount,
      percents,
      allRoutesWithValidQuotes,
      tradeType,
      this.chainId,
      routingConfig,
      this.portionProvider,
      v2GasModel,
      v3GasModel,
      v4GasModel,
      swapConfig,
      providerConfig
    );
  }

  private async getSwapRouteFromChain(
    amount: CurrencyAmount,
    currencyIn: Currency,
    currencyOut: Currency,
    protocols: Protocol[],
    quoteCurrency: Currency,
    tradeType: TradeType,
    routingConfig: AlphaRouterConfig,
    v3GasModel: IGasModel<V3RouteWithValidQuote>,
    v4GasModel: IGasModel<V4RouteWithValidQuote>,
    mixedRouteGasModel: IGasModel<MixedRouteWithValidQuote>,
    gasPriceWei: BigNumber,
    v2GasModel?: IGasModel<V2RouteWithValidQuote>,
    swapConfig?: SwapOptions,
    providerConfig?: ProviderConfig
  ): Promise<BestSwapRoute | null> {
    const tokenPairProperties =
      await this.tokenPropertiesProvider.getTokensProperties(
        [currencyIn, currencyOut],
        providerConfig
      );

    const sellTokenIsFot =
      tokenPairProperties[
        getAddressLowerCase(currencyIn)
      ]?.tokenFeeResult?.sellFeeBps?.gt(0);
    const buyTokenIsFot =
      tokenPairProperties[
        getAddressLowerCase(currencyOut)
      ]?.tokenFeeResult?.buyFeeBps?.gt(0);
    const fotInDirectSwap = sellTokenIsFot || buyTokenIsFot;

    // Generate our distribution of amounts, i.e. fractions of the input amount.
    // We will get quotes for fractions of the input amount for different routes, then
    // combine to generate split routes.
    const [percents, amounts] = this.getAmountDistribution(
      amount,
      routingConfig
    );

    const noProtocolsSpecified = protocols.length === 0;
    const v4ProtocolSpecified = protocols.includes(Protocol.V4);
    const v3ProtocolSpecified = protocols.includes(Protocol.V3);
    const v2ProtocolSpecified = protocols.includes(Protocol.V2);
    const v2SupportedInChain = this.v2Supported?.includes(this.chainId);
    const v4SupportedInChain = this.v4Supported?.includes(this.chainId);
    const shouldQueryMixedProtocol =
      protocols.includes(Protocol.MIXED) ||
      (noProtocolsSpecified && v2SupportedInChain && v4SupportedInChain);
    const mixedProtocolAllowed =
      this.mixedSupported?.includes(this.chainId) &&
      tradeType === TradeType.EXACT_INPUT;

    const beforeGetCandidates = Date.now();

    let v4CandidatePoolsPromise: Promise<V4CandidatePools | undefined> =
      Promise.resolve(undefined);

    // we are explicitly requiring people to specify v4 for now
    if (v4SupportedInChain && (v4ProtocolSpecified || noProtocolsSpecified)) {
      // if (v4ProtocolSpecified || noProtocolsSpecified) {
      v4CandidatePoolsPromise = getV4CandidatePools({
        currencyIn: currencyIn,
        currencyOut: currencyOut,
        tokenProvider: this.tokenProvider,
        blockedTokenListProvider: this.blockedTokenListProvider,
        poolProvider: this.v4PoolProvider,
        routeType: tradeType,
        subgraphProvider: this.v4SubgraphProvider,
        routingConfig,
        chainId: this.chainId,
        v4PoolParams: this.v4PoolParams,
      }).then((candidatePools) => {
        metric.putMetric(
          'GetV4CandidatePools',
          Date.now() - beforeGetCandidates,
          MetricLoggerUnit.Milliseconds
        );
        return candidatePools;
      });
    }

    let v3CandidatePoolsPromise: Promise<V3CandidatePools | undefined> =
      Promise.resolve(undefined);
    if (!fotInDirectSwap) {
      if (v3ProtocolSpecified || noProtocolsSpecified) {
        const tokenIn = currencyIn.wrapped;
        const tokenOut = currencyOut.wrapped;

        v3CandidatePoolsPromise = getV3CandidatePools({
          tokenIn,
          tokenOut,
          tokenProvider: this.tokenProvider,
          blockedTokenListProvider: this.blockedTokenListProvider,
          poolProvider: this.v3PoolProvider,
          routeType: tradeType,
          subgraphProvider: this.v3SubgraphProvider,
          routingConfig,
          chainId: this.chainId,
        }).then((candidatePools) => {
          metric.putMetric(
            'GetV3CandidatePools',
            Date.now() - beforeGetCandidates,
            MetricLoggerUnit.Milliseconds
          );
          return candidatePools;
        });
      }
    }

    let v2CandidatePoolsPromise: Promise<V2CandidatePools | undefined> =
      Promise.resolve(undefined);
    if (v2SupportedInChain && (v2ProtocolSpecified || noProtocolsSpecified)) {
      const tokenIn = currencyIn.wrapped;
      const tokenOut = currencyOut.wrapped;

      // Fetch all the pools that we will consider routing via. There are thousands
      // of pools, so we filter them to a set of candidate pools that we expect will
      // result in good prices.
      v2CandidatePoolsPromise = getV2CandidatePools({
        tokenIn,
        tokenOut,
        tokenProvider: this.tokenProvider,
        blockedTokenListProvider: this.blockedTokenListProvider,
        poolProvider: this.v2PoolProvider,
        routeType: tradeType,
        subgraphProvider: this.v2SubgraphProvider,
        routingConfig,
        chainId: this.chainId,
      }).then((candidatePools) => {
        metric.putMetric(
          'GetV2CandidatePools',
          Date.now() - beforeGetCandidates,
          MetricLoggerUnit.Milliseconds
        );
        return candidatePools;
      });
    }

    const quotePromises: Promise<GetQuotesResult>[] = [];

    // for v4, for now we explicitly require people to specify
    if (v4SupportedInChain && v4ProtocolSpecified) {
      log.info({ protocols, tradeType }, 'Routing across V4');

      metric.putMetric(
        'SwapRouteFromChain_V4_GetRoutesThenQuotes_Request',
        1,
        MetricLoggerUnit.Count
      );
      const beforeGetRoutesThenQuotes = Date.now();

      quotePromises.push(
        v4CandidatePoolsPromise.then((v4CandidatePools) =>
          this.v4Quoter
            .getRoutesThenQuotes(
              currencyIn,
              currencyOut,
              amount,
              amounts,
              percents,
              quoteCurrency,
              v4CandidatePools!,
              tradeType,
              routingConfig,
              v4GasModel
            )
            .then((result) => {
              metric.putMetric(
                `SwapRouteFromChain_V4_GetRoutesThenQuotes_Load`,
                Date.now() - beforeGetRoutesThenQuotes,
                MetricLoggerUnit.Milliseconds
              );

              return result;
            })
        )
      );
    }

    if (!fotInDirectSwap) {
      // Maybe Quote V3 - if V3 is specified, or no protocol is specified
      if (v3ProtocolSpecified || noProtocolsSpecified) {
        log.info({ protocols, tradeType }, 'Routing across V3');

        metric.putMetric(
          'SwapRouteFromChain_V3_GetRoutesThenQuotes_Request',
          1,
          MetricLoggerUnit.Count
        );
        const beforeGetRoutesThenQuotes = Date.now();
        const tokenIn = currencyIn.wrapped;
        const tokenOut = currencyOut.wrapped;

        quotePromises.push(
          v3CandidatePoolsPromise.then((v3CandidatePools) =>
            this.v3Quoter
              .getRoutesThenQuotes(
                tokenIn,
                tokenOut,
                amount,
                amounts,
                percents,
                quoteCurrency.wrapped,
                v3CandidatePools!,
                tradeType,
                routingConfig,
                v3GasModel
              )
              .then((result) => {
                metric.putMetric(
                  `SwapRouteFromChain_V3_GetRoutesThenQuotes_Load`,
                  Date.now() - beforeGetRoutesThenQuotes,
                  MetricLoggerUnit.Milliseconds
                );

                return result;
              })
          )
        );
      }
    }

    // Maybe Quote V2 - if V2 is specified, or no protocol is specified AND v2 is supported in this chain
    if (v2SupportedInChain && (v2ProtocolSpecified || noProtocolsSpecified)) {
      log.info({ protocols, tradeType }, 'Routing across V2');

      metric.putMetric(
        'SwapRouteFromChain_V2_GetRoutesThenQuotes_Request',
        1,
        MetricLoggerUnit.Count
      );
      const beforeGetRoutesThenQuotes = Date.now();
      const tokenIn = currencyIn.wrapped;
      const tokenOut = currencyOut.wrapped;

      quotePromises.push(
        v2CandidatePoolsPromise.then((v2CandidatePools) =>
          this.v2Quoter
            .getRoutesThenQuotes(
              tokenIn,
              tokenOut,
              amount,
              amounts,
              percents,
              quoteCurrency.wrapped,
              v2CandidatePools!,
              tradeType,
              routingConfig,
              v2GasModel,
              gasPriceWei
            )
            .then((result) => {
              metric.putMetric(
                `SwapRouteFromChain_V2_GetRoutesThenQuotes_Load`,
                Date.now() - beforeGetRoutesThenQuotes,
                MetricLoggerUnit.Milliseconds
              );

              return result;
            })
        )
      );
    }

    if (!fotInDirectSwap) {
      // Maybe Quote mixed routes
      // if MixedProtocol is specified or no protocol is specified and v2 is supported AND tradeType is ExactIn
      // AND is Mainnet or Gorli
      // Also make sure there are at least 2 protocols provided besides MIXED, before entering mixed quoter
      if (
        shouldQueryMixedProtocol &&
        mixedProtocolAllowed &&
        protocols.filter((protocol) => protocol !== Protocol.MIXED).length >= 2
      ) {
        log.info({ protocols, tradeType }, 'Routing across MixedRoutes');

        metric.putMetric(
          'SwapRouteFromChain_Mixed_GetRoutesThenQuotes_Request',
          1,
          MetricLoggerUnit.Count
        );
        const beforeGetRoutesThenQuotes = Date.now();

        quotePromises.push(
          Promise.all([
            v4CandidatePoolsPromise,
            v3CandidatePoolsPromise,
            v2CandidatePoolsPromise,
          ]).then(
            async ([v4CandidatePools, v3CandidatePools, v2CandidatePools]) => {
              const tokenIn = currencyIn.wrapped;
              const tokenOut = currencyOut.wrapped;

              const crossLiquidityPools =
                await getMixedCrossLiquidityCandidatePools({
                  tokenIn,
                  tokenOut,
                  blockNumber: routingConfig.blockNumber,
                  v2SubgraphProvider: this.v2SubgraphProvider,
                  v3SubgraphProvider: this.v3SubgraphProvider,
                  v2Candidates: v2CandidatePools,
                  v3Candidates: v3CandidatePools,
                  v4Candidates: v4CandidatePools,
                });

              return this.mixedQuoter
                .getRoutesThenQuotes(
                  tokenIn,
                  tokenOut,
                  amount,
                  amounts,
                  percents,
                  quoteCurrency.wrapped,
                  [
                    v4CandidatePools,
                    v3CandidatePools,
                    v2CandidatePools,
                    crossLiquidityPools,
                  ],
                  tradeType,
                  routingConfig,
                  mixedRouteGasModel
                )
                .then((result) => {
                  metric.putMetric(
                    `SwapRouteFromChain_Mixed_GetRoutesThenQuotes_Load`,
                    Date.now() - beforeGetRoutesThenQuotes,
                    MetricLoggerUnit.Milliseconds
                  );

                  return result;
                });
            }
          )
        );
      }
    }

    const getQuotesResults = await Promise.all(quotePromises);

    const allRoutesWithValidQuotes: RouteWithValidQuote[] = [];
    const allCandidatePools: CandidatePoolsBySelectionCriteria[] = [];
    getQuotesResults.forEach((getQuoteResult) => {
      allRoutesWithValidQuotes.push(...getQuoteResult.routesWithValidQuotes);
      if (getQuoteResult.candidatePools) {
        allCandidatePools.push(getQuoteResult.candidatePools);
      }
    });

    if (allRoutesWithValidQuotes.length === 0) {
      log.info({ allRoutesWithValidQuotes }, 'Received no valid quotes');
      return null;
    }

    // Given all the quotes for all the amounts for all the routes, find the best combination.
    const bestSwapRoute = await getBestSwapRoute(
      amount,
      percents,
      allRoutesWithValidQuotes,
      tradeType,
      this.chainId,
      routingConfig,
      this.portionProvider,
      v2GasModel,
      v3GasModel,
      v4GasModel,
      swapConfig,
      providerConfig
    );

    if (bestSwapRoute) {
      this.emitPoolSelectionMetrics(
        bestSwapRoute,
        allCandidatePools,
        currencyIn,
        currencyOut
      );
    }

    return bestSwapRoute;
  }

  private tradeTypeStr(tradeType: TradeType): string {
    return tradeType === TradeType.EXACT_INPUT ? 'ExactIn' : 'ExactOut';
  }

  private tokenPairSymbolTradeTypeChainId(
    currencyIn: Currency,
    currencyOut: Currency,
    tradeType: TradeType
  ) {
    return `${currencyIn.symbol}/${currencyOut.symbol}/${this.tradeTypeStr(
      tradeType
    )}/${this.chainId}`;
  }

  private determineCurrencyInOutFromTradeType(
    tradeType: TradeType,
    amount: CurrencyAmount,
    quoteCurrency: Currency
  ) {
    if (tradeType === TradeType.EXACT_INPUT) {
      return {
        currencyIn: amount.currency,
        currencyOut: quoteCurrency,
      };
    } else {
      return {
        currencyIn: quoteCurrency,
        currencyOut: amount.currency,
      };
    }
  }

  private async getGasPriceWei(
    latestBlockNumber: number,
    requestBlockNumber?: number
  ): Promise<BigNumber> {
    // Track how long it takes to resolve this async call.
    const beforeGasTimestamp = Date.now();

    // Get an estimate of the gas price to use when estimating gas cost of different routes.
    const { gasPriceWei } = await this.gasPriceProvider.getGasPrice(
      latestBlockNumber,
      requestBlockNumber
    );

    metric.putMetric(
      'GasPriceLoad',
      Date.now() - beforeGasTimestamp,
      MetricLoggerUnit.Milliseconds
    );

    return gasPriceWei;
  }

  private async getGasModels(
    gasPriceWei: BigNumber,
    amountToken: Token,
    quoteToken: Token,
    providerConfig?: GasModelProviderConfig
  ): Promise<GasModelType> {
    const beforeGasModel = Date.now();

    const usdPoolPromise = getHighestLiquidityV3USDPool(
      this.chainId,
      this.v3PoolProvider,
      providerConfig
    );
    const nativeCurrency = WRAPPED_NATIVE_CURRENCY[this.chainId];
    const nativeAndQuoteTokenV3PoolPromise = !quoteToken.equals(nativeCurrency)
      ? getHighestLiquidityV3NativePool(
          quoteToken,
          this.v3PoolProvider,
          providerConfig
        )
      : Promise.resolve(null);
    const nativeAndAmountTokenV3PoolPromise = !amountToken.equals(
      nativeCurrency
    )
      ? getHighestLiquidityV3NativePool(
          amountToken,
          this.v3PoolProvider,
          providerConfig
        )
      : Promise.resolve(null);

    // If a specific gas token is specified in the provider config
    // fetch the highest liq V3 pool with it and the native currency
    const nativeAndSpecifiedGasTokenV3PoolPromise =
      providerConfig?.gasToken &&
      !providerConfig?.gasToken.equals(nativeCurrency)
        ? getHighestLiquidityV3NativePool(
            providerConfig?.gasToken,
            this.v3PoolProvider,
            providerConfig
          )
        : Promise.resolve(null);

    const [
      usdPool,
      nativeAndQuoteTokenV3Pool,
      nativeAndAmountTokenV3Pool,
      nativeAndSpecifiedGasTokenV3Pool,
    ] = await Promise.all([
      usdPoolPromise,
      nativeAndQuoteTokenV3PoolPromise,
      nativeAndAmountTokenV3PoolPromise,
      nativeAndSpecifiedGasTokenV3PoolPromise,
    ]);

    const pools: LiquidityCalculationPools = {
      usdPool: usdPool,
      nativeAndQuoteTokenV3Pool: nativeAndQuoteTokenV3Pool,
      nativeAndAmountTokenV3Pool: nativeAndAmountTokenV3Pool,
      nativeAndSpecifiedGasTokenV3Pool: nativeAndSpecifiedGasTokenV3Pool,
    };

    const v2GasModelPromise = this.v2Supported?.includes(this.chainId)
      ? this.v2GasModelFactory
          .buildGasModel({
            chainId: this.chainId,
            gasPriceWei,
            poolProvider: this.v2PoolProvider,
            token: quoteToken,
            l2GasDataProvider: this.l2GasDataProvider,
            providerConfig: providerConfig,
          })
          .catch((_) => undefined) // If v2 model throws uncaught exception, we return undefined v2 gas model, so there's a chance v3 route can go through
      : Promise.resolve(undefined);

    const v3GasModelPromise = this.v3GasModelFactory.buildGasModel({
      chainId: this.chainId,
      gasPriceWei,
      pools,
      amountToken,
      quoteToken,
      v2poolProvider: this.v2PoolProvider,
      l2GasDataProvider: this.l2GasDataProvider,
      providerConfig: providerConfig,
    });

    const v4GasModelPromise = this.v4GasModelFactory.buildGasModel({
      chainId: this.chainId,
      gasPriceWei,
      pools,
      amountToken,
      quoteToken,
      v2poolProvider: this.v2PoolProvider,
      l2GasDataProvider: this.l2GasDataProvider,
      providerConfig: providerConfig,
    });

    const mixedRouteGasModelPromise =
      this.mixedRouteGasModelFactory.buildGasModel({
        chainId: this.chainId,
        gasPriceWei,
        pools,
        amountToken,
        quoteToken,
        v2poolProvider: this.v2PoolProvider,
        providerConfig: providerConfig,
      });

    const [v2GasModel, v3GasModel, V4GasModel, mixedRouteGasModel] =
      await Promise.all([
        v2GasModelPromise,
        v3GasModelPromise,
        v4GasModelPromise,
        mixedRouteGasModelPromise,
      ]);

    metric.putMetric(
      'GasModelCreation',
      Date.now() - beforeGasModel,
      MetricLoggerUnit.Milliseconds
    );

    return {
      v2GasModel: v2GasModel,
      v3GasModel: v3GasModel,
      v4GasModel: V4GasModel,
      mixedRouteGasModel: mixedRouteGasModel,
    } as GasModelType;
  }

  // Note multiplications here can result in a loss of precision in the amounts (e.g. taking 50% of 101)
  // This is reconcilled at the end of the algorithm by adding any lost precision to one of
  // the splits in the route.
  private getAmountDistribution(
    amount: CurrencyAmount,
    routingConfig: AlphaRouterConfig
  ): [number[], CurrencyAmount[]] {
    const { distributionPercent } = routingConfig;
    const percents = [];
    const amounts = [];

    for (let i = 1; i <= 100 / distributionPercent; i++) {
      percents.push(i * distributionPercent);
      amounts.push(amount.multiply(new Fraction(i * distributionPercent, 100)));
    }

    return [percents, amounts];
  }

  private async buildSwapAndAddMethodParameters(
    trade: Trade<Currency, Currency, TradeType>,
    swapAndAddOptions: SwapAndAddOptions,
    swapAndAddParameters: SwapAndAddParameters
  ): Promise<MethodParameters> {
    const {
      swapOptions: { recipient, slippageTolerance, deadline, inputTokenPermit },
      addLiquidityOptions: addLiquidityConfig,
    } = swapAndAddOptions;

    const preLiquidityPosition = swapAndAddParameters.preLiquidityPosition;
    const finalBalanceTokenIn =
      swapAndAddParameters.initialBalanceTokenIn.subtract(trade.inputAmount);
    const finalBalanceTokenOut =
      swapAndAddParameters.initialBalanceTokenOut.add(trade.outputAmount);
    const approvalTypes = await this.swapRouterProvider.getApprovalType(
      finalBalanceTokenIn,
      finalBalanceTokenOut
    );
    const zeroForOne = finalBalanceTokenIn.currency.wrapped.sortsBefore(
      finalBalanceTokenOut.currency.wrapped
    );
    return {
      ...SwapRouter.swapAndAddCallParameters(
        trade,
        {
          recipient,
          slippageTolerance,
          deadlineOrPreviousBlockhash: deadline,
          inputTokenPermit,
        },
        Position.fromAmounts({
          pool: preLiquidityPosition.pool,
          tickLower: preLiquidityPosition.tickLower,
          tickUpper: preLiquidityPosition.tickUpper,
          amount0: zeroForOne
            ? finalBalanceTokenIn.quotient.toString()
            : finalBalanceTokenOut.quotient.toString(),
          amount1: zeroForOne
            ? finalBalanceTokenOut.quotient.toString()
            : finalBalanceTokenIn.quotient.toString(),
          useFullPrecision: false,
        }),
        addLiquidityConfig,
        approvalTypes.approvalTokenIn,
        approvalTypes.approvalTokenOut
      ),
      to: SWAP_ROUTER_02_ADDRESSES(this.chainId),
    };
  }

  private emitPoolSelectionMetrics(
    swapRouteRaw: {
      quote: CurrencyAmount;
      quoteGasAdjusted: CurrencyAmount;
      routes: RouteWithValidQuote[];
      estimatedGasUsed: BigNumber;
    },
    allPoolsBySelection: CandidatePoolsBySelectionCriteria[],
    currencyIn: Currency,
    currencyOut: Currency
  ) {
    const poolAddressesUsed = new Set<string>();
    const { routes: routeAmounts } = swapRouteRaw;
    _(routeAmounts)
      .flatMap((routeAmount) => {
        const { poolIdentifiers: poolAddresses } = routeAmount;
        return poolAddresses;
      })
      .forEach((address: string) => {
        poolAddressesUsed.add(address.toLowerCase());
      });

    for (const poolsBySelection of allPoolsBySelection) {
      const { protocol } = poolsBySelection;
      _.forIn(
        poolsBySelection.selections,
        (pools: SubgraphPool[], topNSelection: string) => {
          const topNUsed =
            _.findLastIndex(pools, (pool) =>
              poolAddressesUsed.has(pool.id.toLowerCase())
            ) + 1;
          metric.putMetric(
            _.capitalize(`${protocol}${topNSelection}`),
            topNUsed,
            MetricLoggerUnit.Count
          );
        }
      );
    }

    let hasV4Route = false;
    let hasV3Route = false;
    let hasV2Route = false;
    let hasMixedRoute = false;
    for (const routeAmount of routeAmounts) {
      if (routeAmount.protocol === Protocol.V4) {
        hasV4Route = true;
      }
      if (routeAmount.protocol === Protocol.V3) {
        hasV3Route = true;
      }
      if (routeAmount.protocol === Protocol.V2) {
        hasV2Route = true;
      }
      if (routeAmount.protocol === Protocol.MIXED) {
        hasMixedRoute = true;
      }
    }

    if (hasMixedRoute && (hasV4Route || hasV3Route || hasV2Route)) {
      let metricsPrefix = 'Mixed';

      if (hasV4Route) {
        metricsPrefix += 'AndV4';
      }

      if (hasV3Route) {
        metricsPrefix += 'AndV3';
      }

      if (hasV2Route) {
        metricsPrefix += 'AndV2';
      }

      metric.putMetric(`${metricsPrefix}SplitRoute`, 1, MetricLoggerUnit.Count);
      metric.putMetric(
        `${metricsPrefix}SplitRouteForChain${this.chainId}`,
        1,
        MetricLoggerUnit.Count
      );

      if (hasV4Route && (currencyIn.isNative || currencyOut.isNative)) {
        // Keep track of this edge case https://linear.app/uniswap/issue/ROUTE-303/tech-debt-split-route-can-have-different-ethweth-input-or-output#comment-bba53758
        metric.putMetric(
          `${metricsPrefix}SplitRouteWithNativeToken`,
          1,
          MetricLoggerUnit.Count
        );
        metric.putMetric(
          `${metricsPrefix}SplitRouteWithNativeTokenForChain${this.chainId}`,
          1,
          MetricLoggerUnit.Count
        );
      }
    } else if (hasV4Route && hasV3Route && hasV2Route) {
      metric.putMetric(`V4AndV3AndV2SplitRoute`, 1, MetricLoggerUnit.Count);
      metric.putMetric(
        `V4AndV3AndV2SplitRouteForChain${this.chainId}`,
        1,
        MetricLoggerUnit.Count
      );

      if (currencyIn.isNative || currencyOut.isNative) {
        // Keep track of this edge case https://linear.app/uniswap/issue/ROUTE-303/tech-debt-split-route-can-have-different-ethweth-input-or-output#comment-bba53758
        metric.putMetric(
          `V4AndV3AndV2SplitRouteWithNativeToken`,
          1,
          MetricLoggerUnit.Count
        );
        metric.putMetric(
          `V4AndV3AndV2SplitRouteWithNativeTokenForChain${this.chainId}`,
          1,
          MetricLoggerUnit.Count
        );
      }
    } else if (hasMixedRoute) {
      if (routeAmounts.length > 1) {
        metric.putMetric(`MixedSplitRoute`, 1, MetricLoggerUnit.Count);
        metric.putMetric(
          `MixedSplitRouteForChain${this.chainId}`,
          1,
          MetricLoggerUnit.Count
        );
      } else {
        metric.putMetric(`MixedRoute`, 1, MetricLoggerUnit.Count);
        metric.putMetric(
          `MixedRouteForChain${this.chainId}`,
          1,
          MetricLoggerUnit.Count
        );
      }
    } else if (hasV4Route) {
      if (routeAmounts.length > 1) {
        metric.putMetric(`V4SplitRoute`, 1, MetricLoggerUnit.Count);
        metric.putMetric(
          `V4SplitRouteForChain${this.chainId}`,
          1,
          MetricLoggerUnit.Count
        );
      }
    } else if (hasV3Route) {
      if (routeAmounts.length > 1) {
        metric.putMetric(`V3SplitRoute`, 1, MetricLoggerUnit.Count);
        metric.putMetric(
          `V3SplitRouteForChain${this.chainId}`,
          1,
          MetricLoggerUnit.Count
        );
      } else {
        metric.putMetric(`V3Route`, 1, MetricLoggerUnit.Count);
        metric.putMetric(
          `V3RouteForChain${this.chainId}`,
          1,
          MetricLoggerUnit.Count
        );
      }
    } else if (hasV2Route) {
      if (routeAmounts.length > 1) {
        metric.putMetric(`V2SplitRoute`, 1, MetricLoggerUnit.Count);
        metric.putMetric(
          `V2SplitRouteForChain${this.chainId}`,
          1,
          MetricLoggerUnit.Count
        );
      } else {
        metric.putMetric(`V2Route`, 1, MetricLoggerUnit.Count);
        metric.putMetric(
          `V2RouteForChain${this.chainId}`,
          1,
          MetricLoggerUnit.Count
        );
      }
    }
  }

  private calculateOptimalRatio(
    position: Position,
    sqrtRatioX96: JSBI,
    zeroForOne: boolean
  ): Fraction {
    const upperSqrtRatioX96 = TickMath.getSqrtRatioAtTick(position.tickUpper);
    const lowerSqrtRatioX96 = TickMath.getSqrtRatioAtTick(position.tickLower);

    // returns Fraction(0, 1) for any out of range position regardless of zeroForOne. Implication: function
    // cannot be used to determine the trading direction of out of range positions.
    if (
      JSBI.greaterThan(sqrtRatioX96, upperSqrtRatioX96) ||
      JSBI.lessThan(sqrtRatioX96, lowerSqrtRatioX96)
    ) {
      return new Fraction(0, 1);
    }

    const precision = JSBI.BigInt('1' + '0'.repeat(18));
    let optimalRatio = new Fraction(
      SqrtPriceMath.getAmount0Delta(
        sqrtRatioX96,
        upperSqrtRatioX96,
        precision,
        true
      ),
      SqrtPriceMath.getAmount1Delta(
        sqrtRatioX96,
        lowerSqrtRatioX96,
        precision,
        true
      )
    );
    if (!zeroForOne) optimalRatio = optimalRatio.invert();
    return optimalRatio;
  }

  public async userHasSufficientBalance(
    fromAddress: string,
    tradeType: TradeType,
    amount: CurrencyAmount,
    quote: CurrencyAmount
  ): Promise<boolean> {
    try {
      const neededBalance =
        tradeType === TradeType.EXACT_INPUT ? amount : quote;
      let balance;
      if (neededBalance.currency.isNative) {
        balance = await this.provider.getBalance(fromAddress);
      } else {
        const tokenContract = Erc20__factory.connect(
          neededBalance.currency.address,
          this.provider
        );
        balance = await tokenContract.balanceOf(fromAddress);
      }
      return balance.gte(BigNumber.from(neededBalance.quotient.toString()));
    } catch (e) {
      log.error(e, 'Error while checking user balance');
      return false;
    }
  }

  private absoluteValue(fraction: Fraction): Fraction {
    const numeratorAbs = JSBI.lessThan(fraction.numerator, JSBI.BigInt(0))
      ? JSBI.unaryMinus(fraction.numerator)
      : fraction.numerator;
    const denominatorAbs = JSBI.lessThan(fraction.denominator, JSBI.BigInt(0))
      ? JSBI.unaryMinus(fraction.denominator)
      : fraction.denominator;
    return new Fraction(numeratorAbs, denominatorAbs);
  }

  private getBlockNumberPromise(): number | Promise<number> {
    return retry(
      async (_b, attempt) => {
        if (attempt > 1) {
          log.info(`Get block number attempt ${attempt}`);
        }
        return this.provider.getBlockNumber();
      },
      {
        retries: 2,
        minTimeout: 100,
        maxTimeout: 1000,
      }
    );
  }

  // If we are requesting URv1.2, we need to keep entering cache
  // We want to skip cached routes access whenever "intent === INTENT.CACHING" or "hooksOption !== HooksOption.HOOKS_INCLUSIVE"
  // We keep this method as we might want to add more conditions in the future.
  public static isAllowedToEnterCachedRoutes(
    intent?: INTENT,
    hooksOptions?: HooksOptions,
    swapRouter?: boolean
  ): boolean {
    // intent takes highest precedence, as we need to ensure during caching intent, we do not enter cache no matter what
    if (intent !== undefined && intent === INTENT.CACHING) {
      return false;
    }

    // in case we have URv1.2 request during QUOTE intent, we assume cached routes correctly returns mixed route w/o v4, if mixed is best
    // or v2/v3 is the best.
    // implicitly it means hooksOptions no longer matters for URv1.2
    // swapRouter has higher precedence than hooksOptions, because in case of URv1.2, we set hooksOptions = NO_HOOKS as default,
    // but swapRouter does not have any v4 pool for routing, so swapRouter should always use caching during QUOTE intent.
    if (swapRouter) {
      return true;
    }

    // in case we have URv2.0, and we are in QUOTE intent, we only want to enter cache when hooksOptions is default, HOOKS_INCLUSIVE
    if (
      hooksOptions !== undefined &&
      hooksOptions !== HooksOptions.HOOKS_INCLUSIVE
    ) {
      return false;
    }

    return true;
  }
}
