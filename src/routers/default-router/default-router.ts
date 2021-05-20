import { ChainId, Fraction, Token } from '@uniswap/sdk-core';
import Logger from 'bunyan';
import _ from 'lodash';
import { Multicall2Provider } from '../../providers/multicall2-provider';
import { PoolProvider } from '../../providers/pool-provider';
import { QuoteProvider, RouteQuotes } from '../../providers/quote-provider';
import { TokenProvider } from '../../providers/token-provider';

import { IRouter, Route, RouteAmount, SwapRoute } from '../router';
import {
  printSubgraphPool,
  SubgraphPool,
  SubgraphProvider,
} from '../../providers/subgraph-provider';
import { FeeAmount, Pool } from '@uniswap/v3-sdk';
import { CurrencyAmount, parseFeeAmount } from '../../util/amounts';
import { routeToString } from '../../util/routes';
import { BigNumber } from '@ethersproject/bignumber';

export type DefaultRouterParams = {
  chainId: ChainId;
  multicall2Provider: Multicall2Provider;
  subgraphProvider: SubgraphProvider;
  poolProvider: PoolProvider;
  quoteProvider: QuoteProvider;
  tokenProvider: TokenProvider;
  log: Logger;
};

const TOP_N = 10;
// Max swaps in a path.
const MAX_SWAPS = 3;
const MAX_SPLITS = 3;
const DISTRIBUTION_PERCENT = 5;

type RouteQuote = {
  route: Route;
  quote: BigNumber;
};

type RouteQuotePercent = {
  percent: number;
} & RouteQuote;

export class DefaultRouter implements IRouter {
  protected log: Logger;
  protected chainId: ChainId;
  protected multicall2Provider: Multicall2Provider;
  protected subgraphProvider: SubgraphProvider;
  protected poolProvider: PoolProvider;
  protected quoteProvider: QuoteProvider;
  protected tokenProvider: TokenProvider;

  constructor({
    chainId,
    multicall2Provider,
    poolProvider,
    quoteProvider,
    tokenProvider,
    subgraphProvider,
    log,
  }: DefaultRouterParams) {
    this.chainId = chainId;
    this.multicall2Provider = multicall2Provider;
    this.poolProvider = poolProvider;
    this.quoteProvider = quoteProvider;
    this.tokenProvider = tokenProvider;
    this.subgraphProvider = subgraphProvider;
    this.log = log;
  }

  public async routeExactIn(
    tokenIn: Token,
    tokenOut: Token,
    amountIn: CurrencyAmount
  ): Promise<SwapRoute | null> {
    const pools = await this.getPoolsToConsider(tokenIn, tokenOut);

    const routes = this.computeAllRoutes(tokenIn, tokenOut, pools, MAX_SWAPS);

    const [percents, amounts] = this.getAmountDistribution(amountIn);
    this.log.debug(
      { percents, amounts: amounts.map((a) => a.toFixed(2)) },
      'PERCENTS AMOUNTS'
    );
    const routesQuotes: RouteQuotes[] = await this.quoteProvider.getQuotesExactIns(
      amounts,
      routes
    );
    const swapRoute = this.getBestSwapRoute(percents, routesQuotes, tokenOut);

    return swapRoute;
  }

  private getBestSwapRoute(
    percents: number[],
    routesQuotes: RouteQuotes[],
    tokenOut: Token
  ): SwapRoute | null {
    const percentToQuotes: { [percent: number]: RouteQuote[] } = {};

    for (const routeQuote of routesQuotes) {
      const [route, quotes] = routeQuote;

      for (let i = 0; i < quotes.length; i++) {
        const percent = percents[i]!;
        const quote = quotes[i];

        if (!quote) {
          this.log.debug(
            { route: routeToString(route) },
            'Dropping a null quote for route.'
          );
          continue;
        }

        if (!percentToQuotes[percent]) {
          percentToQuotes[percent] = [];
        }
        percentToQuotes[percent]!.push({ route, quote });
      }
    }

    this.log.debug({ percentToQuotes }, 'Percent to quotes');

    const percentToSortedQuotes = _.mapValues(
      percentToQuotes,
      (routeQuotes: RouteQuote[]) => {
        return routeQuotes.sort((routeQuoteA, routeQuoteB) => {
          return routeQuoteA.quote.gt(routeQuoteB.quote) ? -1 : 1;
        });
      }
    );

    if (!percentToSortedQuotes[100]) {
      return null;
    }

    const findFirstRouteNotReusingPools = (
      routes: Route[],
      routeQuotes: RouteQuote[]
    ): RouteQuote | null => {
      const getPoolAddress = (pool: Pool) =>
        Pool.getAddress(pool.token0, pool.token1, pool.fee);

      const poolAddressSet = new Set();
      for (let pool of _(routes).map('pools').flatten().value()) {
        poolAddressSet.add(getPoolAddress(pool));
      }

      for (const routeQuote of routeQuotes) {
        const pools = routeQuote.route.pools;
        if (pools.some((pool) => poolAddressSet.has(getPoolAddress(pool)))) {
          continue;
        }

        return routeQuote;
      }

      return null;
    };

    let bestQuote = percentToSortedQuotes[100][0]!.quote;
    let bestSwap: RouteQuotePercent[] = [
      { ...percentToSortedQuotes[100][0]!, percent: 100 },
    ];

    let splits = 1;
    while (splits < MAX_SPLITS) {
      if (splits == 1) {
        for (let i = 0; i < Math.ceil(percents.length / 2); i++) {
          const percent = percents[i]!;
          const routeQuoteA = percentToSortedQuotes[percent]![0]!;
          const { route: routeA, quote: quoteA } = routeQuoteA;

          const remainingPercent = 100 - percent;
          const remainingQuotes = percentToSortedQuotes[remainingPercent]!;

          if (!remainingQuotes) {
            continue;
          }

          const routeQuoteB = findFirstRouteNotReusingPools(
            [routeA],
            remainingQuotes
          );

          if (!routeQuoteB) {
            continue;
          }

          const newQuote = quoteA.add(routeQuoteB.quote);
          if (newQuote.gt(bestQuote)) {
            bestQuote = newQuote;
            bestSwap = [
              { ...routeQuoteA, percent },
              { ...routeQuoteB, percent: remainingPercent },
            ];
          }
        }
      }

      if (splits == 2) {
        for (let i = 0; i < percents.length; i++) {
          const percent = percents[i]!;
          const routeQuoteA = percentToSortedQuotes[percent]![0]!;
          const { route: routeA, quote: quoteA } = routeQuoteA;
          const remainingPercent = 100 - percent;

          for (let j = i + 1; j < percents.length; j++) {
            const percentB = percents[j]!;

            const routeQuoteB = findFirstRouteNotReusingPools(
              [routeA],
              percentToSortedQuotes[percentB]!
            );

            if (!routeQuoteB) {
              continue;
            }

            const { route: routeB, quote: quoteB } = routeQuoteB;
            const percentC = remainingPercent - percentB;

            const remainingQuotes = percentToSortedQuotes[percentC]!;

            if (!remainingQuotes) {
              continue;
            }

            const routeQuoteC = findFirstRouteNotReusingPools(
              [routeA, routeB],
              remainingQuotes
            );

            if (!routeQuoteC) {
              continue;
            }

            const { quote: quoteC } = routeQuoteC;

            const newQuote = quoteA.add(quoteB).add(quoteC);
            if (newQuote.gt(bestQuote)) {
              bestQuote = newQuote;
              bestSwap = [
                { ...routeQuoteA, percent },
                { ...routeQuoteB, percent: percentB },
                { ...routeQuoteC, percent: percentC },
              ];
            }
          }
        }
      }

      splits += 1;
    }

    const amount = CurrencyAmount.fromRawAmount(tokenOut, bestQuote.toString());
    const routeAmounts = _.map<RouteQuotePercent, RouteAmount>(
      bestSwap,
      (rq: RouteQuotePercent) => {
        return {
          route: rq.route,
          amount: CurrencyAmount.fromRawAmount(tokenOut, rq.quote.toString()),
          percentage: rq.percent,
        };
      }
    );

    return {
      amount,
      routeAmounts,
    };
  }

  private getAmountDistribution(
    amount: CurrencyAmount
  ): [number[], CurrencyAmount[]] {
    let percents = [];
    let amounts = [];

    for (let i = 1; i <= 100 / DISTRIBUTION_PERCENT; i++) {
      percents.push(i * DISTRIBUTION_PERCENT);
      amounts.push(
        amount.multiply(new Fraction(i * DISTRIBUTION_PERCENT, 100))
      );
    }

    return [percents, amounts];
  }

  private async getPoolsToConsider(
    tokenIn: Token,
    tokenOut: Token
  ): Promise<Pool[]> {
    const allPools = await this.subgraphProvider.getPools();

    // Only consider pools where both tokens are in the token list.
    const tokenListPools = _.filter(allPools, (pool) => {
      return (
        this.tokenProvider.tokenExists(this.chainId, pool.token0.symbol) &&
        this.tokenProvider.tokenExists(this.chainId, pool.token1.symbol)
      );
    });

    const directSwapPool = _.find(tokenListPools, (tokenListPool) => {
      return (
        (tokenListPool.token0.symbol == tokenIn.symbol &&
          tokenListPool.token1.symbol == tokenOut.symbol) ||
        (tokenListPool.token1.symbol == tokenIn.symbol &&
          tokenListPool.token0.symbol == tokenOut.symbol)
      );
    });

    const topByTVL = _(tokenListPools)
      .sortBy((tokenListPool) => -tokenListPool.totalValueLockedETH)
      .slice(0, TOP_N)
      .value();

    const topByTVLUsingTokenIn = _(tokenListPools)
      .filter((tokenListPool) => {
        return (
          tokenListPool.token0.symbol == tokenIn.symbol ||
          tokenListPool.token1.symbol == tokenIn.symbol
        );
      })
      .sortBy((tokenListPool) => -tokenListPool.totalValueLockedETH)
      .slice(0, TOP_N)
      .value();

    const topByTVLUsingTokenOut = _(tokenListPools)
      .filter((tokenListPool) => {
        return (
          tokenListPool.token0.symbol == tokenOut.symbol ||
          tokenListPool.token1.symbol == tokenOut.symbol
        );
      })
      .sortBy((tokenListPool) => -tokenListPool.totalValueLockedETH)
      .slice(0, TOP_N)
      .value();

    this.log.debug(
      {
        topByTVLUsingTokenIn: topByTVLUsingTokenIn.map(printSubgraphPool),
        topByTVLUsingTokenOut: topByTVLUsingTokenOut.map(printSubgraphPool),
        topByTVL: topByTVL.map(printSubgraphPool),
        directSwap: directSwapPool
          ? printSubgraphPool(directSwapPool)
          : undefined,
      },
      `Pools for consideration using top ${TOP_N}`
    );

    const subgraphPools = _([
      directSwapPool,
      ...topByTVL,
      ...topByTVLUsingTokenIn,
      ...topByTVLUsingTokenOut,
    ])
      .compact()
      .uniqBy((pool) => pool.id)
      .value();

    this.log.debug(
      {
        subgraphPools: subgraphPools.map(printSubgraphPool),
      },
      `${subgraphPools.length} pools under consideration.`
    );

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

    const poolAccessor = await this.poolProvider.getPools(tokenPairs);

    return poolAccessor.getAllPools();
  }

  public async routeExactOut(
    tokenIn: Token,
    tokenOut: Token,
    amountOut: CurrencyAmount
  ): Promise<SwapRoute | null> {
    this.log.info({ tokenIn, tokenOut, amountOut });
    return null;
  }

  private computeAllRoutes(
    tokenIn: Token,
    tokenOut: Token,
    pools: Pool[],
    maxHops: number
  ): Route[] {
    const poolsUsed = Array<Boolean>(pools.length).fill(false);
    const routes: Route[] = [];

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
        routes.push(new Route([...currentRoute], tokenIn, tokenOut));
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

    this.log.debug(
      { routes: routes.map(routeToString) },
      `Computed ${routes.length} possible routes.`
    );

    return routes;
  }
}
