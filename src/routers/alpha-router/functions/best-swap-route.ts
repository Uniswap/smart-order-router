import { TradeType } from '@uniswap/sdk-core';
import { BigNumber } from 'ethers';
import JSBI from 'jsbi';
import _ from 'lodash';
import { FixedReverseHeap, Queue } from 'mnemonist';
import { ChainId } from '../../../util';
import { CurrencyAmount } from '../../../util/amounts';
import { log } from '../../../util/log';
import { metric, MetricLoggerUnit } from '../../../util/metric';
import { routeAmountsToString, routeToString } from '../../../util/routes';
import { AlphaRouterConfig } from '../alpha-router';
import { usdGasTokensByChain } from '../gas-models';
import { RouteWithValidQuote } from './../entities/route-with-valid-quote';

export function getBestSwapRoute(
  amount: CurrencyAmount,
  percents: number[],
  routesWithValidQuotes: RouteWithValidQuote[],
  routeType: TradeType,
  chainId: ChainId,
  routingConfig: AlphaRouterConfig
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
  for (const routeWithValidQuote of routesWithValidQuotes) {
    if (!percentToQuotes[routeWithValidQuote.percent]) {
      percentToQuotes[routeWithValidQuote.percent] = [];
    }
    percentToQuotes[routeWithValidQuote.percent]!.push(routeWithValidQuote);
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
    chainId,
    (rq: RouteWithValidQuote) => rq.quoteAdjustedForGas,
    routingConfig
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
  chainId: ChainId,
  by: (routeQuote: RouteWithValidQuote) => CurrencyAmount,
  routingConfig: AlphaRouterConfig
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

  log.info(
    {
      percentToTop5SortedQuotes: _.mapValues(percentToSortedQuotes, (ps) =>
        _.map(ps.slice(0, 5), (p) => ({
          protocol: p.protocol,
          route: routeToString(p.route),
          percent: p.percent,
          quote: p.quoteAdjustedForGas.toFixed(2),
        }))
      ),
    },
    'Top 5 Quotes for each percentage'
  );

  const quoteCompFn =
    routeType == TradeType.EXACT_INPUT
      ? (a: CurrencyAmount, b: CurrencyAmount) => a.greaterThan(b)
      : (a: CurrencyAmount, b: CurrencyAmount) => a.lessThan(b);

  const sumFn = (currencyAmounts: CurrencyAmount[]): CurrencyAmount => {
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

  const { minSplits, maxSplits, forceCrossProtocol } = routingConfig;

  if (!percentToSortedQuotes[100] || minSplits > 1 || forceCrossProtocol) {
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
      bestSwapsPerSplit.push({
        quote: by(routeWithQuote),
        routes: [routeWithQuote],
      });
    }
  }

  // We do a BFS. Each additional node in a path represents us adding an additional split to the route.
  const queue = new Queue<{
    percentIndex: number;
    curRoutes: RouteWithValidQuote[];
    remainingPercent: number;
    special: boolean;
  }>();

  // First we seed BFS queue with the best quotes for each percentage.
  // i.e. [best quote when sending 10% of amount, best quote when sending 20% of amount, ...]
  // We will explore the various combinations from each node.
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
    });

    if (
      !percentToSortedQuotes[percent] ||
      !percentToSortedQuotes[percent]![1]
    ) {
      continue;
    }

    queue.enqueue({
      curRoutes: [percentToSortedQuotes[percent]![1]!],
      percentIndex: i,
      remainingPercent: 100 - percent,
      special: true,
    });
  }

  let splits = 1;
  let startedSplit = Date.now();

  while (queue.size > 0) {
    metric.putMetric(
      `Split${splits}Done`,
      Date.now() - startedSplit,
      MetricLoggerUnit.Milliseconds
    );

    startedSplit = Date.now();

    log.info(
      {
        top5: _.map(
          Array.from(bestSwapsPerSplit.consume()),
          (q) =>
            `${q.quote.toExact()} (${_(q.routes)
              .map((r) => r.toString())
              .join(', ')})`
        ),
        onQueue: queue.size,
      },
      `Top 5 with ${splits} splits`
    );

    bestSwapsPerSplit.clear();

    // Size of the queue at this point is the number of potential routes we are investigating for the given number of splits.
    let layer = queue.size;
    splits++;

    // If we didn't improve our quote by adding another split, very unlikely to improve it by splitting more after that.
    if (splits >= 3 && bestSwap && bestSwap.length < splits - 1) {
      break;
    }

    if (splits > maxSplits) {
      log.info('Max splits reached. Stopping search.');
      metric.putMetric(`MaxSplitsHitReached`, 1, MetricLoggerUnit.Count);
      break;
    }

    while (layer > 0) {
      layer--;

      const { remainingPercent, curRoutes, percentIndex, special } =
        queue.dequeue()!;

      // For all other percentages, add a new potential route.
      // E.g. if our current aggregated route if missing 50%, we will create new nodes and add to the queue for:
      // 50% + new 10% route, 50% + new 20% route, etc.
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
        // used in the current route. Re-using pools is not allowed as each swap through a pool changes its liquidity,
        // so it would make the quotes inaccurate.
        const routeWithQuoteA = findFirstRouteNotUsingUsedPools(
          curRoutes,
          candidateRoutesA,
          forceCrossProtocol
        );

        if (!routeWithQuoteA) {
          continue;
        }

        const remainingPercentNew = remainingPercent - percentA;
        const curRoutesNew = [...curRoutes, routeWithQuoteA];

        // If we've found a route combination that uses all 100%, and it has at least minSplits, update our best route.
        if (remainingPercentNew == 0 && splits >= minSplits) {
          const quotesNew = _.map(curRoutesNew, (r) => by(r));
          const quoteNew = sumFn(quotesNew);

          bestSwapsPerSplit.push({
            quote: quoteNew,
            routes: curRoutesNew,
          });

          if (!bestQuote || quoteCompFn(quoteNew, bestQuote)) {
            bestQuote = quoteNew;
            bestSwap = curRoutesNew;

            // Temporary experiment.
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
            special,
          });
        }
      }
    }
  }

  if (!bestSwap) {
    log.info(`Could not find a valid swap`);
    return undefined;
  }

  const postSplitNow = Date.now();

  const quoteGasAdjusted = sumFn(
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

  // Each route can use a different stablecoin to account its gas costs.
  // They should all be pegged, and this is just an estimate, so we do a merge
  // to an arbitrary stable.
  if (!usdGasTokensByChain[chainId] || !usdGasTokensByChain[chainId]![0]) {
    throw new Error(
      `Could not find a USD token for computing gas costs on ${chainId}`
    );
  }
  const usdToken = usdGasTokensByChain[chainId]![0]!;
  const usdTokenDecimals = usdToken.decimals;

  // For each gas estimate, normalize decimals to that of the chosen usd token.
  const estimatedGasUsedUSDs = _(bestSwap)
    .map((routeWithValidQuote) => {
      const decimalsDiff =
        usdTokenDecimals - routeWithValidQuote.gasCostInUSD.currency.decimals;

      if (decimalsDiff == 0) {
        return CurrencyAmount.fromRawAmount(
          usdToken,
          routeWithValidQuote.gasCostInUSD.quotient
        );
      }

      return CurrencyAmount.fromRawAmount(
        usdToken,
        JSBI.multiply(
          routeWithValidQuote.gasCostInUSD.quotient,
          JSBI.exponentiate(JSBI.BigInt(10), JSBI.BigInt(decimalsDiff))
        )
      );
    })
    .value();

  const estimatedGasUsedUSD = sumFn(estimatedGasUsedUSDs);
  log.info(
    {
      estimatedGasUsedUSD: estimatedGasUsedUSD.toExact(),
      normalizedUsdToken: usdToken,
      routeUSDGasEstimates: _.map(
        bestSwap,
        (b) =>
          `${b.percent}% ${routeToString(b.route)} ${b.gasCostInUSD.toExact()}`
      ),
    },
    'USD gas estimates of best route'
  );

  const estimatedGasUsedQuoteToken = sumFn(
    _.map(bestSwap, (routeWithValidQuote) => routeWithValidQuote.gasCostInToken)
  );

  const quote = sumFn(
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
  usedRoutes: RouteWithValidQuote[],
  candidateRouteQuotes: RouteWithValidQuote[],
  forceCrossProtocol: boolean
): RouteWithValidQuote | null => {
  const poolAddressSet = new Set();
  const usedPoolAddresses = _(usedRoutes)
    .flatMap((r) => r.poolAddresses)
    .value();

  for (let poolAddress of usedPoolAddresses) {
    poolAddressSet.add(poolAddress);
  }

  const protocolsSet = new Set();
  const usedProtocols = _(usedRoutes)
    .flatMap((r) => r.protocol)
    .uniq()
    .value();

  for (let protocol of usedProtocols) {
    protocolsSet.add(protocol);
  }

  for (const routeQuote of candidateRouteQuotes) {
    const { poolAddresses, protocol } = routeQuote;

    if (poolAddresses.some((poolAddress) => poolAddressSet.has(poolAddress))) {
      continue;
    }

    // This code is just for debugging. Allows us to force a cross-protocol split route by skipping
    // consideration of routes that come from the same protocol as a used route.
    const needToForce = forceCrossProtocol && protocolsSet.size == 1;
    if (needToForce && protocolsSet.has(protocol)) {
      continue;
    }

    return routeQuote;
  }

  return null;
};
