import { Currency, Token, TradeType } from '@uniswap/sdk-core';
import {
  FeeAmount,
  MethodParameters,
  Pool,
  SwapRouter,
  Trade,
} from '@uniswap/v3-sdk';
import Logger from 'bunyan';
import { BigNumber, logger } from 'ethers';
import _ from 'lodash';
import { Multicall2Provider } from '../../providers/multicall2-provider';
import { PoolProvider } from '../../providers/pool-provider';
import { QuoteProvider, RouteWithQuotes } from '../../providers/quote-provider';
import { TokenProvider } from '../../providers/token-provider';
import { CurrencyAmount } from '../../util/amounts';
import { ChainId } from '../../util/chains';
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

export type V3InterfaceRouterParams = {
  chainId: ChainId;
  multicall2Provider: Multicall2Provider;
  poolProvider: PoolProvider;
  quoteProvider: QuoteProvider;
  tokenProvider: TokenProvider;
  log: Logger;
};

// Interface defaults to 2.
const MAX_HOPS = 2;

/**
 * Replicates the router implemented in the V3 interface.
 * Code is mostly a copy from https://github.com/Uniswap/uniswap-interface/blob/0190b5a408c13016c87e1030ffc59326c085f389/src/hooks/useBestV3Trade.ts#L22-L23
 * with React/Redux hooks removed, and refactoring to allow re-use in other routers.
 */
export class V3InterfaceRouter implements IRouter<void> {
  protected log: Logger;
  protected chainId: ChainId;
  protected multicall2Provider: Multicall2Provider;
  protected poolProvider: PoolProvider;
  protected quoteProvider: QuoteProvider;
  protected tokenProvider: TokenProvider;

  constructor({
    chainId,
    multicall2Provider,
    poolProvider,
    quoteProvider,
    tokenProvider,
    log,
  }: V3InterfaceRouterParams) {
    this.chainId = chainId;
    this.multicall2Provider = multicall2Provider;
    this.poolProvider = poolProvider;
    this.quoteProvider = quoteProvider;
    this.tokenProvider = tokenProvider;
    this.log = log;
  }

  public async routeExactIn(
    currencyIn: Currency,
    currencyOut: Currency,
    amountIn: CurrencyAmount,
    swapConfig: SwapConfig
  ): Promise<SwapRoute | null> {
    const tokenIn = currencyIn.wrapped;
    const tokenOut = currencyOut.wrapped;
    const routes = await this.getAllRoutes(tokenIn, tokenOut);
    const routeQuote = await this.findBestRouteExactIn(
      amountIn,
      tokenOut,
      routes
    );

    if (!routeQuote) {
      return null;
    }

    return {
      quote: routeQuote.amount,
      quoteGasAdjusted: routeQuote.amount,
      routeAmounts: [routeQuote],
      estimatedGasUsed: BigNumber.from(0),
      gasPriceWei: BigNumber.from(0),
      methodParameters: this.buildMethodParameters(
        currencyIn,
        currencyOut,
        TradeType.EXACT_INPUT,
        routeQuote,
        swapConfig
      ),
      blockNumber: BigNumber.from(0),
    };
  }

  public async routeExactOut(
    currencyIn: Currency,
    currencyOut: Currency,
    amountOut: CurrencyAmount,
    swapConfig: SwapConfig
  ): Promise<SwapRoute | null> {
    const tokenIn = currencyIn.wrapped;
    const tokenOut = currencyOut.wrapped;
    const routes = await this.getAllRoutes(tokenIn, tokenOut);
    const routeQuote = await this.findBestRouteExactOut(
      amountOut,
      tokenIn,
      routes
    );

    if (!routeQuote) {
      return null;
    }

    return {
      quote: routeQuote.amount,
      quoteGasAdjusted: routeQuote.amount,
      routeAmounts: [routeQuote],
      estimatedGasUsed: BigNumber.from(0),
      gasPriceWei: BigNumber.from(0),
      methodParameters: this.buildMethodParameters(
        currencyIn,
        currencyOut,
        TradeType.EXACT_OUTPUT,
        routeQuote,
        swapConfig
      ),
      blockNumber: BigNumber.from(0),
    };
  }

  private async findBestRouteExactIn(
    amountIn: CurrencyAmount,
    tokenOut: Token,
    routes: RouteSOR[]
  ): Promise<RouteAmount | null> {
    const { routesWithQuotes: quotesRaw } =
      await this.quoteProvider.getQuotesManyExactIn([amountIn], routes);
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
    routes: RouteSOR[]
  ): Promise<RouteAmount | null> {
    const { routesWithQuotes: quotesRaw } =
      await this.quoteProvider.getQuotesManyExactOut([amountOut], routes);
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
    this.log.debug(
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
        quoteGasAdjusted: CurrencyAmount.fromRawAmount(quoteToken, 0),
        estimatedGasUsed: BigNumber.from(0),
      };
    });

    for (let rq of routeQuotes) {
      this.log.debug(
        `Quote: ${rq.amount.toFixed(2)} Route: ${routeToString(rq.route)}`
      );
    }

    return routeQuotes[0]!;
  }

  private async getAllRoutes(
    tokenIn: Token,
    tokenOut: Token
  ): Promise<RouteSOR[]> {
    const tokenPairs: [Token, Token, FeeAmount][] = this.getAllPossiblePairings(
      tokenIn,
      tokenOut
    );

    const poolAccessor = await this.poolProvider.getPools(tokenPairs);
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

    this.log.debug(
      { routes: _.map(routes, routeToString) },
      `Computed ${routes.length} possible routes.`
    );

    return routes;
  }

  private getAllPossiblePairings(
    tokenIn: Token,
    tokenOut: Token
  ): [Token, Token, FeeAmount][] {
    const common =
      BASES_TO_CHECK_TRADES_AGAINST(this.tokenProvider)[this.chainId] ?? [];
    const additionalA =
      ADDITIONAL_BASES(this.tokenProvider)[this.chainId]?.[tokenIn.address] ??
      [];
    const additionalB =
      ADDITIONAL_BASES(this.tokenProvider)[this.chainId]?.[tokenOut.address] ??
      [];
    const bases = [...common, ...additionalA, ...additionalB];

    const basePairs: [Token, Token][] = _.flatMap(
      bases,
      (base): [Token, Token][] => bases.map((otherBase) => [base, otherBase])
    );

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
        const customBases = CUSTOM_BASES(this.tokenProvider)[this.chainId];

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
          new RouteSOR([...currentPath, pool], startTokenIn, tokenIn)
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

  private buildMethodParameters(
    tokenInCurrency: Currency,
    tokenOutCurrency: Currency,
    tradeType: TradeType,
    routeAmount: RouteAmount,
    swapConfig: SwapConfig
  ): MethodParameters {
    const { route, amount, quote } = routeAmount;
    let trade: Trade<Currency, Currency, TradeType>;

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

      trade = Trade.createUncheckedTrade({
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

      trade = Trade.createUncheckedTrade({
        route,
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
