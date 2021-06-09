import { Token } from '@uniswap/sdk-core';
import { FeeAmount, Pool } from '@uniswap/v3-sdk';
import Logger from 'bunyan';
import { BigNumber, logger } from 'ethers';
import _ from 'lodash';
import { Multicall2Provider } from '../../providers/multicall2-provider';
import { PoolProvider } from '../../providers/pool-provider';
import { QuoteProvider, RouteWithQuotes } from '../../providers/quote-provider';
import { routeToString } from '../../util/routes';
import { TokenProvider } from '../../providers/token-provider';

import { IRouter, Route, RouteAmount, RouteType, SwapRoutes } from '../router';
import {
  ADDITIONAL_BASES,
  BASES_TO_CHECK_TRADES_AGAINST,
  CUSTOM_BASES,
} from './bases';
import { CurrencyAmount } from '../../util/amounts';
import { ChainId } from '../../util/chains';

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
export class V3InterfaceRouter implements IRouter {
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
    tokenIn: Token,
    tokenOut: Token,
    amountIn: CurrencyAmount
  ): Promise<SwapRoutes | null> {
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
      raw: {
        quote: routeQuote.amount,
        quoteGasAdjusted: routeQuote.amount,
        routeAmounts: [routeQuote],
      },
    };
  }

  public async routeExactOut(
    tokenIn: Token,
    tokenOut: Token,
    amountOut: CurrencyAmount
  ): Promise<SwapRoutes | null> {
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
      raw: {
        quote: routeQuote.amount,
        quoteGasAdjusted: routeQuote.amount,
        routeAmounts: [routeQuote],
      },
    };
  }

  private async findBestRouteExactIn(
    amountIn: CurrencyAmount,
    tokenOut: Token,
    routes: Route[]
  ): Promise<RouteAmount | null> {
    const quotesRaw = await this.quoteProvider.getQuotesManyExactIn(
      [amountIn],
      routes
    );
    const bestQuote = await this.getBestQuote(
      routes,
      quotesRaw,
      tokenOut,
      RouteType.EXACT_IN
    );

    return bestQuote;
  }

  private async findBestRouteExactOut(
    amountOut: CurrencyAmount,
    tokenIn: Token,
    routes: Route[]
  ): Promise<RouteAmount | null> {
    const quotesRaw = await this.quoteProvider.getQuotesManyExactOut(
      [amountOut],
      routes
    );
    const bestQuote = await this.getBestQuote(
      routes,
      quotesRaw,
      tokenIn,
      RouteType.EXACT_OUT
    );

    return bestQuote;
  }

  private async getBestQuote(
    routes: Route[],
    quotesRaw: RouteWithQuotes[],
    quoteToken: Token,
    routeType: RouteType
  ): Promise<RouteAmount | null> {
    this.log.debug(
      `Got ${
        _.filter(quotesRaw, ([_, quotes]) => !!quotes[0]).length
      } valid quotes from ${routes.length} possible routes.`
    );

    const routeQuotesRaw: { route: Route; quote: BigNumber }[] = [];

    for (let i = 0; i < quotesRaw.length; i++) {
      const [route, quotes] = quotesRaw[i]!;
      const { quote } = quotes[0]!;

      if (!quote) {
        logger.debug(`No quote for ${routeToString(route)}`);
        continue;
      }

      routeQuotesRaw.push({ route, quote });
    }

    if (routeQuotesRaw.length == 0) {
      return null;
    }

    routeQuotesRaw.sort((routeQuoteA, routeQuoteB) => {
      if (routeType == RouteType.EXACT_IN) {
        return routeQuoteA.quote.gt(routeQuoteB.quote) ? -1 : 1;
      } else {
        return routeQuoteA.quote.lt(routeQuoteB.quote) ? -1 : 1;
      }
    });

    const routeQuotes = _.map(routeQuotesRaw, ({ route, quote }) => {
      return {
        route,
        amount: CurrencyAmount.fromRawAmount(quoteToken, quote.toString()),
        percentage: 100,
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
  ): Promise<Route[]> {
    const tokenPairs: [Token, Token, FeeAmount][] = this.getAllPossiblePairings(
      tokenIn,
      tokenOut
    );

    const poolAccessor = await this.poolProvider.getPools(tokenPairs);
    const pools = poolAccessor.getAllPools();

    const routes: Route[] = this.computeAllRoutes(
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

    const basePairs: [Token, Token][] = _.flatMap(bases, (base): [
      Token,
      Token
    ][] => bases.map((otherBase) => [base, otherBase]));

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
    allPaths: Route[] = [],
    startTokenIn: Token = tokenIn,
    maxHops = 2
  ): Route[] {
    for (const pool of pools) {
      if (currentPath.indexOf(pool) !== -1 || !pool.involvesToken(tokenIn))
        continue;

      const outputToken = pool.token0.equals(tokenIn)
        ? pool.token1
        : pool.token0;
      if (outputToken.equals(tokenOut)) {
        allPaths.push(new Route([...currentPath, pool], startTokenIn, tokenIn));
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
}
