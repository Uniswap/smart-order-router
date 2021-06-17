import { Currency, Fraction, Token, TradeType } from '@uniswap/sdk-core';
import {
  FeeAmount,
  MethodParameters,
  Pool,
  SwapRouter,
  Trade,
} from '@uniswap/v3-sdk';
import Logger from 'bunyan';
import { BigNumber } from 'ethers';
import _ from 'lodash';
import { GasPriceProvider } from '../../providers/gas-price-provider';
import { Multicall2Provider } from '../../providers/multicall2-provider';
import { PoolAccessor, PoolProvider } from '../../providers/pool-provider';
import { QuoteProvider, RouteWithQuotes } from '../../providers/quote-provider';
import {
  ISubgraphProvider,
  printSubgraphPool,
  SubgraphPool,
} from '../../providers/subgraph-provider';
import { TokenProvider } from '../../providers/token-provider';
import { CurrencyAmount, parseFeeAmount } from '../../util/amounts';
import { ChainId } from '../../util/chains';
import {
  poolToString,
  routeAmountToString,
  routeToString,
} from '../../util/routes';
import { IMetricLogger, MetricLoggerUnit } from '../metric';
import {
  IRouter,
  RouteAmount,
  RouteSOR,
  SwapConfig,
  SwapRoute,
} from '../router';
import { RouteWithValidQuote } from './entities/route-with-valid-quote';
import { GasModel, GasModelFactory } from './gas-models/gas-model';

export type DefaultRouterParams = {
  chainId: ChainId;
  multicall2Provider: Multicall2Provider;
  subgraphProvider: ISubgraphProvider;
  poolProvider: PoolProvider;
  quoteProvider: QuoteProvider;
  tokenProvider: TokenProvider;
  gasPriceProvider: GasPriceProvider;
  gasModelFactory: GasModelFactory;
  log: Logger;
  metricLogger: IMetricLogger;
};

export type DefaultRouterConfig = {
  topN: number;
  topNSecondHop: number;
  maxSwapsPerPath: number;
  maxSplits: number;
  distributionPercent: number;
  multicallChunkSize: number;
};

export const DEFAULT_CONFIG: DefaultRouterConfig = {
  topN: 7,
  topNSecondHop: 1,
  maxSwapsPerPath: 3,
  maxSplits: 3,
  distributionPercent: 5,
  multicallChunkSize: 50,
};

export class DefaultRouter implements IRouter<DefaultRouterConfig> {
  protected log: Logger;
  protected chainId: ChainId;
  protected multicall2Provider: Multicall2Provider;
  protected subgraphProvider: ISubgraphProvider;
  protected poolProvider: PoolProvider;
  protected quoteProvider: QuoteProvider;
  protected tokenProvider: TokenProvider;
  protected gasPriceProvider: GasPriceProvider;
  protected gasModelFactory: GasModelFactory;
  protected metricLogger: IMetricLogger;

  constructor({
    chainId,
    multicall2Provider,
    poolProvider,
    quoteProvider,
    tokenProvider,
    subgraphProvider,
    gasPriceProvider,
    gasModelFactory,
    log,
    metricLogger,
  }: DefaultRouterParams) {
    this.chainId = chainId;
    this.multicall2Provider = multicall2Provider;
    this.poolProvider = poolProvider;
    this.quoteProvider = quoteProvider;
    this.tokenProvider = tokenProvider;
    this.subgraphProvider = subgraphProvider;
    this.gasPriceProvider = gasPriceProvider;
    this.gasModelFactory = gasModelFactory;
    this.log = log;
    this.metricLogger = metricLogger;
  }

  public async routeExactIn(
    currencyIn: Currency,
    currencyOut: Currency,
    amountIn: CurrencyAmount,
    swapConfig: SwapConfig,
    routingConfig = DEFAULT_CONFIG
  ): Promise<SwapRoute | null> {
    const tokenIn = currencyIn.wrapped;
    const tokenOut = currencyOut.wrapped;

    const poolAccessor = await this.getPoolsToConsider(
      tokenIn,
      tokenOut,
      TradeType.EXACT_INPUT,
      routingConfig
    );
    const pools = poolAccessor.getAllPools();

    const beforeGas = Date.now();
    const { gasPriceWei } = await this.gasPriceProvider.getGasPrice();

    this.metricLogger.putMetric(
      'GasPriceLoad',
      Date.now() - beforeGas,
      MetricLoggerUnit.Milliseconds
    );

    const gasModel = this.gasModelFactory.buildGasModel(
      this.chainId,
      gasPriceWei,
      this.tokenProvider,
      poolAccessor,
      tokenOut
    );

    const { maxSwapsPerPath, multicallChunkSize } = routingConfig;

    const routes = this.computeAllRoutes(
      tokenIn,
      tokenOut,
      pools,
      maxSwapsPerPath
    );
    const [percents, amounts] = this.getAmountDistribution(
      amountIn,
      routingConfig
    );

    const beforeQuotes = Date.now();
    const { routesWithQuotes, blockNumber } =
      await this.quoteProvider.getQuotesManyExactIn(amounts, routes, {
        multicallChunk: multicallChunkSize,
      });

    this.metricLogger.putMetric(
      'QuotesLoad',
      Date.now() - beforeQuotes,
      MetricLoggerUnit.Milliseconds
    );

    const beforeBestSwap = Date.now();
    const swapRouteRaw = this.getBestSwapRoute(
      percents,
      routesWithQuotes,
      tokenOut,
      TradeType.EXACT_INPUT,
      gasModel,
      routingConfig
    );

    if (!swapRouteRaw) {
      return null;
    }

    const { quote, quoteGasAdjusted, estimatedGasUsed, routeAmounts } =
      swapRouteRaw;

    const methodParameters = this.buildMethodParameters(
      currencyIn,
      currencyOut,
      TradeType.EXACT_INPUT,
      routeAmounts,
      swapConfig
    );

    this.metricLogger.putMetric(
      'FindBestSwapRoute',
      Date.now() - beforeBestSwap,
      MetricLoggerUnit.Milliseconds
    );

    return {
      quote,
      quoteGasAdjusted,
      estimatedGasUsed,
      gasPriceWei,
      routeAmounts,
      methodParameters,
      blockNumber,
    };
  }

  public async routeExactOut(
    currencyIn: Currency,
    currencyOut: Currency,
    amountOut: CurrencyAmount,
    swapConfig: SwapConfig,
    routingConfig = DEFAULT_CONFIG
  ): Promise<SwapRoute | null> {
    const tokenIn = currencyIn.wrapped;
    const tokenOut = currencyOut.wrapped;

    const poolAccessor = await this.getPoolsToConsider(
      tokenIn,
      tokenOut,
      TradeType.EXACT_INPUT,
      routingConfig
    );
    const pools = poolAccessor.getAllPools();

    const beforeGas = Date.now();
    const { gasPriceWei } = await this.gasPriceProvider.getGasPrice();

    this.metricLogger.putMetric(
      'GasPriceLoad',
      Date.now() - beforeGas,
      MetricLoggerUnit.Milliseconds
    );

    const gasModel = this.gasModelFactory.buildGasModel(
      this.chainId,
      gasPriceWei,
      this.tokenProvider,
      poolAccessor,
      tokenIn
    );

    const { maxSwapsPerPath, multicallChunkSize } = routingConfig;
    const routes = this.computeAllRoutes(
      tokenIn,
      tokenOut,
      pools,
      maxSwapsPerPath
    );
    const [percents, amounts] = this.getAmountDistribution(
      amountOut,
      routingConfig
    );
    const { routesWithQuotes, blockNumber } =
      await this.quoteProvider.getQuotesManyExactOut(amounts, routes, {
        multicallChunk: multicallChunkSize,
      });

    const swapRouteRaw = this.getBestSwapRoute(
      percents,
      routesWithQuotes,
      tokenIn,
      TradeType.EXACT_OUTPUT,
      gasModel,
      routingConfig
    );

    if (!swapRouteRaw) {
      return null;
    }

    const { quote, quoteGasAdjusted, routeAmounts, estimatedGasUsed } =
      swapRouteRaw;

    const methodParameters = this.buildMethodParameters(
      currencyIn,
      currencyOut,
      TradeType.EXACT_OUTPUT,
      routeAmounts,
      swapConfig
    );

    return {
      quote,
      quoteGasAdjusted,
      estimatedGasUsed,
      gasPriceWei,
      routeAmounts,
      methodParameters,
      blockNumber,
    };
  }

  private getBestSwapRoute(
    percents: number[],
    routesWithQuotes: RouteWithQuotes[],
    quoteToken: Token,
    routeType: TradeType,
    gasModel: GasModel,
    routingConfig: DefaultRouterConfig
  ): {
    quote: CurrencyAmount;
    quoteGasAdjusted: CurrencyAmount;
    routeAmounts: RouteAmount[];
    estimatedGasUsed: BigNumber;
  } | null {
    const now = Date.now();
    this.log.info({ routingConfig }, 'Finding best swap');
    const percentToQuotes: { [percent: number]: RouteWithValidQuote[] } = {};

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
          this.log.debug(
            {
              route: routeToString(route),
              amount: amount.toFixed(2),
              amountQuote,
            },
            'Dropping a null quote for route.'
          );
          continue;
        }

        if (!percentToQuotes[percent]) {
          percentToQuotes[percent] = [];
        }

        const routeWithValidQuote = new RouteWithValidQuote({
          route,
          rawQuote: quote,
          amount,
          percent,
          sqrtPriceX96AfterList,
          initializedTicksCrossedList,
          quoterGasEstimate: gasEstimate,
          gasModel,
          quoteToken,
          tradeType: routeType,
          log: this.log,
        });

        percentToQuotes[percent]!.push(routeWithValidQuote);
      }
    }

    this.metricLogger.putMetric(
      'BuildRouteWithValidQuoteObjects',
      Date.now() - now,
      MetricLoggerUnit.Milliseconds
    );

    const swapRoute = this.getBestSwapRouteBy(
      routeType,
      percentToQuotes,
      percents,
      (rq: RouteWithValidQuote) => rq.quoteAdjustedForGas,
      routingConfig
    );

    if (!swapRoute) {
      return null;
    }

    this.log.info(
      {
        routes: _.map(swapRoute.routeAmounts, (routeAmount) =>
          routeAmountToString(routeAmount)
        ),
        quote: swapRoute.quote.toFixed(2),
        quoteGasAdjusted: swapRoute.quoteGasAdjusted.toFixed(2),
      },
      'Found best swap route.'
    );

    return swapRoute;
  }

  private getBestSwapRouteBy(
    routeType: TradeType,
    percentToQuotes: { [percent: number]: RouteWithValidQuote[] },
    percents: number[],
    by: (routeQuote: RouteWithValidQuote) => CurrencyAmount,
    routingConfig: DefaultRouterConfig
  ):
    | {
        quote: CurrencyAmount;
        quoteGasAdjusted: CurrencyAmount;
        estimatedGasUsed: BigNumber;
        routeAmounts: RouteAmount[];
      }
    | undefined {
    const percentToSortedQuotes = _.mapValues(
      percentToQuotes,
      (routeQuotes: RouteWithValidQuote[]) => {
        return routeQuotes.sort((routeQuoteA, routeQuoteB) => {
          if (routeType == TradeType.EXACT_INPUT) {
            return by(routeQuoteA).greaterThan(by(routeQuoteB)) ? -1 : 1;
          } else {
            return by(routeQuoteA).lessThan(by(routeQuoteB)) ? -1 : 1;
          }
        });
      }
    );

    this.log.debug({ percentToSortedQuotes }, 'Percentages to sorted quotes.');

    // Function that given a list of used routes for a current swap route candidate,
    // finds the first route in a list that does not re-use an already used pool.
    const findFirstRouteNotUsingUsedPools = (
      usedRoutes: RouteSOR[],
      candidateRouteQuotes: RouteWithValidQuote[]
    ): RouteWithValidQuote | null => {
      const getPoolAddress = (pool: Pool) =>
        Pool.getAddress(pool.token0, pool.token1, pool.fee);

      const poolAddressSet = new Set();
      const usedPoolAddresses = _(usedRoutes)
        .flatMap((r) => r.pools)
        .map(getPoolAddress)
        .value();

      for (let poolAddress of usedPoolAddresses) {
        poolAddressSet.add(poolAddress);
      }

      for (const routeQuote of candidateRouteQuotes) {
        const {
          route: { pools },
        } = routeQuote;
        if (pools.some((pool) => poolAddressSet.has(getPoolAddress(pool)))) {
          continue;
        }

        return routeQuote;
      }

      return null;
    };

    if (!percentToSortedQuotes[100]) {
      this.log.info(
        { percentToSortedQuotes },
        'Did not find a valid route without any splits.'
      );
      return undefined;
    }

    // Start with our first best swap as being the quote where we send 100% of token through a single route.
    let bestQuote = by(percentToSortedQuotes[100][0]!);
    let bestSwap: RouteWithValidQuote[] = [percentToSortedQuotes[100][0]!];

    const quoteCompFn =
      routeType == TradeType.EXACT_INPUT
        ? (a: CurrencyAmount, b: CurrencyAmount) => a.greaterThan(b)
        : (a: CurrencyAmount, b: CurrencyAmount) => a.lessThan(b);

    let splits = 2;
    while (splits <= routingConfig.maxSplits) {
      if (splits == 2) {
        const split2Now = Date.now();
        for (let i = 0; i < Math.ceil(percents.length / 2); i++) {
          const percentA = percents[i]!;
          const routeWithQuoteA = percentToSortedQuotes[percentA]![0]!;
          const { route: routeA } = routeWithQuoteA;
          const quoteA = by(routeWithQuoteA);

          const percentB = 100 - percentA;
          const candidateRoutesB = percentToSortedQuotes[percentB]!;

          if (!candidateRoutesB) {
            continue;
          }

          const routeWithQuoteB = findFirstRouteNotUsingUsedPools(
            [routeA],
            candidateRoutesB
          );

          if (!routeWithQuoteB) {
            continue;
          }

          const newQuote = quoteA.add(by(routeWithQuoteB));

          if (quoteCompFn(newQuote, bestQuote)) {
            bestQuote = newQuote;
            bestSwap = [routeWithQuoteA, routeWithQuoteB];
          }
        }
        this.metricLogger.putMetric(
          'Split2Done',
          Date.now() - split2Now,
          MetricLoggerUnit.Milliseconds
        );
      }

      if (splits == 3) {
        const split3Now = Date.now();
        for (let i = 0; i < percents.length; i++) {
          const percentA = percents[i]!;
          const routeWithQuoteA = percentToSortedQuotes[percentA]![0]!;
          const { route: routeA } = routeWithQuoteA;
          const quoteA = by(routeWithQuoteA);

          const remainingPercent = 100 - percentA;

          for (let j = i + 1; j < percents.length; j++) {
            const percentB = percents[j]!;
            const candidateRoutesB = percentToSortedQuotes[percentB]!;

            const routeWithQuoteB = findFirstRouteNotUsingUsedPools(
              [routeA],
              candidateRoutesB
            );

            if (!routeWithQuoteB) {
              continue;
            }

            const { route: routeB } = routeWithQuoteB;
            const quoteB = by(routeWithQuoteB);
            const percentC = remainingPercent - percentB;

            const candidateRoutesC = percentToSortedQuotes[percentC]!;

            if (!candidateRoutesC) {
              continue;
            }

            const routeWithQuoteC = findFirstRouteNotUsingUsedPools(
              [routeA, routeB],
              candidateRoutesC
            );

            if (!routeWithQuoteC) {
              continue;
            }

            const quoteC = by(routeWithQuoteC);

            const newQuote = quoteA.add(quoteB).add(quoteC);

            if (quoteCompFn(newQuote, bestQuote)) {
              bestQuote = newQuote;
              bestSwap = [routeWithQuoteA, routeWithQuoteB, routeWithQuoteC];
            }
          }
        }

        this.metricLogger.putMetric(
          'Split3Done',
          Date.now() - split3Now,
          MetricLoggerUnit.Milliseconds
        );
      }

      if (splits == 4) {
        throw new Error('Four splits is not supported');
      }

      splits += 1;
    }

    const sum = (currencyAmounts: CurrencyAmount[]): CurrencyAmount => {
      let sum = currencyAmounts[0]!;
      for (let i = 1; i < currencyAmounts.length; i++) {
        sum = sum.add(currencyAmounts[i]!);
      }
      return sum;
    };

    const postSplitNow = Date.now();

    const quoteGasAdjusted = sum(
      _.map(
        bestSwap,
        (routeWithValidQuote) => routeWithValidQuote.quoteAdjustedForGas
      )
    );

    const estimatedGasUsed = _(bestSwap)
      .map((routeWithValidQuote) => routeWithValidQuote.gasEstimate)
      .reduce(
        (sum, routeWithValidQuote) => sum.add(routeWithValidQuote),
        BigNumber.from(0)
      );

    const quote = sum(
      _.map(bestSwap, (routeWithValidQuote) => routeWithValidQuote.quote)
    );

    const routeAmounts = _.map<RouteWithValidQuote, RouteAmount>(
      bestSwap,
      (rq: RouteWithValidQuote) => {
        return {
          route: rq.route,
          amount: rq.amount,
          quote: rq.quote,
          quoteGasAdjusted: rq.quoteAdjustedForGas,
          percentage: rq.percent,
          estimatedGasUsed: rq.gasEstimate,
        };
      }
    ).sort(
      (routeAmountA, routeAmountB) =>
        routeAmountB.percentage - routeAmountA.percentage
    );

    this.metricLogger.putMetric(
      'PostSplitDone',
      Date.now() - postSplitNow,
      MetricLoggerUnit.Milliseconds
    );

    return { quote, quoteGasAdjusted, estimatedGasUsed, routeAmounts };
  }

  private getAmountDistribution(
    amount: CurrencyAmount,
    routingConfig: DefaultRouterConfig
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

  private async getPoolsToConsider(
    tokenIn: Token,
    tokenOut: Token,
    routeType: TradeType,
    routingConfig: DefaultRouterConfig
  ): Promise<PoolAccessor> {
    const { topN, topNSecondHop } = routingConfig;

    const beforeSubgraphPools = Date.now();

    const allPools = await this.subgraphProvider.getPools();

    this.metricLogger.putMetric(
      'SubgraphPoolsLoad',
      Date.now() - beforeSubgraphPools,
      MetricLoggerUnit.Milliseconds
    );

    // Only consider pools where both tokens are in the token list.
    const subgraphPoolsSorted = _(allPools)
      .filter((pool) => {
        return (
          this.tokenProvider.tokenExists(this.chainId, pool.token0.symbol) &&
          this.tokenProvider.tokenExists(this.chainId, pool.token1.symbol)
        );
      })
      .sortBy((tokenListPool) => -tokenListPool.totalValueLockedETH)
      .value();

    const top2DirectSwapPool = _(subgraphPoolsSorted)
      .filter((subgraphPool) => {
        return (
          (subgraphPool.token0.symbol == tokenIn.symbol &&
            subgraphPool.token1.symbol == tokenOut.symbol) ||
          (subgraphPool.token1.symbol == tokenIn.symbol &&
            subgraphPool.token0.symbol == tokenOut.symbol)
        );
      })
      .slice(0, 2)
      .value();

    const top2EthPool = _(subgraphPoolsSorted)
      .filter((subgraphPool) => {
        if (routeType == TradeType.EXACT_INPUT) {
          return (
            (subgraphPool.token0.symbol == 'WETH' &&
              subgraphPool.token1.symbol == tokenOut.symbol) ||
            (subgraphPool.token1.symbol == 'WETH' &&
              subgraphPool.token0.symbol == tokenOut.symbol)
          );
        } else {
          return (
            (subgraphPool.token0.symbol == 'WETH' &&
              subgraphPool.token1.symbol == tokenIn.symbol) ||
            (subgraphPool.token1.symbol == 'WETH' &&
              subgraphPool.token0.symbol == tokenIn.symbol)
          );
        }
      })
      .slice(0, 2)
      .value();

    const topByTVL = _(subgraphPoolsSorted).slice(0, topN).value();

    const topByTVLUsingTokenIn = _(subgraphPoolsSorted)
      .filter((tokenListPool) => {
        return (
          tokenListPool.token0.symbol == tokenIn.symbol ||
          tokenListPool.token1.symbol == tokenIn.symbol
        );
      })
      .slice(0, topN)
      .value();

    const topByTVLUsingTokenInSecondHops = _(topByTVLUsingTokenIn)
      .map((subgraphPool) => {
        return tokenIn.symbol == subgraphPool.token0.symbol
          ? subgraphPool.token1.symbol
          : subgraphPool.token0.symbol;
      })
      .flatMap((secondHopSymbol: string) => {
        return _(subgraphPoolsSorted)
          .filter((subgraphPool) => {
            return (
              subgraphPool.token0.symbol == secondHopSymbol ||
              subgraphPool.token1.symbol == secondHopSymbol
            );
          })
          .slice(0, topNSecondHop)
          .value();
      })
      .slice(0, topNSecondHop)
      .value();

    const topByTVLUsingTokenOut = _(subgraphPoolsSorted)
      .filter((subgraphPool) => {
        return (
          subgraphPool.token0.symbol == tokenOut.symbol ||
          subgraphPool.token1.symbol == tokenOut.symbol
        );
      })
      .slice(0, topN)
      .value();

    const topByTVLUsingTokenOutSecondHops = _(topByTVLUsingTokenIn)
      .map((subgraphPool) => {
        return tokenOut.symbol == subgraphPool.token0.symbol
          ? subgraphPool.token1.symbol
          : subgraphPool.token0.symbol;
      })
      .flatMap((secondHopSymbol: string) => {
        return _(subgraphPoolsSorted)
          .filter((subgraphPool) => {
            return (
              subgraphPool.token0.symbol == secondHopSymbol ||
              subgraphPool.token1.symbol == secondHopSymbol
            );
          })
          .slice(0, topNSecondHop)
          .value();
      })
      .slice(0, topNSecondHop)
      .value();

    this.log.info(
      {
        topByTVLUsingTokenIn: topByTVLUsingTokenIn.map(printSubgraphPool),
        topByTVLUsingTokenOut: topByTVLUsingTokenOut.map(printSubgraphPool),
        topByTVL: topByTVL.map(printSubgraphPool),
        topByTVLUsingTokenInSecondHops:
          topByTVLUsingTokenInSecondHops.map(printSubgraphPool),
        topByTVLUsingTokenOutSecondHops:
          topByTVLUsingTokenOutSecondHops.map(printSubgraphPool),
        top2DirectSwap: top2DirectSwapPool.map(printSubgraphPool),
        top2EthPool: top2EthPool.map(printSubgraphPool),
      },
      `Pools for consideration using top ${topN} first hop ${topNSecondHop} second hop`
    );

    const subgraphPools = _([
      ...top2DirectSwapPool,
      ...top2EthPool,
      ...topByTVL,
      ...topByTVLUsingTokenIn,
      ...topByTVLUsingTokenOut,
      ...topByTVLUsingTokenInSecondHops,
      ...topByTVLUsingTokenOutSecondHops,
    ])
      .compact()
      .uniqBy((pool) => pool.id)
      .value();

    const tokenPairs = _.map<SubgraphPool, [Token, Token, FeeAmount]>(
      subgraphPools,
      (subgraphPool) => {
        const tokenA = this.tokenProvider.getToken(
          this.chainId,
          subgraphPool.token0.symbol
        );
        const tokenB = this.tokenProvider.getToken(
          this.chainId,
          subgraphPool.token1.symbol
        );
        const fee = parseFeeAmount(subgraphPool.feeTier);

        return [tokenA, tokenB, fee];
      }
    );

    const beforePoolsLoad = Date.now();

    const poolAccessor = await this.poolProvider.getPools(tokenPairs);

    this.metricLogger.putMetric(
      'PoolsLoad',
      Date.now() - beforePoolsLoad,
      MetricLoggerUnit.Milliseconds
    );

    return poolAccessor;
  }

  private computeAllRoutes(
    tokenIn: Token,
    tokenOut: Token,
    pools: Pool[],
    maxHops: number
  ): RouteSOR[] {
    const poolsUsed = Array<Boolean>(pools.length).fill(false);
    const routes: RouteSOR[] = [];

    const computeRoutes = (
      tokenIn: Token,
      tokenOut: Token,
      currentRoute: Pool[],
      poolsUsed: Boolean[],
      _previousTokenOut?: Token
    ) => {
      if (currentRoute.length > maxHops) {
        return;
      }

      if (
        currentRoute.length > 0 &&
        currentRoute[currentRoute.length - 1]!.involvesToken(tokenOut)
      ) {
        routes.push(new RouteSOR([...currentRoute], tokenIn, tokenOut));
        return;
      }

      for (let i = 0; i < pools.length; i++) {
        if (poolsUsed[i]) {
          continue;
        }

        const curPool = pools[i]!;
        const previousTokenOut = _previousTokenOut
          ? _previousTokenOut
          : tokenIn;

        if (!curPool.involvesToken(previousTokenOut)) {
          continue;
        }

        const currentTokenOut = curPool.token0.equals(previousTokenOut)
          ? curPool.token1
          : curPool.token0;

        currentRoute.push(curPool);
        poolsUsed[i] = true;
        computeRoutes(
          tokenIn,
          tokenOut,
          currentRoute,
          poolsUsed,
          currentTokenOut
        );
        poolsUsed[i] = false;
        currentRoute.pop();
      }
    };

    computeRoutes(tokenIn, tokenOut, [], poolsUsed);

    this.log.info(
      { pools: pools.map(poolToString), routes: routes.map(routeToString) },
      `Computed ${routes.length} possible routes.`
    );

    return routes;
  }

  private buildMethodParameters(
    tokenInCurrency: Currency,
    tokenOutCurrency: Currency,
    tradeType: TradeType,
    routeAmounts: RouteAmount[],
    swapConfig: SwapConfig
  ): MethodParameters {
    const trades = _.map<RouteAmount, Trade<Currency, Currency, TradeType>>(
      routeAmounts,
      (routeAmount: RouteAmount) => {
        const { route, amount, quote } = routeAmount;

        // The route, amount and quote are all in terms of wrapped tokens.
        // When constructing the Trade object the inputAmount/outputAmount must
        // use native currencies. This is so that the Trade knows to wrap/unwrap.
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

          return Trade.createUncheckedTrade({
            route,
            tradeType: TradeType.EXACT_INPUT,
            inputAmount: amountCurrency,
            outputAmount: quoteCurrency,
          });
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

          return Trade.createUncheckedTrade({
            route,
            tradeType: TradeType.EXACT_OUTPUT,
            inputAmount: quoteCurrency,
            outputAmount: amountCurrency,
          });
        }
      }
    );

    const { recipient, slippageTolerance, deadline } = swapConfig;

    const methodParameters = SwapRouter.swapCallParameters(trades, {
      recipient,
      slippageTolerance,
      deadline,
      // ...(signatureData
      //   ? {
      //       inputTokenPermit:
      //         'allowed' in signatureData
      //           ? {
      //               expiry: signatureData.deadline,
      //               nonce: signatureData.nonce,
      //               s: signatureData.s,
      //               r: signatureData.r,
      //               v: signatureData.v as any,
      //             }
      //           : {
      //               deadline: signatureData.deadline,
      //               amount: signatureData.amount,
      //               s: signatureData.s,
      //               r: signatureData.r,
      //               v: signatureData.v as any,
      //             },
      //     }
      //   : {}),
    });

    return methodParameters;
  }
}
