import { Token, TradeType } from '@uniswap/sdk-core';
import {
  Pool,
} from '@uniswap/v3-sdk';
import { BigNumber } from 'ethers';
import _ from 'lodash';
import { FixedReverseHeap } from 'mnemonist';
import { IPoolProvider } from '../../../providers';
import {
  RouteWithQuotes,
} from '../../../providers/quote-provider';
import { CurrencyAmount } from '../../../util/amounts';
import { log } from '../../../util/log';
import { metric, MetricLoggerUnit } from '../../../util/metric';
import { routeAmountsToString, routeToString } from '../../../util/routes';
import {
  RouteSOR,
} from '../../router';
import { AlphaRouterConfig } from '../alpha-router';
import { RouteWithValidQuote } from './../entities/route-with-valid-quote';
import { GasModel } from './../gas-models/gas-model';

export function getBestSwapRoute(
  amount: CurrencyAmount,
  percents: number[],
  routesWithQuotes: RouteWithQuotes[],
  quoteToken: Token,
  routeType: TradeType,
  gasModel: GasModel,
  routingConfig: AlphaRouterConfig,
  poolProvider: IPoolProvider,
): {
  quote: CurrencyAmount;
  quoteGasAdjusted: CurrencyAmount;
  estimatedGasUsed: BigNumber;
  estimatedGasUsedUSD: CurrencyAmount;
  estimatedGasUsedQuoteToken: CurrencyAmount;
  routes: RouteWithValidQuote[];
} | null {
  const now = Date.now();

  // Build a map of percentage of the input to list of valid quotes.
  // Quotes can be null for a variety of reasons (not enough liquidity etc), so we drop them here too.
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
        log.debug(
          {
            route: routeToString(route),
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
      });

      percentToQuotes[percent]!.push(routeWithValidQuote);
    }
  }

  metric.putMetric(
    'BuildRouteWithValidQuoteObjects',
    Date.now() - now,
    MetricLoggerUnit.Milliseconds
  );

  // Given all the valid quotes for each percentage find the optimal route.
  const swapRoute = getBestSwapRouteBy(
    routeType,
    percentToQuotes,
    percents,
    (rq: RouteWithValidQuote) => rq.quoteAdjustedForGas,
    routingConfig,
    poolProvider
  );

  // It is possible we were unable to find any valid route given the quotes.
  if (!swapRoute) {
    return null;
  }

  // Due to potential loss of precision when taking percentages of the input it is possible that the sum of the amounts of each
  // route of our optimal quote may not add up exactly to exactIn or exactOut.
  //
  // We check this here, and if there is a mismatch
  // add the missing amount to a random route. The missing amount size should be neglible so the quote should still be highly accurate.
  const { routes: routeAmounts } = swapRoute;
  const totalAmount = _.reduce(
    routeAmounts,
    (total, routeAmount) => total.add(routeAmount.amount),
    CurrencyAmount.fromRawAmount(routeAmounts[0]!.amount.currency, 0)
  );

  const missingAmount = amount.subtract(totalAmount);
  if (missingAmount.greaterThan(0)) {
    log.info(
      {
        missingAmount: missingAmount.quotient.toString(),
      },
      `Optimal route's amounts did not equal exactIn/exactOut total. Adding missing amount to last route in array.`
    );

    routeAmounts[routeAmounts.length - 1]!.amount =
      routeAmounts[routeAmounts.length - 1]!.amount.add(missingAmount);
  }

  log.info(
    {
      routes: routeAmountsToString(routeAmounts),
      numSplits: routeAmounts.length,
      amount: amount.toExact(),
      quote: swapRoute.quote.toExact(),
      quoteGasAdjusted: swapRoute.quoteGasAdjusted.toFixed(2),
      estimatedGasUSD: swapRoute.estimatedGasUsedUSD.toFixed(2),
      estimatedGasToken: swapRoute.estimatedGasUsedQuoteToken.toFixed(2),
    },
    `Found best swap route. ${routeAmounts.length} split.`
  );

  return swapRoute;
}

function getBestSwapRouteBy(
  routeType: TradeType,
  percentToQuotes: { [percent: number]: RouteWithValidQuote[] },
  percents: number[],
  by: (routeQuote: RouteWithValidQuote) => CurrencyAmount,
  routingConfig: AlphaRouterConfig,
  poolProvider: IPoolProvider
):
  | {
      quote: CurrencyAmount;
      quoteGasAdjusted: CurrencyAmount;
      estimatedGasUsed: BigNumber;
      estimatedGasUsedUSD: CurrencyAmount;
      estimatedGasUsedQuoteToken: CurrencyAmount;
      routes: RouteWithValidQuote[];
    }
  | undefined {
  // Build a map of percentage to sorted list of quotes, with the biggest quote being first in the list.
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

  // We do not allow pools to be re-used across split routes, as swapping through a pool changes the pools state.
  // Given a list of used routes, this function finds the first route in the list of candidate routes that does not re-use an already used pool.
  const findFirstRouteNotUsingUsedPools = (
    usedRoutes: RouteSOR[],
    candidateRouteQuotes: RouteWithValidQuote[]
  ): RouteWithValidQuote | null => {
    const getPoolAddress = (pool: Pool) => {
      return poolProvider.getPoolAddress(
        pool.token0,
        pool.token1,
        pool.fee
      ).poolAddress;
    };

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
    log.info(
      {
        percentToSortedQuotes: _.mapValues(
          percentToSortedQuotes,
          (p) => p.length
        ),
      },
      'Did not find a valid route without any splits.'
    );
    return undefined;
  }

  // Start with our first best swap as being the quote where we send 100% of token through a single route.
  let bestQuote = by(percentToSortedQuotes[100][0]!);
  let bestSwap: RouteWithValidQuote[] = [percentToSortedQuotes[100][0]!];

  log.info(
    {
      top: _.map(
        percentToSortedQuotes[100].slice(0, 5),
        (routeWithValidQuote) => {
          return `${routeWithValidQuote.quoteAdjustedForGas.toFixed()} [NoGas: ${routeWithValidQuote.quote.toFixed()}] [EstGas: ${
            routeWithValidQuote.gasEstimate
          }] [TicksCrossed: ${
            routeWithValidQuote.initializedTicksCrossedList
          }]: ${routeToString(routeWithValidQuote.route)}`;
        }
      ),
    },
    'Top 5 with 1 split'
  );

  const quoteCompFn =
    routeType == TradeType.EXACT_INPUT
      ? (a: CurrencyAmount, b: CurrencyAmount) => a.greaterThan(b)
      : (a: CurrencyAmount, b: CurrencyAmount) => a.lessThan(b);

  let splits = 2;

  while (splits <= routingConfig.maxSplits) {
    if (splits == 2) {
      // We track the top 5 best options we find for logging/debugging.
      const bestTwoSplits = new FixedReverseHeap<{
        quote: CurrencyAmount;
        routes: RouteWithValidQuote[];
      }>(
        Array,
        (a, b) => {
          return quoteCompFn(a.quote, b.quote) ? -1 : 1;
        },
        5
      );

      const split2Now = Date.now();
      for (let i = percents.length - 1; i >= 0; i--) {
        const percentA = percents[i]!;

        // At some point the amount * percentage is so small that the quoter is unable to get
        // a quote. In this case there could be no quotes for that percentage.
        if (!percentToSortedQuotes[percentA]) {
          continue;
        }

        // Get the best quote for the current percentage we are considering.
        const routeWithQuoteA = percentToSortedQuotes[percentA]![0]!;
        const { route: routeA } = routeWithQuoteA;
        const quoteA = by(routeWithQuoteA);

        // Get all the quotes for complimentary percentage to the current percentage.
        const percentB = 100 - percentA;
        const candidateRoutesB = percentToSortedQuotes[percentB]!;

        if (!candidateRoutesB) {
          continue;
        }

        // Find the best route in the complimentary percentage that doesn't re-use a pool already
        // used in the best route for the current percentage.
        const routeWithQuoteB = findFirstRouteNotUsingUsedPools(
          [routeA],
          candidateRoutesB
        );

        if (!routeWithQuoteB) {
          continue;
        }

        const newQuote = quoteA.add(by(routeWithQuoteB));

        bestTwoSplits.push({
          quote: newQuote,
          routes: [routeWithQuoteA, routeWithQuoteB],
        });

        if (quoteCompFn(newQuote, bestQuote)) {
          bestQuote = newQuote;
          bestSwap = [routeWithQuoteA, routeWithQuoteB];
        }
      }

      log.info(
        {
          top5TwoSplits: _.map(
            Array.from(bestTwoSplits.consume()),
            (q) =>
              `${q.quote.toExact()} (${_(q.routes)
                .map((r) => r.toString())
                .join(', ')})`
          ),
        },
        'Top 5 with 2 splits'
      );

      metric.putMetric(
        'Split2Done',
        Date.now() - split2Now,
        MetricLoggerUnit.Milliseconds
      );
    }

    // If we didn't find a better route with 2 splits, we won't find one with 3 splits.
    // Only continue if we managed to find a better route using 2 splits.
    if (splits == 3 && bestSwap.length < 2) {
      log.info(
        'Did not improve on route with 2 splits. Not checking 3 splits.'
      );
      metric.putMetric(
        'Split3Done',
        0,
        MetricLoggerUnit.Milliseconds
      );
    }

    if (splits == 3 && bestSwap.length == 2) {
      // We track the top 5 best options we find for logging/debugging.
      const bestThreeSplits = new FixedReverseHeap<{
        quote: CurrencyAmount;
        routes: RouteWithValidQuote[];
      }>(
        Array,
        (a, b) => {
          return quoteCompFn(a.quote, b.quote) ? -1 : 1;
        },
        5
      );

      const split3Now = Date.now();
      for (let i = percents.length - 1; i >= 0; i--) {
        // For our current percentage find the best route.
        const percentA = percents[i]!;
        const routeWithQuoteA = percentToSortedQuotes[percentA]![0]!;
        const { route: routeA } = routeWithQuoteA;
        const quoteA = by(routeWithQuoteA);

        const remainingPercent = 100 - percentA;

        // For the complimentary percentage, we now look for the best combination of two routes
        // that makes up the missing percentage, again ensuring we don't re-use pools.
        for (let j = i; j >= 0; j--) {
          const percentB = percents[j]!;
          
          if (percentB > remainingPercent) {
            continue;
          }

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

          bestThreeSplits.push({
            quote: newQuote,
            routes: [routeWithQuoteA, routeWithQuoteB, routeWithQuoteC],
          });

          if (quoteCompFn(newQuote, bestQuote)) {
            bestQuote = newQuote;
            bestSwap = [routeWithQuoteA, routeWithQuoteB, routeWithQuoteC];
          }
        }
      }

      log.info(
        {
          top5ThreeSplits: _.map(
            Array.from(bestThreeSplits.consume()),
            (q) =>
              `${q.quote.toExact()} (${_(q.routes)
                .map((r) => r.toString())
                .join(', ')})`
          ),
        },
        'Top 5 with 3 splits'
      );

      metric.putMetric(
        'Split3Done',
        Date.now() - split3Now,
        MetricLoggerUnit.Milliseconds
      );
    }

    // If we didn't find a better route with 2 splits, we won't find one with 3 splits.
    // Only continue if we managed to find a better route using 2 splits.
    if (splits == 4 && bestSwap.length < 3) {
      log.info(
        'Did not improve on route with 3 splits. Not checking 4 splits.'
      );
      metric.putMetric(
        'Split4Done',
        0,
        MetricLoggerUnit.Milliseconds
      );
    }

    if (splits == 4) {
      // We track the top 5 best options we find for logging/debugging.
      const bestFourSplits = new FixedReverseHeap<{
        quote: CurrencyAmount;
        routes: RouteWithValidQuote[];
      }>(
        Array,
        (a, b) => {
          return quoteCompFn(a.quote, b.quote) ? -1 : 1;
        },
        5
      );

      const split4Now = Date.now();
      for (let i = percents.length - 1; i >= 0; i--) {
        // For our current percentage find the best route.
        const percentA = percents[i]!;
        const routeWithQuoteA = percentToSortedQuotes[percentA]![0]!;
        const { route: routeA } = routeWithQuoteA;
        const quoteA = by(routeWithQuoteA);

        let remainingPercent = 100 - percentA;

        // For the complimentary percentage, we now look for the best combination of three routes
        // that makes up the missing percentage, again ensuring we don't re-use pools.
        for (let j = i; j >= 0; j--) {
          const percentB = percents[j]!;

          if (percentB > remainingPercent) {
            continue;
          }

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

          const { route: routeB } = routeWithQuoteB;

          const quoteB = by(routeWithQuoteB);

          // Find best combination of two routes that makes up our remainder after picking 2 routes.
          const remainingPercentB = remainingPercent - percentB;
          for (let k = j; k >= 0; k--) {
            const percentC = percents[k]!;

            if (percentC > remainingPercentB) {
              continue;
            }
            
            const percentD = remainingPercentB - percentC;
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
  
            const { route: routeC } = routeWithQuoteC;
            const quoteC = by(routeWithQuoteC);

            const candidateRoutesD = percentToSortedQuotes[percentD]!;
            
            if (!candidateRoutesD) {
              continue;
            }

            const routeWithQuoteD = findFirstRouteNotUsingUsedPools([routeA, routeB, routeC], candidateRoutesD);

            if (!routeWithQuoteD) {
              continue;
            }

            const quoteD = by(routeWithQuoteD);

            const newQuote = quoteA.add(quoteB).add(quoteC).add(quoteD);

            bestFourSplits.push({
              quote: newQuote,
              routes: [routeWithQuoteA, routeWithQuoteB, routeWithQuoteC, routeWithQuoteD],
            });

            if (quoteCompFn(newQuote, bestQuote)) {
              bestQuote = newQuote;
              bestSwap = [routeWithQuoteA, routeWithQuoteB, routeWithQuoteC, routeWithQuoteD];
            }
          }
        }
      }

      log.info(
        {
          top5FourSplits: _.map(
            Array.from(bestFourSplits.consume()),
            (q) =>
              `${q.quote.toExact()} (${_(q.routes)
                .map((r) => r.toString())
                .join(', ')})`
          ),
        },
        'Top 5 with 4 splits'
      );

      metric.putMetric(
        'Split4Done',
        Date.now() - split4Now,
        MetricLoggerUnit.Milliseconds
      );
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

  const estimatedGasUsedUSD = sum(
    _.map(bestSwap, (routeWithValidQuote) => routeWithValidQuote.gasCostInUSD)
  );

  const estimatedGasUsedQuoteToken = sum(
    _.map(
      bestSwap,
      (routeWithValidQuote) => routeWithValidQuote.gasCostInToken
    )
  );

  const quote = sum(
    _.map(bestSwap, (routeWithValidQuote) => routeWithValidQuote.quote)
  );

  const routeWithQuotes = bestSwap.sort((routeAmountA, routeAmountB) =>
    routeAmountB.amount.greaterThan(routeAmountA.amount) ? 1 : -1
  );

  metric.putMetric(
    'PostSplitDone',
    Date.now() - postSplitNow,
    MetricLoggerUnit.Milliseconds
  );

  return {
    quote,
    quoteGasAdjusted,
    estimatedGasUsed,
    estimatedGasUsedUSD,
    estimatedGasUsedQuoteToken,
    routes: routeWithQuotes,
  };
}