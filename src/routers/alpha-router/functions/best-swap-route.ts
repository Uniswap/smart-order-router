import { Token, TradeType } from '@uniswap/sdk-core';
import {
  Pool,
} from '@uniswap/v3-sdk';
import { BigNumber } from 'ethers';
import _ from 'lodash';
import { FixedReverseHeap, Queue } from 'mnemonist';
import { IPoolProvider } from '../../../providers';
import {
  RouteWithQuotes,
} from '../../../providers/quote-provider';
import { CurrencyAmount } from '../../../util/amounts';
import { log } from '../../../util/log';
import { metric, MetricLoggerUnit } from '../../../util/metric';
import { routeAmountsToString, routeToString } from '../../../util/routes';
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

export function getBestSwapRouteBy(
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

  const quoteCompFn =
    routeType == TradeType.EXACT_INPUT
      ? (a: CurrencyAmount, b: CurrencyAmount) => a.greaterThan(b)
      : (a: CurrencyAmount, b: CurrencyAmount) => a.lessThan(b);
  
  const sum = (currencyAmounts: CurrencyAmount[]): CurrencyAmount => {
    let sum = currencyAmounts[0]!;
    for (let i = 1; i < currencyAmounts.length; i++) {
      sum = sum.add(currencyAmounts[i]!);
    }
    return sum;
  };

  let bestQuote: CurrencyAmount | undefined;
  let bestSwap: RouteWithValidQuote[] | undefined;

  // Min-heap for tracking the 5 best swaps given some number of splits.
  const bestSwapsPerSplit = new FixedReverseHeap<{
    quote: CurrencyAmount;
    routes: RouteWithValidQuote[];
  }>(
    Array,
    (a, b) => {
      return quoteCompFn(a.quote, b.quote) ? -1 : 1;
    },
    5
  );

  if (!percentToSortedQuotes[100]) {
    log.info(
      {
        percentToSortedQuotes: _.mapValues(
          percentToSortedQuotes,
          (p) => p.length
        ),
      },
      'Did not find a valid route without any splits. Continuing search anyway.'
    );
  } else {
    bestQuote = by(percentToSortedQuotes[100][0]!);
    bestSwap = [percentToSortedQuotes[100][0]!];

    for (const routeWithQuote of percentToSortedQuotes[100].slice(0, 5)) {
      bestSwapsPerSplit.push({ quote: by(routeWithQuote), routes: [routeWithQuote] });
    }
  }

  const queue = new Queue<{ 
    percentIndex: number;
    curRoutes: RouteWithValidQuote[];
    remainingPercent: number;
    special: boolean;
  }>()

  for (let i = percents.length; i >= 0; i--) {
    const percent = percents[i]!;
    
    if (!percentToSortedQuotes[percent]) {
      continue;
    }
    
    queue.enqueue({
      curRoutes: [percentToSortedQuotes[percent]![0]!],
      percentIndex: i,
      remainingPercent: 100 - percent,
      special: false,
    })

    if (!percentToSortedQuotes[percent] || !percentToSortedQuotes[percent]![1]) {
      continue;
    }

    queue.enqueue({
      curRoutes: [percentToSortedQuotes[percent]![1]!],
      percentIndex: i,
      remainingPercent: 100 - percent,
      special: true,
    })
  }

  let splits = 1;
  let startedSplit = Date.now();
  
  while(queue.size > 0) {
    metric.putMetric(
      `Split${splits}Done`,
      Date.now() - startedSplit,
      MetricLoggerUnit.Milliseconds
    );

    log.info(
      {
        top5: _.map(
          Array.from(bestSwapsPerSplit.consume()),
          (q) =>
            `${q.quote.toExact()} (${_(q.routes)
              .map((r) => r.toString())
              .join(', ')})`
        ),
      },
      `Top 5 with ${splits} splits`
    );

    bestSwapsPerSplit.clear();

    let layer = queue.size;
    splits++;

    startedSplit = Date.now();

    if (splits >= 3 && bestSwap && bestSwap.length < (splits - 1)) {
      log.info(
        `Did not improve on route with ${splits - 1} splits. Not checking ${splits} splits.`
      );
      break;
    }

    if (splits > routingConfig.maxSplits) {
      log.info('Max splits reached. Stopping search.');
      metric.putMetric(
        `MaxSplitsHitReached`,
        1,
        MetricLoggerUnit.Count
      );
      break;
    }

    log.info(`About to consider ${splits} splits. ${layer} combinations to iterate on.`);
    
    while (layer > 0) {
      layer--;

      const { remainingPercent, curRoutes, percentIndex, special } = queue.dequeue()!
    
      for (let i = percentIndex; i >= 0; i--) {
        const percentA = percents[i]!;
    
        if (percentA > remainingPercent) {
          continue;
        }
    
        // At some point the amount * percentage is so small that the quoter is unable to get
        // a quote. In this case there could be no quotes for that percentage.
        if (!percentToSortedQuotes[percentA]) {
          continue;
        }
    
        const candidateRoutesA = percentToSortedQuotes[percentA]!;
    
        // Find the best route in the complimentary percentage that doesn't re-use a pool already
        // used in the best route for the current percentage.
        const routeWithQuoteA = findFirstRouteNotUsingUsedPools(
          poolProvider,
          curRoutes,
          candidateRoutesA
        );
    
        if (!routeWithQuoteA) {
          continue;
        }

        const remainingPercentNew = remainingPercent - percentA;
        const curRoutesNew = [ ...curRoutes, routeWithQuoteA ];

        if (remainingPercentNew == 0) {
          const quotesNew = _.map(curRoutesNew, r => by(r));
          const quoteNew = sum(quotesNew);

          bestSwapsPerSplit.push({
            quote: quoteNew,
            routes: curRoutesNew,
          });

          if (!bestQuote || quoteCompFn(quoteNew, bestQuote)) {
            bestQuote = quoteNew;
            bestSwap = curRoutesNew;
            if (special) {
              metric.putMetric(
                `BestSwapNotPickingBestForPercent`,
                1,
                MetricLoggerUnit.Count
              );
            }
          }
        } else {
          queue.enqueue({
            curRoutes: curRoutesNew,
            remainingPercent: remainingPercentNew,
            percentIndex: i,
            special
          })
        }

      }
    }
  }

  if (!bestSwap) {
    log.info(`Could not find a valid swap`)
    return undefined;
  }

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

// We do not allow pools to be re-used across split routes, as swapping through a pool changes the pools state.
  // Given a list of used routes, this function finds the first route in the list of candidate routes that does not re-use an already used pool.
const findFirstRouteNotUsingUsedPools = (
  poolProvider: IPoolProvider,
  usedRoutes: RouteWithValidQuote[],
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
    .flatMap((r) => r.route.pools)
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


