import { ChainId, CurrencyAmount, Token } from '@uniswap/sdk-core';
import { FeeAmount, Pool } from '@uniswap/v3-sdk';
import _ from 'lodash';
import { routeToString } from '../../util/routes';

import { Route, RouteQuote, Router, RouterParams } from '../router';
import {
  ADDITIONAL_BASES,
  BASES_TO_CHECK_TRADES_AGAINST,
  CUSTOM_BASES,
} from './bases';

/**
 * Replicates the router used by the V3 interface.
 * Code is mostly a copy from https://github.com/Uniswap/uniswap-interface/blob/0190b5a408c13016c87e1030ffc59326c085f389/src/hooks/useBestV3Trade.ts#L22-L23
 * with React/Redux hooks removed, and some refactoring to allow re-use in other strategies.
 */
export class V3InterfaceRouter extends Router {
  constructor(params: RouterParams) {
    super(params);
  }

  public async routeExactIn(
    tokenIn: Token,
    tokenOut: Token,
    amountIn: CurrencyAmount
  ): Promise<RouteQuote | null> {
    const routes = await this.getAllRoutes(tokenIn, tokenOut);
    const routeQuote = await this.findBestRoute(amountIn, tokenOut, routes);
    return routeQuote;
  }

  private async findBestRoute(
    amountIn: CurrencyAmount,
    tokenOut: Token,
    routes: Route[]
  ): Promise<RouteQuote | null> {
    const quotesRaw = await this.quoteProvider.getQuotesExactIn(
      amountIn,
      routes
    );

    this.log.info(
      `Got ${_.filter(quotesRaw, (quote) => quote).length} valid quotes from ${
        routes.length
      } possible routes.`
    );

    const routeQuotesRaw = [];

    for (let i = 0; i < quotesRaw.length; i++) {
      const quote = quotesRaw[i];
      if (!quote) continue;

      routeQuotesRaw.push({ route: routes[i]!, quote });
    }

    routeQuotesRaw.sort((routeQuoteA, routeQuoteB) =>
      routeQuoteA.quote.gt(routeQuoteB.quote) ? -1 : 1
    );

    const routeQuotes = _.map(routeQuotesRaw, ({ route, quote }) => {
      return { route, quote: new CurrencyAmount(tokenOut, quote.toString()) };
    });

    for (let rq of routeQuotes) {
      this.log.debug(
        `Quote: ${rq.quote.toFixed(2)} Route: ${routeToString(rq.route)}`
      );
    }

    if (routeQuotesRaw.length == 0) {
      return null;
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
      2
    );

    this.log.debug(
      { routes: _.map(routes, routeToString) },
      `Computed possible routes.`
    );

    this.log.info(`Computed ${routes.length} possible routes.`);

    return routes;
  }

  private getAllPossiblePairings(
    tokenIn: Token,
    tokenOut: Token
  ): [Token, Token, FeeAmount][] {
    const common = BASES_TO_CHECK_TRADES_AGAINST[this.chainId] ?? [];
    const additionalA = ADDITIONAL_BASES[this.chainId]?.[tokenIn.address] ?? [];
    const additionalB =
      ADDITIONAL_BASES[this.chainId]?.[tokenOut.address] ?? [];
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
        const customBases = CUSTOM_BASES[this.chainId];

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
