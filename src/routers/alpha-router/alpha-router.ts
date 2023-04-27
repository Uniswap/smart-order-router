import { BigNumber } from '@ethersproject/bignumber';
import { BaseProvider } from '@ethersproject/providers';
import { Protocol, SwapRouter, Trade } from '@uniswap/router-sdk';
import { Currency, Fraction, Token, TradeType } from '@uniswap/sdk-core';
import { Pool, Position, SqrtPriceMath, TickMath } from '@uniswap/v3-sdk';
import retry from 'async-retry';
import JSBI from 'jsbi';
import _ from 'lodash';

import { CachedRoutes, CacheMode, IRouteCachingProvider, ISwapRouterProvider, Simulator, } from '../../providers';
import { IGasPriceProvider } from '../../providers/gas-price-provider';
import { IV2PoolProvider } from '../../providers/v2/pool-provider';
import { ArbitrumGasData, IL2GasDataProvider, OptimismGasData, } from '../../providers/v3/gas-data-provider';
import { IV3PoolProvider } from '../../providers/v3/pool-provider';
import { SWAP_ROUTER_02_ADDRESSES } from '../../util';
import { CurrencyAmount } from '../../util/amounts';
import { ChainId, V2_SUPPORTED } from '../../util/chains';
import { log } from '../../util/log';
import { buildSwapMethodParameters, buildTrade } from '../../util/methodParameters';
import { metric, MetricLoggerUnit } from '../../util/metric';
import {
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
  V3Route,
} from '../router';

import { DEFAULT_ROUTING_CONFIG_BY_CHAIN } from './config';
import {
  MixedRouteWithValidQuote,
  RouteWithValidQuote,
  V3RouteWithValidQuote,
} from './entities/route-with-valid-quote';
import { BestSwapRoute, getBestSwapRoute } from './functions/best-swap-route';
import { calculateRatioAmountIn } from './functions/calculate-ratio-amount-in';
import { CandidatePoolsBySelectionCriteria, PoolId, } from './functions/get-candidate-pools';
import { IGasModel, IOnChainGasModelFactory, IV2GasModelFactory } from './gas-models/gas-model';
import { GetQuotesResult, MixedQuoter, V2Quoter, V3Quoter } from './quoters';

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
   * The provider for getting data about V3 pools.
   */
  v3PoolProvider: IV3PoolProvider;
  /**
   * The provider for getting data about V2 pools.
   */
  v2PoolProvider: IV2PoolProvider;
  /**
   * The provider for getting the current gas price to use when account for gas in the
   * algorithm.
   */
  gasPriceProvider: IGasPriceProvider;
  /**
   * Calls lens function on SwapRouter02 to determine ERC20 approval types for
   * LP position tokens.
   */
  swapRouterProvider: ISwapRouterProvider;
  /**
   * A factory for generating a gas model that is used when estimating the gas used by
   * V3 routes.
   */
  v3GasModelFactory: IOnChainGasModelFactory;
  /**
   * A factory for generating a gas model that is used when estimating the gas used by
   * V2 routes.
   */
  v2GasModelFactory: IV2GasModelFactory;
  /**
   * A factory for generating a gas model that is used when estimating the gas used by
   * V3 routes.
   */
  mixedRouteGasModelFactory: IOnChainGasModelFactory;

  l2GasDataProvider: IL2GasDataProvider<OptimismGasData> | IL2GasDataProvider<ArbitrumGasData>;

  /**
   * Simulates swaps and returns new SwapRoute with updated gas estimates.
   */
  simulator?: Simulator;
  v2Quoter: V2Quoter;
  v3Quoter: V3Quoter;
  mixedQuoter: MixedQuoter;

  /**
   * A provider for caching the best route given an amount, quoteToken, tradeType
   */
  routeCachingProvider?: IRouteCachingProvider;
};

export class MapWithLowerCaseKey<V> extends Map<string, V> {
  override set(key: string, value: V): this {
    return super.set(key.toLowerCase(), value);
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
};

export class AlphaRouter
  implements IRouter<AlphaRouterConfig>,
    ISwapToRatio<AlphaRouterConfig, SwapAndAddConfig> {
  protected chainId: ChainId;
  protected provider: BaseProvider;
  protected v3PoolProvider: IV3PoolProvider;
  protected v2PoolProvider: IV2PoolProvider;
  protected gasPriceProvider: IGasPriceProvider;
  protected swapRouterProvider: ISwapRouterProvider;
  protected v3GasModelFactory: IOnChainGasModelFactory;
  protected v2GasModelFactory: IV2GasModelFactory;
  protected mixedRouteGasModelFactory: IOnChainGasModelFactory;
  protected l2GasDataProvider?:
    | IL2GasDataProvider<OptimismGasData>
    | IL2GasDataProvider<ArbitrumGasData>;
  protected simulator?: Simulator;
  protected v2Quoter: V2Quoter;
  protected v3Quoter: V3Quoter;
  protected mixedQuoter: MixedQuoter;
  protected routeCachingProvider?: IRouteCachingProvider;

  constructor({
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
  }: AlphaRouterParams) {
    this.chainId = chainId;
    this.provider = provider;
    this.v3PoolProvider = v3PoolProvider;
    this.v2PoolProvider = v2PoolProvider;
    this.gasPriceProvider = gasPriceProvider;
    this.swapRouterProvider = swapRouterProvider;
    this.v3GasModelFactory = v3GasModelFactory;
    this.v2GasModelFactory = v2GasModelFactory;
    this.mixedRouteGasModelFactory = mixedRouteGasModelFactory;
    this.l2GasDataProvider = l2GasDataProvider;
    this.simulator = simulator;
    this.v2Quoter = v2Quoter;
    this.v3Quoter = v3Quoter;
    this.mixedQuoter = mixedQuoter;
    this.routeCachingProvider = routeCachingProvider;
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
    const { currencyIn, currencyOut } = this.determineCurrencyInOutFromTradeType(tradeType, amount, quoteCurrency);

    const tokenIn = currencyIn.wrapped;
    const tokenOut = currencyOut.wrapped;
    const quoteToken = quoteCurrency.wrapped;

    metric.setProperty('chainId', this.chainId);
    metric.setProperty('pair', `${tokenIn.symbol}/${tokenOut.symbol}`);
    metric.setProperty('tokenIn', tokenIn.address);
    metric.setProperty('tokenOut', tokenOut.address);
    metric.setProperty('tradeType', tradeType === TradeType.EXACT_INPUT ? 'ExactIn' : 'ExactOut');

    metric.putMetric(
      `QuoteRequestedForChain${this.chainId}`,
      1,
      MetricLoggerUnit.Count
    );

    // Get a block number to specify in all our calls. Ensures data we fetch from chain is
    // from the same block.
    const blockNumber = partialRoutingConfig.blockNumber ?? this.getBlockNumberPromise();

    const routingConfig: AlphaRouterConfig = _.merge(
      {},
      DEFAULT_ROUTING_CONFIG_BY_CHAIN(this.chainId),
      partialRoutingConfig,
      { blockNumber }
    );

    const gasPriceWei = await this.getGasPriceWei();

    const [v3GasModel, mixedRouteGasModel] = await this.getGasModels(
      gasPriceWei,
      amount.currency.wrapped,
      quoteToken
    );

    // Create a Set to sanitize the protocols input, a Set of undefined becomes an empty set,
    // Then create an Array from the values of that Set.
    const protocols: Protocol[] = Array.from(new Set(routingConfig.protocols).values());

    const cacheMode = await this.routeCachingProvider?.getCacheMode(
      this.chainId,
      amount,
      quoteToken,
      tradeType,
      protocols
    );

    // Fetch CachedRoutes
    let cachedRoutes: CachedRoutes | undefined;
    if (cacheMode && cacheMode !== CacheMode.Darkmode) {
      cachedRoutes = await this.routeCachingProvider?.getCachedRoute(
        this.chainId,
        amount,
        quoteToken,
        tradeType,
        protocols,
        await blockNumber
      );

      if (cachedRoutes) {
        metric.putMetric(
          `GetCachedRoute_hit_${cacheMode}`,
          1,
          MetricLoggerUnit.Count
        );
      } else {
        metric.putMetric(
          `GetCachedRoute_miss_${cacheMode}`,
          1,
          MetricLoggerUnit.Count
        );
      }
    }

    let swapRouteFromCachePromise: Promise<BestSwapRoute | null> = Promise.resolve(null);
    if (cachedRoutes) {
      swapRouteFromCachePromise = this.getSwapRouteFromCache(
        cachedRoutes,
        await blockNumber,
        amount,
        quoteToken,
        tradeType,
        routingConfig,
        v3GasModel,
        mixedRouteGasModel,
        gasPriceWei
      );
    }

    let swapRouteFromChainPromise: Promise<BestSwapRoute | null> = Promise.resolve(null);
    if (!cachedRoutes || cacheMode !== CacheMode.Livemode) {
      swapRouteFromChainPromise = this.getSwapRouteFromChain(
        amount,
        tokenIn,
        tokenOut,
        protocols,
        quoteToken,
        tradeType,
        routingConfig,
        v3GasModel,
        mixedRouteGasModel,
        gasPriceWei
      );
    }

    const [swapRouteFromCache, swapRouteFromChain] = await Promise.all([
      swapRouteFromCachePromise,
      swapRouteFromChainPromise
    ]);

    let swapRouteRaw: BestSwapRoute | null;
    if (cacheMode === CacheMode.Livemode && swapRouteFromCache) {
      log.info(`CacheMode is ${cacheMode}, and we are using swapRoute from cache`);
      swapRouteRaw = swapRouteFromCache;
    } else {
      log.info(`CacheMode is ${cacheMode}, and we are using materialized swapRoute`);
      swapRouteRaw = swapRouteFromChain;
    }

    if (cacheMode === CacheMode.Tapcompare && swapRouteFromCache && swapRouteFromChain) {
      const quoteDiff = swapRouteFromChain.quote.subtract(swapRouteFromCache.quote);
      const quoteGasAdjustedDiff = swapRouteFromChain.quoteGasAdjusted.subtract(swapRouteFromCache.quoteGasAdjusted);
      const gasUsedDiff = swapRouteFromChain.estimatedGasUsed.sub(swapRouteFromCache.estimatedGasUsed);

      // Only log if quoteDiff is different from 0, or if quoteGasAdjustedDiff and gasUsedDiff are both different from 0
      if (!quoteDiff.equalTo(0) || !(quoteGasAdjustedDiff.equalTo(0) || gasUsedDiff.eq(0))) {
        // Calculates the percentage of the difference with respect to the quoteFromChain (not from cache)
        const misquotePercent = quoteGasAdjustedDiff.divide(swapRouteFromChain.quoteGasAdjusted).multiply(100);

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
            quoteGasAdjustedFromChain: swapRouteFromChain.quoteGasAdjusted.toExact(),
            quoteGasAdjustedFromCache: swapRouteFromCache.quoteGasAdjusted.toExact(),
            quoteGasAdjustedDiff: quoteGasAdjustedDiff.toExact(),
            gasUsedFromChain: swapRouteFromChain.estimatedGasUsed.toString(),
            gasUsedFromCache: swapRouteFromCache.estimatedGasUsed.toString(),
            gasUsedDiff: gasUsedDiff.toString(),
            routesFromChain: swapRouteFromChain.routes.toString(),
            routesFromCache: swapRouteFromCache.routes.toString(),
            amount: amount.toExact(),
            originalAmount: cachedRoutes?.originalAmount,
            pair: this.tokenPairSymbolTradeTypeChainId(tokenIn, tokenOut, tradeType),
            blockNumber
          },
          `Comparing quotes between Chain and Cache for ${this.tokenPairSymbolTradeTypeChainId(
            tokenIn,
            tokenOut,
            tradeType
          )}`
        );
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
    } = swapRouteRaw;

    if (this.routeCachingProvider && cacheMode !== CacheMode.Darkmode && swapRouteFromChain) {
      // Generate the object to be cached
      const routesToCache = CachedRoutes.fromRoutesWithValidQuotes(
        swapRouteFromChain.routes,
        this.chainId,
        tokenIn,
        tokenOut,
        protocols.sort(), // sort it for consistency in the order of the protocols.
        await blockNumber,
        tradeType,
        amount.toExact()
      );

      if (routesToCache) {
        // Attempt to insert the entry in cache. This is fire and forget promise.
        // The catch method will prevent any exception from blocking the normal code execution.
        this.routeCachingProvider.setCachedRoute(routesToCache, amount).then((success) => {
          const status = success ? 'success' : 'rejected';
          metric.putMetric(
            `SetCachedRoute_${status}`,
            1,
            MetricLoggerUnit.Count
          );
        }).catch((reason) => {
          log.error(
            {
              reason: reason,
              tokenPair: this.tokenPairSymbolTradeTypeChainId(tokenIn, tokenOut, tradeType),
            },
            `SetCachedRoute failure`
          );

          metric.putMetric(
            `SetCachedRoute_failure`,
            1,
            MetricLoggerUnit.Count
          );
        });
      }
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

    const swapRoute: SwapRoute = {
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

    if (
      swapConfig &&
      swapConfig.simulate &&
      methodParameters &&
      methodParameters.calldata
    ) {
      if (!this.simulator) {
        throw new Error('Simulator not initialized!');
      }
      log.info({ swapConfig, methodParameters }, 'Starting simulation');
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
        this.l2GasDataProvider
          ? await this.l2GasDataProvider!.getGasData()
          : undefined,
        { blockNumber }
      );
      metric.putMetric(
        'SimulateTransaction',
        Date.now() - beforeSimulate,
        MetricLoggerUnit.Milliseconds
      );
      return swapRouteWithSimulation;
    }

    return swapRoute;
  }

  private async getSwapRouteFromCache(
    cachedRoutes: CachedRoutes,
    blockNumber: number,
    amount: CurrencyAmount,
    quoteToken: Token,
    tradeType: TradeType,
    routingConfig: AlphaRouterConfig,
    v3GasModel: IGasModel<V3RouteWithValidQuote>,
    mixedRouteGasModel: IGasModel<MixedRouteWithValidQuote>,
    gasPriceWei: BigNumber
  ): Promise<BestSwapRoute | null> {
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

    const v3Routes = cachedRoutes.routes.filter((route) => route.protocol === Protocol.V3);
    const v2Routes = cachedRoutes.routes.filter((route) => route.protocol === Protocol.V2);
    const mixedRoutes = cachedRoutes.routes.filter((route) => route.protocol === Protocol.MIXED);

    // Calculate percents from all routes, we will fetch quotes for each percent in case we had stale data when the route was cached
    const percentsSet: Set<number> = new Set(cachedRoutes.routes.map((route) => route.percent));
    // Add some percents that could be helpful
    percentsSet.add(100);
    percentsSet.add(50);
    // Convert set to array
    const percents = Array.from(percentsSet.values());
    // calculate amounts based on the percents
    const amounts = percents.map((percent) => amount.multiply(new Fraction(percent, 100)));

    if (v3Routes.length > 0) {
      const v3RoutesFromCache: V3Route[] = v3Routes.map((cachedRoute) => cachedRoute.route as V3Route);

      quotePromises.push(
        this.v3Quoter.getQuotes(
          v3RoutesFromCache,
          amounts,
          percents,
          quoteToken,
          tradeType,
          routingConfig,
          undefined,
          v3GasModel
        )
      );
    }

    if (v2Routes.length > 0) {
      quotePromises.push(
        // When we fetch the quotes in V2, we are not calling the `onChainProvider` like on v3Routes and mixedRoutes
        // Instead we are using the reserves in the Pool object, so we need to re-load the current reserves.
        this.v2Quoter.getRoutesThenQuotes(
          v2Routes[0]!.tokenIn,
          v2Routes[0]!.tokenOut,
          amounts,
          percents,
          quoteToken,
          tradeType,
          routingConfig,
          undefined,
          gasPriceWei
        )
      );
    }

    if (mixedRoutes.length > 0) {
      const mixedRoutesFromCache: MixedRoute[] = mixedRoutes.map((cachedRoute) => cachedRoute.route as MixedRoute);

      quotePromises.push(
        this.mixedQuoter.getQuotes(
          mixedRoutesFromCache,
          amounts,
          percents,
          quoteToken,
          tradeType,
          routingConfig,
          undefined,
          mixedRouteGasModel
        )
      );
    }

    const getQuotesResults = await Promise.all(quotePromises);
    const allRoutesWithValidQuotes = _.flatMap(getQuotesResults, (quoteResult) => quoteResult.routesWithValidQuotes);

    return getBestSwapRoute(
      amount,
      percents,
      allRoutesWithValidQuotes,
      tradeType,
      this.chainId,
      routingConfig,
      v3GasModel
    );
  }

  private async getSwapRouteFromChain(
    amount: CurrencyAmount,
    tokenIn: Token,
    tokenOut: Token,
    protocols: Protocol[],
    quoteToken: Token,
    tradeType: TradeType,
    routingConfig: AlphaRouterConfig,
    v3GasModel: IGasModel<V3RouteWithValidQuote>,
    mixedRouteGasModel: IGasModel<MixedRouteWithValidQuote>,
    gasPriceWei: BigNumber
  ): Promise<BestSwapRoute | null> {
    // Generate our distribution of amounts, i.e. fractions of the input amount.
    // We will get quotes for fractions of the input amount for different routes, then
    // combine to generate split routes.
    const [percents, amounts] = this.getAmountDistribution(
      amount,
      routingConfig
    );

    const noProtocolsSpecified = protocols.length === 0;
    const v3ProtocolSpecified = protocols.includes(Protocol.V3);
    const v2ProtocolSpecified = protocols.includes(Protocol.V2);
    const v2SupportedInChain = V2_SUPPORTED.includes(this.chainId);
    const shouldQueryMixedProtocol = protocols.includes(Protocol.MIXED) || (noProtocolsSpecified && v2SupportedInChain);
    const mixedProtocolAllowed = [ChainId.MAINNET, ChainId.GÖRLI].includes(this.chainId) &&
      tradeType === TradeType.EXACT_INPUT;

    const quotePromises: Promise<GetQuotesResult>[] = [];

    // Maybe Quote V3 - if V3 is specified, or no protocol is specified
    if (v3ProtocolSpecified || noProtocolsSpecified) {
      log.info({ protocols, tradeType }, 'Routing across V3');
      quotePromises.push(
        this.v3Quoter.getRoutesThenQuotes(
          tokenIn,
          tokenOut,
          amounts,
          percents,
          quoteToken,
          tradeType,
          routingConfig,
          v3GasModel
        )
      );
    }

    // Maybe Quote V2 - if V2 is specified, or no protocol is specified AND v2 is supported in this chain
    if (v2SupportedInChain && (v2ProtocolSpecified || noProtocolsSpecified)) {
      log.info({ protocols, tradeType }, 'Routing across V2');
      quotePromises.push(
        this.v2Quoter.getRoutesThenQuotes(
          tokenIn,
          tokenOut,
          amounts,
          percents,
          quoteToken,
          tradeType,
          routingConfig,
          undefined,
          gasPriceWei
        )
      );
    }

    // Maybe Quote mixed routes
    // if MixedProtocol is specified or no protocol is specified and v2 is supported AND tradeType is ExactIn
    // AND is Mainnet or Gorli
    if (shouldQueryMixedProtocol && mixedProtocolAllowed) {
      log.info({ protocols, tradeType }, 'Routing across MixedRoutes');
      quotePromises.push(
        this.mixedQuoter.getRoutesThenQuotes(
          tokenIn,
          tokenOut,
          amounts,
          percents,
          quoteToken,
          tradeType,
          routingConfig,
          mixedRouteGasModel
        )
      );
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
      v3GasModel
    );

    if (bestSwapRoute) {
      this.emitPoolSelectionMetrics(bestSwapRoute, allCandidatePools);
    }

    return bestSwapRoute;
  }

  private tradeTypeStr(tradeType: TradeType): string {
    return tradeType === TradeType.EXACT_INPUT ? 'ExactIn' : 'ExactOut';
  }

  private tokenPairSymbolTradeTypeChainId(tokenIn: Token, tokenOut: Token, tradeType: TradeType) {
    return `${tokenIn.symbol}/${tokenOut.symbol}/${this.tradeTypeStr(tradeType)}/${this.chainId}`;
  }

  private determineCurrencyInOutFromTradeType(tradeType: TradeType, amount: CurrencyAmount, quoteCurrency: Currency) {
    if (tradeType === TradeType.EXACT_INPUT) {
      return {
        currencyIn: amount.currency,
        currencyOut: quoteCurrency
      };
    } else {
      return {
        currencyIn: quoteCurrency,
        currencyOut: amount.currency
      };
    }
  }

  private async getGasPriceWei(): Promise<BigNumber> {
    // Track how long it takes to resolve this async call.
    const beforeGasTimestamp = Date.now();

    // Get an estimate of the gas price to use when estimating gas cost of different routes.
    const { gasPriceWei } = await this.gasPriceProvider.getGasPrice();

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
    quoteToken: Token
  ): Promise<[
    IGasModel<V3RouteWithValidQuote>,
    IGasModel<MixedRouteWithValidQuote>
  ]> {
    const beforeGasModel = Date.now();

    const v3GasModelPromise = this.v3GasModelFactory.buildGasModel({
      chainId: this.chainId,
      gasPriceWei,
      v3poolProvider: this.v3PoolProvider,
      amountToken,
      quoteToken,
      v2poolProvider: this.v2PoolProvider,
      l2GasDataProvider: this.l2GasDataProvider,
    });

    const mixedRouteGasModelPromise = this.mixedRouteGasModelFactory.buildGasModel({
      chainId: this.chainId,
      gasPriceWei,
      v3poolProvider: this.v3PoolProvider,
      amountToken,
      quoteToken,
      v2poolProvider: this.v2PoolProvider,
    });

    const [v3GasModel, mixedRouteGasModel] = await Promise.all([
      v3GasModelPromise,
      mixedRouteGasModelPromise
    ]);

    metric.putMetric(
      'GasModelCreation',
      Date.now() - beforeGasModel,
      MetricLoggerUnit.Milliseconds
    );

    return [v3GasModel, mixedRouteGasModel];
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
    let hasMixedRoute = false;
    for (const routeAmount of routeAmounts) {
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

    if (hasMixedRoute && (hasV3Route || hasV2Route)) {
      if (hasV3Route && hasV2Route) {
        metric.putMetric(
          `MixedAndV3AndV2SplitRoute`,
          1,
          MetricLoggerUnit.Count
        );
        metric.putMetric(
          `MixedAndV3AndV2SplitRouteForChain${this.chainId}`,
          1,
          MetricLoggerUnit.Count
        );
      } else if (hasV3Route) {
        metric.putMetric(`MixedAndV3SplitRoute`, 1, MetricLoggerUnit.Count);
        metric.putMetric(
          `MixedAndV3SplitRouteForChain${this.chainId}`,
          1,
          MetricLoggerUnit.Count
        );
      } else if (hasV2Route) {
        metric.putMetric(`MixedAndV2SplitRoute`, 1, MetricLoggerUnit.Count);
        metric.putMetric(
          `MixedAndV2SplitRouteForChain${this.chainId}`,
          1,
          MetricLoggerUnit.Count
        );
      }
    } else if (hasV3Route && hasV2Route) {
      metric.putMetric(`V3AndV2SplitRoute`, 1, MetricLoggerUnit.Count);
      metric.putMetric(
        `V3AndV2SplitRouteForChain${this.chainId}`,
        1,
        MetricLoggerUnit.Count
      );
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
}
