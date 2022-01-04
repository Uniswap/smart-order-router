import DEFAULT_TOKEN_LIST from '@uniswap/default-token-list';
import { Protocol, SwapRouter, Trade } from '@uniswap/router-sdk';
import { Currency, Fraction, Token, TradeType } from '@uniswap/sdk-core';
import { TokenList } from '@uniswap/token-lists';
import { Route as V2RouteRaw } from '@uniswap/v2-sdk';
import {
  MethodParameters,
  Pool,
  Position,
  Route as V3RouteRaw,
  SqrtPriceMath,
  TickMath,
} from '@uniswap/v3-sdk';
import { BigNumber, providers } from 'ethers';
import JSBI from 'jsbi';
import _ from 'lodash';
import NodeCache from 'node-cache';
import { V3HeuristicGasModelFactory } from '.';
import {
  CachingGasStationProvider,
  CachingTokenProviderWithFallback,
  CachingV2SubgraphProvider,
  CachingV3PoolProvider,
  CachingV3SubgraphProvider,
  EIP1559GasPriceProvider,
  ETHGasStationInfoProvider,
  ISwapRouterProvider,
  IV2QuoteProvider,
  IV2SubgraphProvider,
  LegacyGasPriceProvider,
  NodeJSCache,
  OnChainGasPriceProvider,
  StaticV2SubgraphProvider,
  StaticV3SubgraphProvider,
  SwapRouterProvider,
  UniswapMulticallProvider,
  URISubgraphProvider,
  V2QuoteProvider,
  V2SubgraphProviderWithFallBacks,
  V3SubgraphProviderWithFallBacks,
} from '../../providers';
import {
  CachingTokenListProvider,
  ITokenListProvider,
} from '../../providers/caching-token-list-provider';
import {
  GasPrice,
  IGasPriceProvider,
} from '../../providers/gas-price-provider';
import { ITokenProvider, TokenProvider } from '../../providers/token-provider';
import {
  IV2PoolProvider,
  V2PoolProvider,
} from '../../providers/v2/pool-provider';
import {
  IV3PoolProvider,
  V3PoolProvider,
} from '../../providers/v3/pool-provider';
import {
  IV3QuoteProvider,
  V3QuoteProvider,
} from '../../providers/v3/quote-provider';
import { IV3SubgraphProvider } from '../../providers/v3/subgraph-provider';
import { CurrencyAmount } from '../../util/amounts';
import { ChainId, ID_TO_CHAIN_ID, ID_TO_NETWORK_NAME } from '../../util/chains';
import { log } from '../../util/log';
import { metric, MetricLoggerUnit } from '../../util/metric';
import { routeToString } from '../../util/routes';
import { UNSUPPORTED_TOKENS } from '../../util/unsupported-tokens';
import {
  IRouter,
  ISwapToRatio,
  SwapAndAddConfig,
  SwapAndAddOptions,
  SwapAndAddParameters,
  SwapOptions,
  SwapRoute,
  SwapToRatioResponse,
  SwapToRatioStatus,
} from '../router';
import {
  DEFAULT_ROUTING_CONFIG_BY_CHAIN,
  ETH_GAS_STATION_API_URL,
} from './config';
import {
  RouteWithValidQuote,
  V2RouteWithValidQuote,
  V3RouteWithValidQuote,
} from './entities/route-with-valid-quote';
import { getBestSwapRoute } from './functions/best-swap-route';
import { calculateRatioAmountIn } from './functions/calculate-ratio-amount-in';
import {
  computeAllV2Routes,
  computeAllV3Routes,
} from './functions/compute-all-routes';
import {
  CandidatePoolsBySelectionCriteria,
  getV2CandidatePools,
  getV3CandidatePools as getV3CandidatePools,
  PoolId,
} from './functions/get-candidate-pools';
import { IV2GasModelFactory, IV3GasModelFactory } from './gas-models/gas-model';
import { V2HeuristicGasModelFactory } from './gas-models/v2/v2-heuristic-gas-model';

export type AlphaRouterParams = {
  /**
   * The chain id for this instance of the Alpha Router.
   */
  chainId: ChainId;
  /**
   * The Web3 provider for getting on-chain data.
   */
  provider: providers.BaseProvider;
  /**
   * The provider to use for making multicalls. Used for getting on-chain data
   * like pools, tokens, quotes in batch.
   */
  multicall2Provider?: UniswapMulticallProvider;
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
  v3QuoteProvider?: IV3QuoteProvider;
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
   * V3 routes.
   */
  v3GasModelFactory?: IV3GasModelFactory;
  /**
   * A factory for generating a gas model that is used when estimating the gas used by
   * V2 routes.
   */
  v2GasModelFactory?: IV2GasModelFactory;
  /**
   * A token list that specifies Token that should be blocked from routing through.
   * Defaults to Uniswap's unsupported token list.
   */
  blockedTokenListProvider?: ITokenListProvider;

  /**
   * Calls lens function on SwapRouter02 to determind ERC20 approval types for
   * LP position tokens.
   */
  swapRouterProvider?: ISwapRouterProvider;
};

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
   * a value of 2 would find the top 2 pools that involve DAI or USDT.
   */
  topNSecondHop: number;
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
   * Config for selecting which pools to consider routing via on V2.
   */
  v2PoolSelection: ProtocolPoolSelection;
  /**
   * Config for selecting which pools to consider routing via on V3.
   */
  v3PoolSelection: ProtocolPoolSelection;
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
   * The minimum percentage of the input token to use for each route in a split route.
   * All routes will have a multiple of this value. For example is distribution percentage is 5,
   * a potential return swap would be:
   *
   * 5% of input => Route 1
   * 55% of input => Route 2
   * 40% of input => Route 3
   */
  distributionPercent: number;
};

export class AlphaRouter
  implements
    IRouter<AlphaRouterConfig>,
    ISwapToRatio<AlphaRouterConfig, SwapAndAddConfig>
{
  protected chainId: ChainId;
  protected provider: providers.BaseProvider;
  protected multicall2Provider: UniswapMulticallProvider;
  protected v3SubgraphProvider: IV3SubgraphProvider;
  protected v3PoolProvider: IV3PoolProvider;
  protected v3QuoteProvider: IV3QuoteProvider;
  protected v2SubgraphProvider: IV2SubgraphProvider;
  protected v2PoolProvider: IV2PoolProvider;
  protected v2QuoteProvider: IV2QuoteProvider;
  protected tokenProvider: ITokenProvider;
  protected gasPriceProvider: IGasPriceProvider;
  protected swapRouterProvider: ISwapRouterProvider;
  protected v3GasModelFactory: IV3GasModelFactory;
  protected v2GasModelFactory: IV2GasModelFactory;
  protected blockedTokenListProvider?: ITokenListProvider;

  constructor({
    chainId,
    provider,
    multicall2Provider,
    v3PoolProvider,
    v3QuoteProvider,
    v2PoolProvider,
    v2QuoteProvider,
    v2SubgraphProvider,
    tokenProvider,
    blockedTokenListProvider,
    v3SubgraphProvider,
    gasPriceProvider,
    v3GasModelFactory,
    v2GasModelFactory,
    swapRouterProvider,
  }: AlphaRouterParams) {
    this.chainId = chainId;
    this.provider = provider;
    this.multicall2Provider =
      multicall2Provider ??
      new UniswapMulticallProvider(chainId, provider, 375_000);
    this.v3PoolProvider =
      v3PoolProvider ??
      new CachingV3PoolProvider(
        this.chainId,
        new V3PoolProvider(ID_TO_CHAIN_ID(chainId), this.multicall2Provider),
        new NodeJSCache(new NodeCache({ stdTTL: 360, useClones: false }))
      );

    if (v3QuoteProvider) {
      this.v3QuoteProvider = v3QuoteProvider;
    } else {
      switch (chainId) {
        case ChainId.OPTIMISM:
        case ChainId.OPTIMISTIC_KOVAN:
          this.v3QuoteProvider = new V3QuoteProvider(
            chainId,
            provider,
            this.multicall2Provider,
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
          this.v3QuoteProvider = new V3QuoteProvider(
            chainId,
            provider,
            this.multicall2Provider,
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
        default:
          this.v3QuoteProvider = new V3QuoteProvider(
            chainId,
            provider,
            this.multicall2Provider,
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
      v2PoolProvider ?? new V2PoolProvider(chainId, this.multicall2Provider);
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

    this.gasPriceProvider =
      gasPriceProvider ??
      new CachingGasStationProvider(
        chainId,
        this.provider instanceof providers.JsonRpcProvider
          ? new OnChainGasPriceProvider(
              chainId,
              new EIP1559GasPriceProvider(this.provider),
              new LegacyGasPriceProvider(this.provider)
            )
          : new ETHGasStationInfoProvider(ETH_GAS_STATION_API_URL),
        new NodeJSCache<GasPrice>(
          new NodeCache({ stdTTL: 15, useClones: false })
        )
      );
    this.v3GasModelFactory =
      v3GasModelFactory ?? new V3HeuristicGasModelFactory();
    this.v2GasModelFactory =
      v2GasModelFactory ?? new V2HeuristicGasModelFactory();

    this.swapRouterProvider =
      swapRouterProvider ?? new SwapRouterProvider(this.multicall2Provider);
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

      let amountToSwap = calculateRatioAmountIn(
        optimalRatio,
        exchangeRate,
        inputBalance,
        outputBalance
      );
      if (amountToSwap.equalTo(0)) {
        log.info(`no swap needed`);
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
          protocols: [Protocol.V3, Protocol.V2],
        }
      );
      if (!swap) {
        return {
          status: SwapToRatioStatus.NO_ROUTE_FOUND,
          error: 'no route found',
        };
      }

      let inputBalanceUpdated = inputBalance.subtract(swap.trade!.inputAmount);
      let outputBalanceUpdated = outputBalance.add(swap.trade!.outputAmount);
      let newRatio = inputBalanceUpdated.divide(outputBalanceUpdated);

      let targetPoolPriceUpdate;
      swap.route.forEach((route) => {
        if (route.protocol == Protocol.V3) {
          const v3Route = route as V3RouteWithValidQuote;
          v3Route.route.pools.forEach((pool, i) => {
            if (
              pool.token0.equals(position.pool.token0) &&
              pool.token1.equals(position.pool.token1) &&
              pool.fee == position.pool.fee
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

      log.info({
        optimalRatio: optimalRatio.asFraction.toFixed(18),
        newRatio: newRatio.asFraction.toFixed(18),
        ratioErrorTolerance: swapAndAddConfig.ratioErrorTolerance.toFixed(18),
        iterationN: n.toString(),
      });
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
    metric.putMetric(
      `QuoteRequestedForChain${this.chainId}`,
      1,
      MetricLoggerUnit.Count
    );

    // Get a block number to specify in all our calls. Ensures data we fetch from chain is
    // from the same block.
    const blockNumber =
      partialRoutingConfig.blockNumber ?? this.provider.getBlockNumber();

    const routingConfig: AlphaRouterConfig = _.merge(
      {},
      DEFAULT_ROUTING_CONFIG_BY_CHAIN(this.chainId),
      partialRoutingConfig,
      { blockNumber }
    );

    const { protocols } = routingConfig;

    const currencyIn =
      tradeType == TradeType.EXACT_INPUT ? amount.currency : quoteCurrency;
    const currencyOut =
      tradeType == TradeType.EXACT_INPUT ? quoteCurrency : amount.currency;
    const tokenIn = currencyIn.wrapped;
    const tokenOut = currencyOut.wrapped;

    // Generate our distribution of amounts, i.e. fractions of the input amount.
    // We will get quotes for fractions of the input amount for different routes, then
    // combine to generate split routes.
    const [percents, amounts] = this.getAmountDistribution(
      amount,
      routingConfig
    );

    // Get an estimate of the gas price to use when estimating gas cost of different routes.
    const beforeGas = Date.now();
    const { gasPriceWei } = await this.gasPriceProvider.getGasPrice();

    metric.putMetric(
      'GasPriceLoad',
      Date.now() - beforeGas,
      MetricLoggerUnit.Milliseconds
    );

    const quoteToken = quoteCurrency.wrapped;

    const quotePromises: Promise<{
      routesWithValidQuotes: RouteWithValidQuote[];
      candidatePools: CandidatePoolsBySelectionCriteria;
    }>[] = [];

    const protocolsSet = new Set(protocols ?? []);

    if (
      protocolsSet.size == 0 ||
      (protocolsSet.has(Protocol.V2) && protocolsSet.has(Protocol.V3))
    ) {
      log.info({ protocols, tradeType }, 'Routing across all protocols');
      quotePromises.push(
        this.getV3Quotes(
          tokenIn,
          tokenOut,
          amounts,
          percents,
          quoteToken,
          gasPriceWei,
          tradeType,
          routingConfig
        )
      );
      quotePromises.push(
        this.getV2Quotes(
          tokenIn,
          tokenOut,
          amounts,
          percents,
          quoteToken,
          gasPriceWei,
          tradeType,
          routingConfig
        )
      );
    } else {
      if (protocolsSet.has(Protocol.V3)) {
        log.info({ protocols, swapType: tradeType }, 'Routing across V3');
        quotePromises.push(
          this.getV3Quotes(
            tokenIn,
            tokenOut,
            amounts,
            percents,
            quoteToken,
            gasPriceWei,
            tradeType,
            routingConfig
          )
        );
      }
      if (protocolsSet.has(Protocol.V2)) {
        log.info({ protocols, swapType: tradeType }, 'Routing across V2');
        quotePromises.push(
          this.getV2Quotes(
            tokenIn,
            tokenOut,
            amounts,
            percents,
            quoteToken,
            gasPriceWei,
            tradeType,
            routingConfig
          )
        );
      }
    }

    const routesWithValidQuotesByProtocol = await Promise.all(quotePromises);

    let allRoutesWithValidQuotes: RouteWithValidQuote[] = [];
    let allCandidatePools: CandidatePoolsBySelectionCriteria[] = [];
    for (const {
      routesWithValidQuotes,
      candidatePools,
    } of routesWithValidQuotesByProtocol) {
      allRoutesWithValidQuotes = [
        ...allRoutesWithValidQuotes,
        ...routesWithValidQuotes,
      ];
      allCandidatePools = [...allCandidatePools, candidatePools];
    }

    if (allRoutesWithValidQuotes.length == 0) {
      log.info({ allRoutesWithValidQuotes }, 'Received no valid quotes');
      return null;
    }

    // Given all the quotes for all the amounts for all the routes, find the best combination.
    const beforeBestSwap = Date.now();
    const swapRouteRaw = getBestSwapRoute(
      amount,
      percents,
      allRoutesWithValidQuotes,
      tradeType,
      this.chainId,
      routingConfig
    );

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
    } = swapRouteRaw;

    // Build Trade object that represents the optimal swap.
    const trade = this.buildTrade<typeof tradeType>(
      currencyIn,
      currencyOut,
      tradeType,
      routeAmounts
    );

    let methodParameters: MethodParameters | undefined;

    // If user provided recipient, deadline etc. we also generate the calldata required to execute
    // the swap and return it too.
    if (swapConfig) {
      methodParameters = this.buildSwapMethodParameters(trade, swapConfig);
    }

    metric.putMetric(
      'FindBestSwapRoute',
      Date.now() - beforeBestSwap,
      MetricLoggerUnit.Milliseconds
    );

    metric.putMetric(
      `QuoteFoundForChain${this.chainId}`,
      1,
      MetricLoggerUnit.Count
    );

    this.emitPoolSelectionMetrics(swapRouteRaw, allCandidatePools);

    return {
      quote,
      quoteGasAdjusted,
      estimatedGasUsed,
      estimatedGasUsedQuoteToken,
      estimatedGasUsedUSD,
      gasPriceWei,
      route: routeAmounts,
      trade,
      methodParameters,
      blockNumber: BigNumber.from(await blockNumber),
    };
  }

  private async getV3Quotes(
    tokenIn: Token,
    tokenOut: Token,
    amounts: CurrencyAmount[],
    percents: number[],
    quoteToken: Token,
    gasPriceWei: BigNumber,
    swapType: TradeType,
    routingConfig: AlphaRouterConfig
  ): Promise<{
    routesWithValidQuotes: V3RouteWithValidQuote[];
    candidatePools: CandidatePoolsBySelectionCriteria;
  }> {
    log.info('Starting to get V3 quotes');
    // Fetch all the pools that we will consider routing via. There are thousands
    // of pools, so we filter them to a set of candidate pools that we expect will
    // result in good prices.
    const { poolAccessor, candidatePools } = await getV3CandidatePools({
      tokenIn,
      tokenOut,
      tokenProvider: this.tokenProvider,
      blockedTokenListProvider: this.blockedTokenListProvider,
      poolProvider: this.v3PoolProvider,
      routeType: swapType,
      subgraphProvider: this.v3SubgraphProvider,
      routingConfig,
      chainId: this.chainId,
    });
    const pools = poolAccessor.getAllPools();

    // Given all our candidate pools, compute all the possible ways to route from tokenIn to tokenOut.
    const { maxSwapsPerPath } = routingConfig;
    const routes = computeAllV3Routes(
      tokenIn,
      tokenOut,
      pools,
      maxSwapsPerPath
    );

    if (routes.length == 0) {
      return { routesWithValidQuotes: [], candidatePools };
    }

    // For all our routes, and all the fractional amounts, fetch quotes on-chain.
    const quoteFn =
      swapType == TradeType.EXACT_INPUT
        ? this.v3QuoteProvider.getQuotesManyExactIn.bind(this.v3QuoteProvider)
        : this.v3QuoteProvider.getQuotesManyExactOut.bind(this.v3QuoteProvider);

    const beforeQuotes = Date.now();
    log.info(
      `Getting quotes for V3 for ${routes.length} routes with ${amounts.length} amounts per route.`
    );
    const { routesWithQuotes } = await quoteFn(amounts, routes, {
      blockNumber: routingConfig.blockNumber,
    });

    const gasModel = await this.v3GasModelFactory.buildGasModel(
      this.chainId,
      gasPriceWei,
      this.v3PoolProvider,
      quoteToken
    );

    metric.putMetric(
      'V3QuotesLoad',
      Date.now() - beforeQuotes,
      MetricLoggerUnit.Milliseconds
    );

    metric.putMetric(
      'V3QuotesFetched',
      _(routesWithQuotes)
        .map(([, quotes]) => quotes.length)
        .sum(),
      MetricLoggerUnit.Count
    );

    const routesWithValidQuotes = [];

    for (const routeWithQuote of routesWithQuotes) {
      const [route, quotes] = routeWithQuote;

      for (let i = 0; i < quotes.length; i++) {
        const percent = percents[i]!;
        const amountQuote = quotes[i]!;
        const {
          quote,
          amount,
          sqrtPriceX96AfterList,
          initializedTicksCrossedList,
          gasEstimate,
        } = amountQuote;

        if (
          !quote ||
          !sqrtPriceX96AfterList ||
          !initializedTicksCrossedList ||
          !gasEstimate
        ) {
          log.debug(
            {
              route: routeToString(route),
              amountQuote,
            },
            'Dropping a null V3 quote for route.'
          );
          continue;
        }

        const routeWithValidQuote = new V3RouteWithValidQuote({
          route,
          rawQuote: quote,
          amount,
          percent,
          sqrtPriceX96AfterList,
          initializedTicksCrossedList,
          quoterGasEstimate: gasEstimate,
          gasModel,
          quoteToken,
          tradeType: swapType,
          v3PoolProvider: this.v3PoolProvider,
        });

        routesWithValidQuotes.push(routeWithValidQuote);
      }
    }

    return { routesWithValidQuotes, candidatePools };
  }

  private async getV2Quotes(
    tokenIn: Token,
    tokenOut: Token,
    amounts: CurrencyAmount[],
    percents: number[],
    quoteToken: Token,
    gasPriceWei: BigNumber,
    swapType: TradeType,
    routingConfig: AlphaRouterConfig
  ): Promise<{
    routesWithValidQuotes: V2RouteWithValidQuote[];
    candidatePools: CandidatePoolsBySelectionCriteria;
  }> {
    log.info('Starting to get V2 quotes');
    // Fetch all the pools that we will consider routing via. There are thousands
    // of pools, so we filter them to a set of candidate pools that we expect will
    // result in good prices.
    const { poolAccessor, candidatePools } = await getV2CandidatePools({
      tokenIn,
      tokenOut,
      tokenProvider: this.tokenProvider,
      blockedTokenListProvider: this.blockedTokenListProvider,
      poolProvider: this.v2PoolProvider,
      routeType: swapType,
      subgraphProvider: this.v2SubgraphProvider,
      routingConfig,
      chainId: this.chainId,
    });
    const pools = poolAccessor.getAllPools();

    // Given all our candidate pools, compute all the possible ways to route from tokenIn to tokenOut.
    const { maxSwapsPerPath } = routingConfig;
    const routes = computeAllV2Routes(
      tokenIn,
      tokenOut,
      pools,
      maxSwapsPerPath
    );

    if (routes.length == 0) {
      return { routesWithValidQuotes: [], candidatePools };
    }

    // For all our routes, and all the fractional amounts, fetch quotes on-chain.
    const quoteFn =
      swapType == TradeType.EXACT_INPUT
        ? this.v2QuoteProvider.getQuotesManyExactIn.bind(this.v2QuoteProvider)
        : this.v2QuoteProvider.getQuotesManyExactOut.bind(this.v2QuoteProvider);

    const beforeQuotes = Date.now();

    log.info(
      `Getting quotes for V2 for ${routes.length} routes with ${amounts.length} amounts per route.`
    );
    const { routesWithQuotes } = await quoteFn(amounts, routes);

    const gasModel = await this.v2GasModelFactory.buildGasModel(
      this.chainId,
      gasPriceWei,
      this.v2PoolProvider,
      quoteToken
    );

    metric.putMetric(
      'V2QuotesLoad',
      Date.now() - beforeQuotes,
      MetricLoggerUnit.Milliseconds
    );

    metric.putMetric(
      'V2QuotesFetched',
      _(routesWithQuotes)
        .map(([, quotes]) => quotes.length)
        .sum(),
      MetricLoggerUnit.Count
    );

    const routesWithValidQuotes = [];

    for (const routeWithQuote of routesWithQuotes) {
      const [route, quotes] = routeWithQuote;

      for (let i = 0; i < quotes.length; i++) {
        const percent = percents[i]!;
        const amountQuote = quotes[i]!;
        const { quote, amount } = amountQuote;

        if (!quote) {
          log.debug(
            {
              route: routeToString(route),
              amountQuote,
            },
            'Dropping a null V2 quote for route.'
          );
          continue;
        }

        const routeWithValidQuote = new V2RouteWithValidQuote({
          route,
          rawQuote: quote,
          amount,
          percent,
          gasModel,
          quoteToken,
          tradeType: swapType,
          v2PoolProvider: this.v2PoolProvider,
        });

        routesWithValidQuotes.push(routeWithValidQuote);
      }
    }

    return { routesWithValidQuotes, candidatePools };
  }

  // Note multiplications here can result in a loss of precision in the amounts (e.g. taking 50% of 101)
  // This is reconcilled at the end of the algorithm by adding any lost precision to one of
  // the splits in the route.
  private getAmountDistribution(
    amount: CurrencyAmount,
    routingConfig: AlphaRouterConfig
  ): [number[], CurrencyAmount[]] {
    const { distributionPercent } = routingConfig;
    let percents = [];
    let amounts = [];

    for (let i = 1; i <= 100 / distributionPercent; i++) {
      percents.push(i * distributionPercent);
      amounts.push(amount.multiply(new Fraction(i * distributionPercent, 100)));
    }

    return [percents, amounts];
  }

  private buildTrade<TTradeType extends TradeType>(
    tokenInCurrency: Currency,
    tokenOutCurrency: Currency,
    tradeType: TTradeType,
    routeAmounts: RouteWithValidQuote[]
  ): Trade<Currency, Currency, TTradeType> {
    const [v3RouteAmounts, v2RouteAmounts] = _.partition(
      routeAmounts,
      (routeAmount) => routeAmount.protocol == Protocol.V3
    );

    const v3Routes = _.map<
      V3RouteWithValidQuote,
      {
        routev3: V3RouteRaw<Currency, Currency>;
        inputAmount: CurrencyAmount;
        outputAmount: CurrencyAmount;
      }
    >(
      v3RouteAmounts as V3RouteWithValidQuote[],
      (routeAmount: V3RouteWithValidQuote) => {
        const { route, amount, quote } = routeAmount;

        // The route, amount and quote are all in terms of wrapped tokens.
        // When constructing the Trade object the inputAmount/outputAmount must
        // use native currencies if specified by the user. This is so that the Trade knows to wrap/unwrap.
        if (tradeType == TradeType.EXACT_INPUT) {
          const amountCurrency = CurrencyAmount.fromFractionalAmount(
            tokenInCurrency,
            amount.numerator,
            amount.denominator
          );
          const quoteCurrency = CurrencyAmount.fromFractionalAmount(
            tokenOutCurrency,
            quote.numerator,
            quote.denominator
          );

          const routeRaw = new V3RouteRaw(
            route.pools,
            amountCurrency.currency,
            quoteCurrency.currency
          );

          return {
            routev3: routeRaw,
            inputAmount: amountCurrency,
            outputAmount: quoteCurrency,
          };
        } else {
          const quoteCurrency = CurrencyAmount.fromFractionalAmount(
            tokenInCurrency,
            quote.numerator,
            quote.denominator
          );

          const amountCurrency = CurrencyAmount.fromFractionalAmount(
            tokenOutCurrency,
            amount.numerator,
            amount.denominator
          );

          const routeCurrency = new V3RouteRaw(
            route.pools,
            quoteCurrency.currency,
            amountCurrency.currency
          );

          return {
            routev3: routeCurrency,
            inputAmount: quoteCurrency,
            outputAmount: amountCurrency,
          };
        }
      }
    );

    const v2Routes = _.map<
      V2RouteWithValidQuote,
      {
        routev2: V2RouteRaw<Currency, Currency>;
        inputAmount: CurrencyAmount;
        outputAmount: CurrencyAmount;
      }
    >(
      v2RouteAmounts as V2RouteWithValidQuote[],
      (routeAmount: V2RouteWithValidQuote) => {
        const { route, amount, quote } = routeAmount;

        // The route, amount and quote are all in terms of wrapped tokens.
        // When constructing the Trade object the inputAmount/outputAmount must
        // use native currencies if specified by the user. This is so that the Trade knows to wrap/unwrap.
        if (tradeType == TradeType.EXACT_INPUT) {
          const amountCurrency = CurrencyAmount.fromFractionalAmount(
            tokenInCurrency,
            amount.numerator,
            amount.denominator
          );
          const quoteCurrency = CurrencyAmount.fromFractionalAmount(
            tokenOutCurrency,
            quote.numerator,
            quote.denominator
          );

          const routeV2SDK = new V2RouteRaw(
            route.pairs,
            amountCurrency.currency,
            quoteCurrency.currency
          );

          return {
            routev2: routeV2SDK,
            inputAmount: amountCurrency,
            outputAmount: quoteCurrency,
          };
        } else {
          const quoteCurrency = CurrencyAmount.fromFractionalAmount(
            tokenInCurrency,
            quote.numerator,
            quote.denominator
          );

          const amountCurrency = CurrencyAmount.fromFractionalAmount(
            tokenOutCurrency,
            amount.numerator,
            amount.denominator
          );

          const routeV2SDK = new V2RouteRaw(
            route.pairs,
            quoteCurrency.currency,
            amountCurrency.currency
          );

          return {
            routev2: routeV2SDK,
            inputAmount: quoteCurrency,
            outputAmount: amountCurrency,
          };
        }
      }
    );

    const trade = new Trade({ v2Routes, v3Routes, tradeType });

    return trade;
  }

  private buildSwapMethodParameters(
    trade: Trade<Currency, Currency, TradeType>,
    swapConfig: SwapOptions
  ): MethodParameters {
    const { recipient, slippageTolerance, deadline, inputTokenPermit } =
      swapConfig;
    return SwapRouter.swapCallParameters(trade, {
      recipient,
      slippageTolerance,
      deadlineOrPreviousBlockhash: deadline,
      inputTokenPermit,
    });
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
    return SwapRouter.swapAndAddCallParameters(
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
    );
  }

  private emitPoolSelectionMetrics(
    swapRouteRaw: {
      quote: CurrencyAmount;
      quoteGasAdjusted: CurrencyAmount;
      routes: RouteWithValidQuote[];
      estimatedGasUsed: BigNumber;
    },
    allPoolsBySelection: CandidatePoolsBySelectionCriteria[]
  ) {
    const poolAddressesUsed = new Set<string>();
    const { routes: routeAmounts } = swapRouteRaw;
    _(routeAmounts)
      .flatMap((routeAmount) => {
        const { poolAddresses } = routeAmount;
        return poolAddresses;
      })
      .forEach((address: string) => {
        poolAddressesUsed.add(address.toLowerCase());
      });

    for (const poolsBySelection of allPoolsBySelection) {
      const { protocol } = poolsBySelection;
      _.forIn(
        poolsBySelection.selections,
        (pools: PoolId[], topNSelection: string) => {
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

    let hasV3Route = false;
    let hasV2Route = false;
    for (const routeAmount of routeAmounts) {
      if (routeAmount.protocol == Protocol.V3) {
        hasV3Route = true;
      }
      if (routeAmount.protocol == Protocol.V2) {
        hasV2Route = true;
      }
    }

    if (hasV3Route && hasV2Route) {
      metric.putMetric(`V3AndV2SplitRoute`, 1, MetricLoggerUnit.Count);
      metric.putMetric(
        `V3AndV2SplitRouteForChain${this.chainId}`,
        1,
        MetricLoggerUnit.Count
      );
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

  private absoluteValue(fraction: Fraction): Fraction {
    const numeratorAbs = JSBI.lessThan(fraction.numerator, JSBI.BigInt(0))
      ? JSBI.unaryMinus(fraction.numerator)
      : fraction.numerator;
    const denominatorAbs = JSBI.lessThan(fraction.denominator, JSBI.BigInt(0))
      ? JSBI.unaryMinus(fraction.denominator)
      : fraction.denominator;
    return new Fraction(numeratorAbs, denominatorAbs);
  }
}
