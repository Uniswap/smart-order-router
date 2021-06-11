import { Fraction, Token } from '@uniswap/sdk-core';
import Logger from 'bunyan';
import _ from 'lodash';
import { Multicall2Provider } from '../../providers/multicall2-provider';
import { PoolAccessor, PoolProvider } from '../../providers/pool-provider';
import { QuoteProvider, RouteWithQuotes } from '../../providers/quote-provider';
import { TokenProvider } from '../../providers/token-provider';

import {
  IRouter,
  Route,
  RouteAmount,
  RouteType,
  SwapRoute,
  SwapRoutes,
} from '../router';
import {
  printSubgraphPool,
  SubgraphPool,
  SubgraphProvider,
} from '../../providers/subgraph-provider';
import { FeeAmount, Pool } from '@uniswap/v3-sdk';
import { CurrencyAmount, parseFeeAmount } from '../../util/amounts';
import { routeToString } from '../../util/routes';
import { RouteWithValidQuote } from './entities/route-with-valid-quote';
import { GasPriceProvider } from '../../providers/gas-price-provider';
import { GasModel, GasModelFactory } from './gas-models/gas-model';
import { ChainId } from '../../util/chains';

export type DefaultRouterParams = {
  chainId: ChainId;
  multicall2Provider: Multicall2Provider;
  subgraphProvider: SubgraphProvider;
  poolProvider: PoolProvider;
  quoteProvider: QuoteProvider;
  tokenProvider: TokenProvider;
  gasPriceProvider: GasPriceProvider;
  gasModelFactory: GasModelFactory;
  log: Logger;
};

export type DefaultRouterConfig = {
  topN: number;
  maxSwapsPerPath: number;
  maxSplits: number;
  distributionPercent: number;
  multicallChunkSize: number;
};

export const DEFAULT_CONFIG: DefaultRouterConfig = {
  topN: 10,
  maxSwapsPerPath: 3,
  maxSplits: 3,
  distributionPercent: 5,
  multicallChunkSize: 20,
};

export class DefaultRouter implements IRouter<DefaultRouterConfig> {
  protected log: Logger;
  protected chainId: ChainId;
  protected multicall2Provider: Multicall2Provider;
  protected subgraphProvider: SubgraphProvider;
  protected poolProvider: PoolProvider;
  protected quoteProvider: QuoteProvider;
  protected tokenProvider: TokenProvider;
  protected gasPriceProvider: GasPriceProvider;
  protected gasModelFactory: GasModelFactory;

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
  }

  public async routeExactIn(
    tokenIn: Token,
    tokenOut: Token,
    amountIn: CurrencyAmount,
    routingConfig = DEFAULT_CONFIG
  ): Promise<SwapRoutes | null> {
    const poolAccessor = await this.getPoolsToConsider(
      tokenIn,
      tokenOut,
      RouteType.EXACT_IN,
      routingConfig
    );
    const pools = poolAccessor.getAllPools();

    const { gasPriceWei } = await this.gasPriceProvider.getGasPrice();
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
    const routesWithQuotes = await this.quoteProvider.getQuotesManyExactIn(
      amounts,
      routes,
      multicallChunkSize
    );

    const swapRoute = this.getBestSwapRoute(
      percents,
      routesWithQuotes,
      tokenOut,
      RouteType.EXACT_IN,
      gasModel,
      routingConfig
    );

    return swapRoute;
  }

  public async routeExactOut(
    tokenIn: Token,
    tokenOut: Token,
    amountOut: CurrencyAmount,
    routingConfig = DEFAULT_CONFIG
  ): Promise<SwapRoutes | null> {
    const poolAccessor = await this.getPoolsToConsider(
      tokenIn,
      tokenOut,
      RouteType.EXACT_IN,
      routingConfig
    );
    const pools = poolAccessor.getAllPools();

    const { gasPriceWei } = await this.gasPriceProvider.getGasPrice();
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
    const routesWithQuotes = await this.quoteProvider.getQuotesManyExactOut(
      amounts,
      routes,
      multicallChunkSize
    );
    const swapRoute = this.getBestSwapRoute(
      percents,
      routesWithQuotes,
      tokenIn,
      RouteType.EXACT_OUT,
      gasModel,
      routingConfig
    );

    return swapRoute;
  }

  private getBestSwapRoute(
    percents: number[],
    routesWithQuotes: RouteWithQuotes[],
    quoteToken: Token,
    routeType: RouteType,
    gasModel: GasModel,
    routingConfig: DefaultRouterConfig
  ): SwapRoutes | null {
    this.log.info('Starting algorithm to find best swap route');
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
          gasEstimate,
          gasModel,
          quoteToken,
          log: this.log,
        });

        percentToQuotes[percent]!.push(routeWithValidQuote);
      }
    }

    const swapRoute = this.getBestSwapRouteBy(
      routeType,
      percentToQuotes,
      percents,
      (rq: RouteWithValidQuote) => rq.quote,
      routingConfig
    );

    if (!swapRoute) {
      return null;
    }

    const swapRouteGasAdjusted = this.getBestSwapRouteBy(
      routeType,
      percentToQuotes,
      percents,
      (rq: RouteWithValidQuote) => rq.quoteAdjustedForGas,
      routingConfig
    );

    this.log.info('Found best swap route');

    return { raw: swapRoute, gasAdjusted: swapRouteGasAdjusted };
  }

  private getBestSwapRouteBy(
    routeType: RouteType,
    percentToQuotes: { [percent: number]: RouteWithValidQuote[] },
    percents: number[],
    by: (routeQuote: RouteWithValidQuote) => CurrencyAmount,
    routingConfig: DefaultRouterConfig
  ): SwapRoute | undefined {
    const percentToSortedQuotes = _.mapValues(
      percentToQuotes,
      (routeQuotes: RouteWithValidQuote[]) => {
        return routeQuotes.sort((routeQuoteA, routeQuoteB) => {
          if (routeType == RouteType.EXACT_IN) {
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
      usedRoutes: Route[],
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
      routeType == RouteType.EXACT_IN
        ? (a: CurrencyAmount, b: CurrencyAmount) => a.greaterThan(b)
        : (a: CurrencyAmount, b: CurrencyAmount) => a.lessThan(b);

    let splits = 2;
    while (splits <= routingConfig.maxSplits) {
      if (splits == 2) {
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
      }

      if (splits == 3) {
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
      }

      if (splits == 4) {
        throw new Error('Not implemented');
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

    const quoteGasAdjusted = sum(
      _.map(
        bestSwap,
        (routeWithValidQuote) => routeWithValidQuote.quoteAdjustedForGas
      )
    );

    const quote = sum(
      _.map(bestSwap, (routeWithValidQuote) => routeWithValidQuote.quote)
    );

    const routeAmounts = _.map<RouteWithValidQuote, RouteAmount>(
      bestSwap,
      (rq: RouteWithValidQuote) => {
        return {
          route: rq.route,
          amount: rq.quote,
          percentage: rq.percent,
        };
      }
    ).sort(
      (routeAmountA, routeAmountB) =>
        routeAmountB.percentage - routeAmountA.percentage
    );

    return { quote, quoteGasAdjusted, routeAmounts };
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
    routeType: RouteType,
    routingConfig: DefaultRouterConfig
  ): Promise<PoolAccessor> {
    const { topN } = routingConfig;
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

    const ethPool = _.find(tokenListPools, (tokenListPool) => {
      if (routeType == RouteType.EXACT_IN) {
        return (
          (tokenListPool.token0.symbol == 'WETH' &&
            tokenListPool.token1.symbol == tokenOut.symbol) ||
          (tokenListPool.token1.symbol == tokenOut.symbol &&
            tokenListPool.token0.symbol == 'WETH')
        );
      } else {
        return (
          (tokenListPool.token0.symbol == 'WETH' &&
            tokenListPool.token1.symbol == tokenIn.symbol) ||
          (tokenListPool.token1.symbol == tokenIn.symbol &&
            tokenListPool.token0.symbol == 'WETH')
        );
      }
    });

    const topByTVL = _(tokenListPools)
      .sortBy((tokenListPool) => -tokenListPool.totalValueLockedETH)
      .slice(0, topN)
      .value();

    const topByTVLUsingTokenIn = _(tokenListPools)
      .filter((tokenListPool) => {
        return (
          tokenListPool.token0.symbol == tokenIn.symbol ||
          tokenListPool.token1.symbol == tokenIn.symbol
        );
      })
      .sortBy((tokenListPool) => -tokenListPool.totalValueLockedETH)
      .slice(0, topN)
      .value();

    const topByTVLUsingTokenOut = _(tokenListPools)
      .filter((tokenListPool) => {
        return (
          tokenListPool.token0.symbol == tokenOut.symbol ||
          tokenListPool.token1.symbol == tokenOut.symbol
        );
      })
      .sortBy((tokenListPool) => -tokenListPool.totalValueLockedETH)
      .slice(0, topN)
      .value();

    this.log.info(
      {
        topByTVLUsingTokenIn: topByTVLUsingTokenIn.map(printSubgraphPool),
        topByTVLUsingTokenOut: topByTVLUsingTokenOut.map(printSubgraphPool),
        topByTVL: topByTVL.map(printSubgraphPool),
        directSwap: directSwapPool
          ? printSubgraphPool(directSwapPool)
          : undefined,
        ethPool: ethPool ? printSubgraphPool(ethPool) : undefined,
      },
      `Pools for consideration using top ${topN}`
    );

    const subgraphPools = _([
      directSwapPool,
      ethPool,
      ...topByTVL,
      ...topByTVLUsingTokenIn,
      ...topByTVLUsingTokenOut,
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

    const poolAccessor = await this.poolProvider.getPools(tokenPairs);

    return poolAccessor;
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
