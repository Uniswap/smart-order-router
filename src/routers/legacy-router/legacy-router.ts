import { Currency, Token, TradeType } from '@uniswap/sdk-core';
import {
  FeeAmount,
  MethodParameters,
  Pool,
  Route,
  SwapRouter,
  Trade,
} from '@uniswap/v3-sdk';
import { BigNumber, logger } from 'ethers';
import _ from 'lodash';
import { IMulticallProvider } from '../../providers/multicall-provider';
import { IPoolProvider } from '../../providers/pool-provider';
import {
  IQuoteProvider,
  RouteWithQuotes,
} from '../../providers/quote-provider';
import { DAI, ITokenProvider } from '../../providers/token-provider';
import { CurrencyAmount } from '../../util/amounts';
import { ChainId } from '../../util/chains';
import { log } from '../../util/log';
import { routeToString } from '../../util/routes';
import {
  IRouter,
  RouteAmount,
  RouteSOR,
  SwapConfig,
  SwapRoute,
} from '../router';
import {
  ADDITIONAL_BASES,
  BASES_TO_CHECK_TRADES_AGAINST,
  CUSTOM_BASES,
} from './bases';

export type LegacyRouterParams = {
  chainId: ChainId;
  multicall2Provider: IMulticallProvider;
  poolProvider: IPoolProvider;
  quoteProvider: IQuoteProvider;
  tokenProvider: ITokenProvider;
};

// Interface defaults to 2.
const MAX_HOPS = 2;

export type LegacyRoutingConfig = {
  blockNumber?: number;
};

/**
 * Replicates the router implemented in the V3 interface.
 * Code is mostly a copy from https://github.com/Uniswap/uniswap-interface/blob/0190b5a408c13016c87e1030ffc59326c085f389/src/hooks/useBestV3Trade.ts#L22-L23
 * with React/Redux hooks removed, and refactoring to allow re-use in other routers.
 */
export class LegacyRouter implements IRouter<LegacyRoutingConfig> {
  protected chainId: ChainId;
  protected multicall2Provider: IMulticallProvider;
  protected poolProvider: IPoolProvider;
  protected quoteProvider: IQuoteProvider;
  protected tokenProvider: ITokenProvider;

  constructor({
    chainId,
    multicall2Provider,
    poolProvider,
    quoteProvider,
    tokenProvider,
  }: LegacyRouterParams) {
    this.chainId = chainId;
    this.multicall2Provider = multicall2Provider;
    this.poolProvider = poolProvider;
    this.quoteProvider = quoteProvider;
    this.tokenProvider = tokenProvider;
  }

  public async routeExactIn(
    currencyIn: Currency,
    currencyOut: Currency,
    amountIn: CurrencyAmount,
    swapConfig?: SwapConfig,
    routingConfig?: LegacyRoutingConfig
  ): Promise<SwapRoute<TradeType.EXACT_INPUT> | null> {
    const tokenIn = currencyIn.wrapped;
    const tokenOut = currencyOut.wrapped;
    const routes = await this.getAllRoutes(tokenIn, tokenOut, routingConfig);
    const routeQuote = await this.findBestRouteExactIn(
      amountIn,
      tokenOut,
      routes,
      routingConfig
    );

    if (!routeQuote) {
      return null;
    }

    const trade = this.buildTrade<TradeType.EXACT_INPUT>(
      currencyIn,
      currencyOut,
      TradeType.EXACT_INPUT,
      routeQuote
    );

    return {
      quote: routeQuote.quote,
      quoteGasAdjusted: routeQuote.quote,
      routeAmounts: [routeQuote],
      estimatedGasUsed: BigNumber.from(0),
      estimatedGasUsedQuoteToken: CurrencyAmount.fromFractionalAmount(
        tokenOut,
        0,
        1
      ),
      estimatedGasUsedUSD: CurrencyAmount.fromFractionalAmount(DAI!, 0, 1),
      gasPriceWei: BigNumber.from(0),
      trade,
      methodParameters: swapConfig
        ? this.buildMethodParameters(
            currencyIn,
            currencyOut,
            TradeType.EXACT_INPUT,
            routeQuote,
            swapConfig
          )
        : undefined,
      blockNumber: BigNumber.from(0),
    };
  }

  public async routeExactOut(
    currencyIn: Currency,
    currencyOut: Currency,
    amountOut: CurrencyAmount,
    swapConfig?: SwapConfig,
    routingConfig?: LegacyRoutingConfig
  ): Promise<SwapRoute<TradeType.EXACT_OUTPUT> | null> {
    const tokenIn = currencyIn.wrapped;
    const tokenOut = currencyOut.wrapped;
    const routes = await this.getAllRoutes(tokenIn, tokenOut, routingConfig);
    const routeQuote = await this.findBestRouteExactOut(
      amountOut,
      tokenIn,
      routes,
      routingConfig
    );

    if (!routeQuote) {
      return null;
    }

    const trade = this.buildTrade<TradeType.EXACT_OUTPUT>(
      currencyIn,
      currencyOut,
      TradeType.EXACT_OUTPUT,
      routeQuote
    );

    return {
      quote: routeQuote.quote,
      quoteGasAdjusted: routeQuote.quote,
      routeAmounts: [routeQuote],
      estimatedGasUsed: BigNumber.from(0),
      estimatedGasUsedQuoteToken: CurrencyAmount.fromFractionalAmount(
        tokenIn,
        0,
        1
      ),
      estimatedGasUsedUSD: CurrencyAmount.fromFractionalAmount(DAI, 0, 1),
      gasPriceWei: BigNumber.from(0),
      trade,
      methodParameters: swapConfig
        ? this.buildMethodParameters(
            currencyIn,
            currencyOut,
            TradeType.EXACT_OUTPUT,
            routeQuote,
            swapConfig
          )
        : undefined,
      blockNumber: BigNumber.from(0),
    };
  }

  private async findBestRouteExactIn(
    amountIn: CurrencyAmount,
    tokenOut: Token,
    routes: RouteSOR[],
    routingConfig?: LegacyRoutingConfig
  ): Promise<RouteAmount | null> {
    const { routesWithQuotes: quotesRaw } =
      await this.quoteProvider.getQuotesManyExactIn([amountIn], routes, {
        blockNumber: routingConfig?.blockNumber,
      });

    const quotes100Percent = _.map(
      quotesRaw,
      ([route, quotes]: RouteWithQuotes) =>
        `${routeToString(route)} : ${quotes[0]?.quote?.toString()}`
    );
    log.info({ quotes100Percent }, '100% Quotes');

    const bestQuote = await this.getBestQuote(
      routes,
      quotesRaw,
      tokenOut,
      TradeType.EXACT_INPUT
    );

    return bestQuote;
  }

  private async findBestRouteExactOut(
    amountOut: CurrencyAmount,
    tokenIn: Token,
    routes: RouteSOR[],
    routingConfig?: LegacyRoutingConfig
  ): Promise<RouteAmount | null> {
    const { routesWithQuotes: quotesRaw } =
      await this.quoteProvider.getQuotesManyExactOut([amountOut], routes, {
        blockNumber: routingConfig?.blockNumber,
      });
    const bestQuote = await this.getBestQuote(
      routes,
      quotesRaw,
      tokenIn,
      TradeType.EXACT_OUTPUT
    );

    return bestQuote;
  }

  private async getBestQuote(
    routes: RouteSOR[],
    quotesRaw: RouteWithQuotes[],
    quoteToken: Token,
    routeType: TradeType
  ): Promise<RouteAmount | null> {
    log.debug(
      `Got ${
        _.filter(quotesRaw, ([_, quotes]) => !!quotes[0]).length
      } valid quotes from ${routes.length} possible routes.`
    );

    const routeQuotesRaw: {
      route: RouteSOR;
      quote: BigNumber;
      amount: CurrencyAmount;
    }[] = [];

    for (let i = 0; i < quotesRaw.length; i++) {
      const [route, quotes] = quotesRaw[i]!;
      const { quote, amount } = quotes[0]!;

      if (!quote) {
        logger.debug(`No quote for ${routeToString(route)}`);
        continue;
      }

      routeQuotesRaw.push({ route, quote, amount });
    }

    if (routeQuotesRaw.length == 0) {
      return null;
    }

    routeQuotesRaw.sort((routeQuoteA, routeQuoteB) => {
      if (routeType == TradeType.EXACT_INPUT) {
        return routeQuoteA.quote.gt(routeQuoteB.quote) ? -1 : 1;
      } else {
        return routeQuoteA.quote.lt(routeQuoteB.quote) ? -1 : 1;
      }
    });

    const routeQuotes = _.map(routeQuotesRaw, ({ route, quote, amount }) => {
      return {
        route,
        quote: CurrencyAmount.fromRawAmount(quoteToken, quote.toString()),
        amount,
        percentage: 100,
        quoteGasAdjusted: CurrencyAmount.fromRawAmount(
          quoteToken,
          quote.toString()
        ),
        estimatedGasUsed: BigNumber.from(0),
        estimatedGasUsedQuoteToken: CurrencyAmount.fromFractionalAmount(
          quoteToken,
          0,
          1
        ),
        estimatedGasUsedUSD: CurrencyAmount.fromFractionalAmount(DAI!, 0, 1),
      };
    });

    for (let rq of routeQuotes) {
      log.debug(
        `Quote: ${rq.amount.toFixed(2)} Route: ${routeToString(rq.route)}`
      );
    }

    return routeQuotes[0]!;
  }

  private async getAllRoutes(
    tokenIn: Token,
    tokenOut: Token,
    routingConfig?: LegacyRoutingConfig
  ): Promise<RouteSOR[]> {
    const tokenPairs: [Token, Token, FeeAmount][] =
      await this.getAllPossiblePairings(tokenIn, tokenOut);

    const poolAccessor = await this.poolProvider.getPools(tokenPairs, {
      blockNumber: routingConfig?.blockNumber,
    });
    const pools = poolAccessor.getAllPools();

    const routes: RouteSOR[] = this.computeAllRoutes(
      tokenIn,
      tokenOut,
      pools,
      this.chainId,
      [],
      [],
      tokenIn,
      MAX_HOPS
    );

    log.info(
      { routes: _.map(routes, routeToString) },
      `Computed ${routes.length} possible routes.`
    );

    return routes;
  }

  private async getAllPossiblePairings(
    tokenIn: Token,
    tokenOut: Token
  ): Promise<[Token, Token, FeeAmount][]> {
    const common =
      BASES_TO_CHECK_TRADES_AGAINST(this.tokenProvider)[this.chainId] ?? [];
    const additionalA =
      (await ADDITIONAL_BASES(this.tokenProvider))[this.chainId]?.[
        tokenIn.address
      ] ?? [];
    const additionalB =
      (await ADDITIONAL_BASES(this.tokenProvider))[this.chainId]?.[
        tokenOut.address
      ] ?? [];
    const bases = [...common, ...additionalA, ...additionalB];

    const basePairs: [Token, Token][] = _.flatMap(
      bases,
      (base): [Token, Token][] => bases.map((otherBase) => [base, otherBase])
    );

    const customBases = (await CUSTOM_BASES(this.tokenProvider))[this.chainId];

    const allPairs: [Token, Token, FeeAmount][] = _([
      // the direct pair
      [tokenIn, tokenOut],
      // token A against all bases
      ...bases.map((base): [Token, Token] => [tokenIn, base]),
      // token B against all bases
      ...bases.map((base): [Token, Token] => [tokenOut, base]),
      // each base against all bases
      ...basePairs,
    ])
      .filter((tokens): tokens is [Token, Token] =>
        Boolean(tokens[0] && tokens[1])
      )
      .filter(
        ([tokenA, tokenB]) =>
          tokenA.address !== tokenB.address && !tokenA.equals(tokenB)
      )
      .filter(([tokenA, tokenB]) => {
        const customBasesA: Token[] | undefined = customBases?.[tokenA.address];
        const customBasesB: Token[] | undefined = customBases?.[tokenB.address];

        if (!customBasesA && !customBasesB) return true;

        if (customBasesA && !customBasesA.find((base) => tokenB.equals(base)))
          return false;
        if (customBasesB && !customBasesB.find((base) => tokenA.equals(base)))
          return false;

        return true;
      })
      .flatMap<[Token, Token, FeeAmount]>(([tokenA, tokenB]) => {
        return [
          [tokenA, tokenB, FeeAmount.LOW],
          [tokenA, tokenB, FeeAmount.MEDIUM],
          [tokenA, tokenB, FeeAmount.HIGH],
        ];
      })
      .value();

    return allPairs;
  }

  private computeAllRoutes(
    tokenIn: Token,
    tokenOut: Token,
    pools: Pool[],
    chainId: ChainId,
    currentPath: Pool[] = [],
    allPaths: RouteSOR[] = [],
    startTokenIn: Token = tokenIn,
    maxHops = 2
  ): RouteSOR[] {
    for (const pool of pools) {
      if (currentPath.indexOf(pool) !== -1 || !pool.involvesToken(tokenIn))
        continue;

      const outputToken = pool.token0.equals(tokenIn)
        ? pool.token1
        : pool.token0;
      if (outputToken.equals(tokenOut)) {
        allPaths.push(
          new RouteSOR([...currentPath, pool], startTokenIn, tokenOut)
        );
      } else if (maxHops > 1) {
        this.computeAllRoutes(
          outputToken,
          tokenOut,
          pools,
          chainId,
          [...currentPath, pool],
          allPaths,
          startTokenIn,
          maxHops - 1
        );
      }
    }

    return allPaths;
  }

  private buildTrade<TTradeType extends TradeType>(
    tokenInCurrency: Currency,
    tokenOutCurrency: Currency,
    tradeType: TTradeType,
    routeAmount: RouteAmount
  ): Trade<Currency, Currency, TTradeType> {
    const { route, amount, quote } = routeAmount;

    // The route, amount and quote are all in terms of wrapped tokens.
    // When constructing the Trade object the inputAmount/outputAmount must
    // use native currencies if necessary. This is so that the Trade knows to wrap/unwrap.
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

      const routeCurrency = new Route(
        route.pools,
        amountCurrency.currency,
        quoteCurrency.currency
      );

      const trade = Trade.createUncheckedTradeWithMultipleRoutes({
        routes: [
          {
            route: routeCurrency,
            inputAmount: amountCurrency,
            outputAmount: quoteCurrency,
          },
        ],
        tradeType,
      });

      return trade;
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

      const routeCurrency = new Route(
        route.pools,
        quoteCurrency.currency,
        amountCurrency.currency
      );

      const trade = Trade.createUncheckedTradeWithMultipleRoutes({
        routes: [
          {
            route: routeCurrency,
            inputAmount: quoteCurrency,
            outputAmount: amountCurrency,
          },
        ],
        tradeType,
      });

      return trade;
    }
  }

  private buildMethodParameters(
    tokenInCurrency: Currency,
    tokenOutCurrency: Currency,
    tradeType: TradeType,
    routeAmount: RouteAmount,
    swapConfig: SwapConfig
  ): MethodParameters {
    const { route, amount, quote } = routeAmount;

    let trade: Trade<Currency, Currency, TradeType>;

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

      const routeCurrency = new Route(
        route.pools,
        amountCurrency.currency,
        quoteCurrency.currency
      );

      trade = Trade.createUncheckedTrade({
        route: routeCurrency,
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

      const routeCurrency = new Route(
        route.pools,
        quoteCurrency.currency,
        amountCurrency.currency
      );

      trade = Trade.createUncheckedTrade({
        route: routeCurrency,
        tradeType: TradeType.EXACT_OUTPUT,
        inputAmount: quoteCurrency,
        outputAmount: amountCurrency,
      });
    }

    const { recipient, slippageTolerance, deadline } = swapConfig;

    const methodParameters = SwapRouter.swapCallParameters([trade], {
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
