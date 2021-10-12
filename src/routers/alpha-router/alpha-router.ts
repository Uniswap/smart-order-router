import DEFAULT_TOKEN_LIST from '@uniswap/default-token-list';
import { Currency, Fraction, TradeType } from '@uniswap/sdk-core';
import { TokenList } from '@uniswap/token-lists';
import {
  MethodParameters,
  Pool,
  Position,
  Route as V3Route,
  SqrtPriceMath,
  SwapRouter,
  TickMath,
  Trade,
} from '@uniswap/v3-sdk';
import { BigNumber, providers } from 'ethers';
import JSBI from 'jsbi';
import _ from 'lodash';
import NodeCache from 'node-cache';
import { HeuristicGasModelFactory } from '.';
import {
  CachingGasStationProvider,
  CachingTokenProviderWithFallback,
  CachingV3PoolProvider,
  EIP1559GasPriceProvider,
  NodeJSCache,
  UniswapMulticallProvider,
  URISubgraphProvider,
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
  IV3PoolProvider,
  V3PoolProvider,
} from '../../providers/v3/pool-provider';
import {
  IV3QuoteProvider,
  V3QuoteProvider,
} from '../../providers/v3/quote-provider';
import {
  IV3SubgraphProvider,
  V3SubgraphPool,
} from '../../providers/v3/subgraph-provider';
import { CurrencyAmount } from '../../util/amounts';
import { ChainId, ID_TO_CHAIN_ID } from '../../util/chains';
import { log } from '../../util/log';
import { metric, MetricLoggerUnit } from '../../util/metric';
import { Protocol } from '../../util/protocols';
import { IRouter, ISwapToRatio, SwapConfig, SwapRoute } from '../router';
import { V3RouteWithValidQuote } from './entities/route-with-valid-quote';
import { getBestSwapRoute } from './functions/best-swap-route';
import { calculateRatioAmountIn } from './functions/calculate-ratio-amount-in';
import { computeAllRoutes } from './functions/compute-all-routes';
import {
  CandidatePoolsBySelectionCriteria,
  getCandidatePools,
} from './functions/get-candidate-pools';
import { IGasModelFactory } from './gas-models/gas-model';

export type AlphaRouterParams = {
  chainId: ChainId;
  provider: providers.JsonRpcProvider;
  multicall2Provider?: UniswapMulticallProvider;
  subgraphProvider?: IV3SubgraphProvider;
  poolProvider?: IV3PoolProvider;
  quoteProvider?: IV3QuoteProvider;
  tokenProvider?: ITokenProvider;
  gasPriceProvider?: IGasPriceProvider;
  gasModelFactory?: IGasModelFactory;
  blockedTokenListProvider?: ITokenListProvider;
};

export type AlphaRouterConfig = {
  blockNumber?: number;
  topN: number;
  topNDirectSwaps: number;
  topNTokenInOut: number;
  topNSecondHop: number;
  topNWithEachBaseToken: number;
  topNWithBaseToken: number;
  topNWithBaseTokenInSet: boolean;
  maxSwapsPerPath: number;
  minSplits: number;
  maxSplits: number;
  distributionPercent: number;
  protocols?: Protocol[];
};

export const DEFAULT_CONFIG: AlphaRouterConfig = {
  topN: 4,
  topNDirectSwaps: 2,
  topNTokenInOut: 4,
  topNSecondHop: 2,
  topNWithEachBaseToken: 2,
  topNWithBaseToken: 10,
  topNWithBaseTokenInSet: false,
  maxSwapsPerPath: 3,
  minSplits: 1,
  maxSplits: 5,
  distributionPercent: 5,
};

export type SwapAndAddConfig = {
  errorTolerance: Fraction;
  maxIterations: number;
};

export class AlphaRouter
  implements
    IRouter<AlphaRouterConfig>,
    ISwapToRatio<AlphaRouterConfig, SwapAndAddConfig>
{
  protected chainId: ChainId;
  // TODO(judo): support interface directly
  protected provider: providers.JsonRpcProvider;
  // TODO(judo): support interface directly
  protected multicall2Provider: UniswapMulticallProvider;
  protected subgraphProvider: IV3SubgraphProvider;
  protected poolProvider: IV3PoolProvider;
  protected quoteProvider: IV3QuoteProvider;
  protected tokenProvider: ITokenProvider;
  protected gasPriceProvider: IGasPriceProvider;
  protected gasModelFactory: IGasModelFactory;
  protected blockedTokenListProvider?: ITokenListProvider;

  constructor({
    chainId,
    provider,
    multicall2Provider,
    poolProvider,
    quoteProvider,
    tokenProvider,
    blockedTokenListProvider,
    subgraphProvider,
    gasPriceProvider,
    gasModelFactory,
  }: AlphaRouterParams) {
    this.chainId = chainId;
    this.provider = provider;
    this.multicall2Provider =
      multicall2Provider ??
      new UniswapMulticallProvider(chainId, provider, 375_000);
    this.poolProvider =
      poolProvider ??
      new CachingV3PoolProvider(
        this.chainId,
        new V3PoolProvider(ID_TO_CHAIN_ID(chainId), this.multicall2Provider),
        new NodeJSCache(new NodeCache())
      );
    this.quoteProvider =
      quoteProvider ??
      new V3QuoteProvider(
        this.chainId,
        this.provider,
        this.multicall2Provider,
        {
          retries: 2,
          minTimeout: 100,
          maxTimeout: 1000,
        },
        {
          multicallChunk: 210, // 210
          gasLimitPerCall: 705_000, // 705
          quoteMinSuccessRate: 0.15,
        },
        {
          gasLimitOverride: 2_000_000,
          multicallChunk: 70,
        }
      );

    this.blockedTokenListProvider =
      blockedTokenListProvider ??
      new CachingTokenListProvider(
        chainId,
        //TODO(judo): add unsupported
        {} as TokenList,
        new NodeJSCache(new NodeCache())
      );
    this.tokenProvider =
      tokenProvider ??
      new CachingTokenProviderWithFallback(
        chainId,
        new NodeJSCache(new NodeCache()),
        new CachingTokenListProvider(
          chainId,
          DEFAULT_TOKEN_LIST,
          new NodeJSCache(new NodeCache())
        ),
        new TokenProvider(chainId, this.multicall2Provider)
      );
    this.subgraphProvider =
      subgraphProvider ??
      new URISubgraphProvider(
        chainId,
        'https://ipfs.io/ipfs/QmfArMYESGVJpPALh4eQXnjF8HProSF1ky3v8RmuYLJZT4'
      );
    this.gasPriceProvider =
      gasPriceProvider ??
      new CachingGasStationProvider(
        chainId,
        new EIP1559GasPriceProvider(this.provider),
        new NodeJSCache<GasPrice>(new NodeCache({ stdTTL: 15_000 }))
      );
    this.gasModelFactory = gasModelFactory ?? new HeuristicGasModelFactory();
  }

  public async routeToRatio(
    token0Balance: CurrencyAmount,
    token1Balance: CurrencyAmount,
    position: Position,
    swapAndAddConfig: SwapAndAddConfig,
    swapConfig?: SwapConfig,
    routingConfig = DEFAULT_CONFIG
  ): Promise<SwapRoute<TradeType.EXACT_INPUT> | null> {
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
    let exchangeRate: Fraction = zeroForOne
      ? position.pool.token0Price
      : position.pool.token1Price;
    let swap: SwapRoute<TradeType.EXACT_INPUT> | null = null;
    let ratioAchieved = false;
    let n = 0;

    // iterate until we find a swap with a sufficient ratio or return null
    while (!ratioAchieved) {
      n++;
      if (n > swapAndAddConfig.maxIterations) {
        return null;
      }

      let amountToSwap = calculateRatioAmountIn(
        optimalRatio,
        exchangeRate,
        inputBalance,
        outputBalance
      );

      swap = await this.routeExactIn(
        inputBalance.currency,
        outputBalance.currency,
        amountToSwap,
        swapConfig,
        routingConfig
      );
      if (!swap) {
        return null;
      }

      let inputBalanceUpdated = inputBalance.subtract(swap.trade.inputAmount);
      let outputBalanceUpdated = outputBalance.add(swap.trade.outputAmount);
      let newRatio = inputBalanceUpdated.divide(outputBalanceUpdated);

      let targetPoolHit = false;
      swap.route.forEach((route) => {
        route.route.pools.forEach((pool, i) => {
          if (
            pool.token0.equals(position.pool.token0) &&
            pool.token1.equals(position.pool.token1) &&
            pool.fee == position.pool.fee
          ) {
            targetPoolHit = true;
            optimalRatio = this.calculateOptimalRatio(
              position,
              JSBI.BigInt(route.sqrtPriceX96AfterList[i]!.toString()),
              zeroForOne
            );
          }
        });
      });
      if (!targetPoolHit) {
        optimalRatio = preSwapOptimalRatio;
      }

      ratioAchieved =
        newRatio.equalTo(optimalRatio) ||
        this.absoluteValue(
          newRatio.asFraction.divide(optimalRatio).subtract(1)
        ).lessThan(swapAndAddConfig.errorTolerance);
      exchangeRate = swap.trade.outputAmount.divide(swap.trade.inputAmount);

      log.info({
        optimalRatio: optimalRatio.asFraction.toFixed(18),
        newRatio: newRatio.asFraction.toFixed(18),
        errorTolerance: swapAndAddConfig.errorTolerance.toFixed(18),
        iterationN: n.toString(),
      });
    }

    return swap;
  }

  public async routeExactIn(
    currencyIn: Currency,
    currencyOut: Currency,
    amountIn: CurrencyAmount,
    swapConfig?: SwapConfig,
    routingConfig: Partial<AlphaRouterConfig> = {}
  ): Promise<SwapRoute<TradeType.EXACT_INPUT> | null> {
    return this.route<TradeType.EXACT_INPUT>(
      currencyIn,
      currencyOut,
      amountIn,
      TradeType.EXACT_INPUT,
      swapConfig,
      { ...DEFAULT_CONFIG, ...routingConfig }
    );
  }

  public async routeExactOut(
    currencyIn: Currency,
    currencyOut: Currency,
    amountOut: CurrencyAmount,
    swapConfig?: SwapConfig,
    routingConfig: Partial<AlphaRouterConfig> = {}
  ): Promise<SwapRoute<TradeType.EXACT_OUTPUT> | null> {
    return this.route<TradeType.EXACT_OUTPUT>(
      currencyIn,
      currencyOut,
      amountOut,
      TradeType.EXACT_OUTPUT,
      swapConfig,
      { ...DEFAULT_CONFIG, ...routingConfig }
    );
  }

  async route<TTradeType extends TradeType>(
    currencyIn: Currency,
    currencyOut: Currency,
    amount: CurrencyAmount,
    swapType: TTradeType,
    swapConfig?: SwapConfig,
    partialRoutingConfig: Partial<AlphaRouterConfig> = {}
  ): Promise<SwapRoute<TTradeType> | null> {
    const routingConfig: AlphaRouterConfig = {
      ...DEFAULT_CONFIG,
      ...partialRoutingConfig,
    };

    const tokenIn = currencyIn.wrapped;
    const tokenOut = currencyOut.wrapped;

    // Get a block number to specify in all our calls. Ensures data we fetch from chain is
    // from the same block.
    const blockNumber =
      routingConfig.blockNumber ?? this.provider.getBlockNumber();

    // Fetch all the pools that we will consider routing via. There are thousands
    // of pools, so we filter them to a set of candidate pools that we expect will
    // result in good prices.
    const { poolAccessor, candidatePools } = await getCandidatePools({
      tokenIn,
      tokenOut,
      tokenProvider: this.tokenProvider,
      blockedTokenListProvider: this.blockedTokenListProvider,
      poolProvider: this.poolProvider,
      routeType: swapType,
      subgraphProvider: this.subgraphProvider,
      routingConfig,
      chainId: this.chainId,
    });
    const pools = poolAccessor.getAllPools();

    // Get an estimate of the gas price to use when estimating gas cost of different routes.
    const beforeGas = Date.now();
    const { gasPriceWei } = await this.gasPriceProvider.getGasPrice();

    metric.putMetric(
      'GasPriceLoad',
      Date.now() - beforeGas,
      MetricLoggerUnit.Milliseconds
    );

    const quoteToken = swapType == TradeType.EXACT_INPUT ? tokenOut : tokenIn;

    const gasModel = this.gasModelFactory.buildGasModel(
      this.chainId,
      gasPriceWei,
      poolAccessor,
      quoteToken
    );

    // Given all our candidate pools, compute all the possible ways to route from tokenIn to tokenOut.
    const { maxSwapsPerPath } = routingConfig;
    const routes = computeAllRoutes(tokenIn, tokenOut, pools, maxSwapsPerPath);

    if (routes.length == 0) {
      return null;
    }

    // Generate our distribution of amounts, i.e. fractions of the input amount.
    // We will get quotes for fractions of the input amount for different routes, then
    // combine to generate split routes.
    const [percents, amounts] = this.getAmountDistribution(
      amount,
      routingConfig
    );

    // For all our routes, and all the fractional amounts, fetch quotes on-chain.
    const quoteFn =
      swapType == TradeType.EXACT_INPUT
        ? this.quoteProvider.getQuotesManyExactIn.bind(this.quoteProvider)
        : this.quoteProvider.getQuotesManyExactOut.bind(this.quoteProvider);

    const beforeQuotes = Date.now();
    const { routesWithQuotes, blockNumber: blockNumberBN } = await quoteFn(
      amounts,
      routes,
      { blockNumber }
    );

    metric.putMetric(
      'QuotesLoad',
      Date.now() - beforeQuotes,
      MetricLoggerUnit.Milliseconds
    );

    metric.putMetric(
      'QuotesFetched',
      _(routesWithQuotes)
        .map(([, quotes]) => quotes.length)
        .sum(),
      MetricLoggerUnit.Count
    );

    // Given all the quotes for all the amounts for all the routes, find the best combination.
    const beforeBestSwap = Date.now();
    const swapRouteRaw = getBestSwapRoute(
      amount,
      percents,
      routesWithQuotes,
      quoteToken,
      swapType,
      gasModel,
      routingConfig,
      this.poolProvider
    );

    if (!swapRouteRaw) {
      return null;
    }

    this.emitGasModelLog(swapRouteRaw.routes);

    const {
      quote,
      quoteGasAdjusted,
      estimatedGasUsed,
      routes: routeAmounts,
      estimatedGasUsedQuoteToken,
      estimatedGasUsedUSD,
    } = swapRouteRaw;

    // Build Trade object that represents the optimal swap.
    const trade = this.buildTrade<TTradeType>(
      currencyIn,
      currencyOut,
      swapType,
      routeAmounts
    );

    let methodParameters: MethodParameters | undefined;

    // If user provided recipient, deadline etc. we also generate the calldata required to execute
    // the swap and return it too.
    if (swapConfig) {
      methodParameters = this.buildMethodParameters(trade, swapConfig);
    }

    metric.putMetric(
      'FindBestSwapRoute',
      Date.now() - beforeBestSwap,
      MetricLoggerUnit.Milliseconds
    );

    this.emitPoolSelectionMetrics(swapRouteRaw, candidatePools);

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
      blockNumber: blockNumberBN,
    };
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
    routeAmounts: V3RouteWithValidQuote[]
  ): Trade<Currency, Currency, TTradeType> {
    const routes = _.map<
      V3RouteWithValidQuote,
      {
        route: V3Route<Currency, Currency>;
        inputAmount: CurrencyAmount;
        outputAmount: CurrencyAmount;
      }
    >(routeAmounts, (routeAmount: V3RouteWithValidQuote) => {
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

        const routeCurrency = new V3Route(
          route.pools,
          amountCurrency.currency,
          quoteCurrency.currency
        );

        return {
          route: routeCurrency,
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

        const routeCurrency = new V3Route(
          route.pools,
          quoteCurrency.currency,
          amountCurrency.currency
        );

        return {
          route: routeCurrency,
          inputAmount: quoteCurrency,
          outputAmount: amountCurrency,
        };
      }
    });

    const trade = Trade.createUncheckedTradeWithMultipleRoutes({
      routes,
      tradeType,
    });

    return trade;
  }

  private buildMethodParameters(
    trade: Trade<Currency, Currency, TradeType>,
    swapConfig: SwapConfig
  ): MethodParameters {
    const { recipient, slippageTolerance, deadline, inputTokenPermit } =
      swapConfig;

    const methodParameters = SwapRouter.swapCallParameters(trade, {
      recipient,
      slippageTolerance,
      deadline,
      inputTokenPermit,
    });

    return methodParameters;
  }

  private emitPoolSelectionMetrics(
    swapRouteRaw: {
      quote: CurrencyAmount;
      quoteGasAdjusted: CurrencyAmount;
      routes: V3RouteWithValidQuote[];
      estimatedGasUsed: BigNumber;
    },
    poolsBySelection: CandidatePoolsBySelectionCriteria
  ) {
    const { routes: routeAmounts } = swapRouteRaw;
    const poolAddressesUsed = new Set<string>();

    _(routeAmounts)
      .flatMap((routeAmount) => {
        const {
          route: { pools },
        } = routeAmount;
        return _.map(pools, (pool) =>
          Pool.getAddress(pool.token0, pool.token1, pool.fee).toLowerCase()
        );
      })
      .forEach((address: string) => {
        poolAddressesUsed.add(address);
      });

    _.forIn(
      poolsBySelection,
      (pools: V3SubgraphPool[], topNSelection: string) => {
        const topNUsed =
          _.findLastIndex(pools, (pool) =>
            poolAddressesUsed.has(pool.id.toLowerCase())
          ) + 1;
        metric.putMetric(
          _.capitalize(topNSelection),
          topNUsed,
          MetricLoggerUnit.Count
        );
      }
    );
  }

  private emitGasModelLog(routeWithQuotes: V3RouteWithValidQuote[]) {
    if (routeWithQuotes.length > 1) {
      return;
    }

    const routeWithQuote = routeWithQuotes[0]!;
    const {
      initializedTicksCrossedList,
      quoterGasEstimate,
      tradeType,
      rawQuote,
      route,
    } = routeWithQuote;
    const initTicksCrossedTotal = _.sum(initializedTicksCrossedList);

    log.info(
      {
        initTicksCrossedTotal,
        quoterGasEstimate: quoterGasEstimate.toString(),
        tradeType,
        rawQuote: rawQuote.toString(),
        numPools: route.pools.length,
        chainId: route.chainId,
        gasInfo: true,
      },
      'Log for gas model'
    );
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
    if (fraction.lessThan(0)) {
      return fraction.multiply(-1);
    }
    return fraction;
  }
}
