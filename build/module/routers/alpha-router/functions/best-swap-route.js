import { BigNumber } from '@ethersproject/bignumber';
import { Protocol } from '@uniswap/router-sdk';
import { TradeType } from '@uniswap/sdk-core';
import JSBI from 'jsbi';
import _ from 'lodash';
import FixedReverseHeap from 'mnemonist/fixed-reverse-heap';
import Queue from 'mnemonist/queue';
import { HAS_L1_FEE } from '../../../util';
import { CurrencyAmount } from '../../../util/amounts';
import { log } from '../../../util/log';
import { metric, MetricLoggerUnit } from '../../../util/metric';
import { routeAmountsToString, routeToString } from '../../../util/routes';
import { usdGasTokensByChain } from '../gas-models';
export async function getBestSwapRoute(amount, percents, routesWithValidQuotes, routeType, chainId, routingConfig, portionProvider, gasModel, swapConfig) {
    const now = Date.now();
    const { forceMixedRoutes } = routingConfig;
    /// Like with forceCrossProtocol, we apply that logic here when determining the bestSwapRoute
    if (forceMixedRoutes) {
        log.info({
            forceMixedRoutes: forceMixedRoutes,
        }, 'Forcing mixed routes by filtering out other route types');
        routesWithValidQuotes = _.filter(routesWithValidQuotes, (quotes) => {
            return quotes.protocol === Protocol.MIXED;
        });
        if (!routesWithValidQuotes) {
            return null;
        }
    }
    // Build a map of percentage of the input to list of valid quotes.
    // Quotes can be null for a variety of reasons (not enough liquidity etc), so we drop them here too.
    const percentToQuotes = {};
    for (const routeWithValidQuote of routesWithValidQuotes) {
        if (!percentToQuotes[routeWithValidQuote.percent]) {
            percentToQuotes[routeWithValidQuote.percent] = [];
        }
        percentToQuotes[routeWithValidQuote.percent].push(routeWithValidQuote);
    }
    metric.putMetric('BuildRouteWithValidQuoteObjects', Date.now() - now, MetricLoggerUnit.Milliseconds);
    // Given all the valid quotes for each percentage find the optimal route.
    const swapRoute = await getBestSwapRouteBy(routeType, percentToQuotes, percents, chainId, (rq) => rq.quoteAdjustedForGas, routingConfig, portionProvider, gasModel, swapConfig);
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
    const totalAmount = _.reduce(routeAmounts, (total, routeAmount) => total.add(routeAmount.amount), CurrencyAmount.fromRawAmount(routeAmounts[0].amount.currency, 0));
    const missingAmount = amount.subtract(totalAmount);
    if (missingAmount.greaterThan(0)) {
        log.info({
            missingAmount: missingAmount.quotient.toString(),
        }, `Optimal route's amounts did not equal exactIn/exactOut total. Adding missing amount to last route in array.`);
        routeAmounts[routeAmounts.length - 1].amount =
            routeAmounts[routeAmounts.length - 1].amount.add(missingAmount);
    }
    log.info({
        routes: routeAmountsToString(routeAmounts),
        numSplits: routeAmounts.length,
        amount: amount.toExact(),
        quote: swapRoute.quote.toExact(),
        quoteGasAdjusted: swapRoute.quoteGasAdjusted.toFixed(Math.min(swapRoute.quoteGasAdjusted.currency.decimals, 2)),
        estimatedGasUSD: swapRoute.estimatedGasUsedUSD.toFixed(Math.min(swapRoute.estimatedGasUsedUSD.currency.decimals, 2)),
        estimatedGasToken: swapRoute.estimatedGasUsedQuoteToken.toFixed(Math.min(swapRoute.estimatedGasUsedQuoteToken.currency.decimals, 2)),
    }, `Found best swap route. ${routeAmounts.length} split.`);
    return swapRoute;
}
export async function getBestSwapRouteBy(routeType, percentToQuotes, percents, chainId, by, routingConfig, portionProvider, gasModel, swapConfig) {
    var _a;
    // Build a map of percentage to sorted list of quotes, with the biggest quote being first in the list.
    const percentToSortedQuotes = _.mapValues(percentToQuotes, (routeQuotes) => {
        return routeQuotes.sort((routeQuoteA, routeQuoteB) => {
            if (routeType == TradeType.EXACT_INPUT) {
                return by(routeQuoteA).greaterThan(by(routeQuoteB)) ? -1 : 1;
            }
            else {
                return by(routeQuoteA).lessThan(by(routeQuoteB)) ? -1 : 1;
            }
        });
    });
    const quoteCompFn = routeType == TradeType.EXACT_INPUT
        ? (a, b) => a.greaterThan(b)
        : (a, b) => a.lessThan(b);
    const sumFn = (currencyAmounts) => {
        let sum = currencyAmounts[0];
        for (let i = 1; i < currencyAmounts.length; i++) {
            sum = sum.add(currencyAmounts[i]);
        }
        return sum;
    };
    let bestQuote;
    let bestSwap;
    // Min-heap for tracking the 5 best swaps given some number of splits.
    const bestSwapsPerSplit = new FixedReverseHeap(Array, (a, b) => {
        return quoteCompFn(a.quote, b.quote) ? -1 : 1;
    }, 3);
    const { minSplits, maxSplits, forceCrossProtocol } = routingConfig;
    if (!percentToSortedQuotes[100] || minSplits > 1 || forceCrossProtocol) {
        log.info({
            percentToSortedQuotes: _.mapValues(percentToSortedQuotes, (p) => p.length),
        }, 'Did not find a valid route without any splits. Continuing search anyway.');
    }
    else {
        bestQuote = by(percentToSortedQuotes[100][0]);
        bestSwap = [percentToSortedQuotes[100][0]];
        for (const routeWithQuote of percentToSortedQuotes[100].slice(0, 5)) {
            bestSwapsPerSplit.push({
                quote: by(routeWithQuote),
                routes: [routeWithQuote],
            });
        }
    }
    // We do a BFS. Each additional node in a path represents us adding an additional split to the route.
    const queue = new Queue();
    // First we seed BFS queue with the best quotes for each percentage.
    // i.e. [best quote when sending 10% of amount, best quote when sending 20% of amount, ...]
    // We will explore the various combinations from each node.
    for (let i = percents.length; i >= 0; i--) {
        const percent = percents[i];
        if (!percentToSortedQuotes[percent]) {
            continue;
        }
        queue.enqueue({
            curRoutes: [percentToSortedQuotes[percent][0]],
            percentIndex: i,
            remainingPercent: 100 - percent,
            special: false,
        });
        if (!percentToSortedQuotes[percent] ||
            !percentToSortedQuotes[percent][1]) {
            continue;
        }
        queue.enqueue({
            curRoutes: [percentToSortedQuotes[percent][1]],
            percentIndex: i,
            remainingPercent: 100 - percent,
            special: true,
        });
    }
    let splits = 1;
    let startedSplit = Date.now();
    while (queue.size > 0) {
        metric.putMetric(`Split${splits}Done`, Date.now() - startedSplit, MetricLoggerUnit.Milliseconds);
        startedSplit = Date.now();
        log.info({
            top5: _.map(Array.from(bestSwapsPerSplit.consume()), (q) => `${q.quote.toExact()} (${_(q.routes)
                .map((r) => r.toString())
                .join(', ')})`),
            onQueue: queue.size,
        }, `Top 3 with ${splits} splits`);
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
            const { remainingPercent, curRoutes, percentIndex, special } = queue.dequeue();
            // For all other percentages, add a new potential route.
            // E.g. if our current aggregated route if missing 50%, we will create new nodes and add to the queue for:
            // 50% + new 10% route, 50% + new 20% route, etc.
            for (let i = percentIndex; i >= 0; i--) {
                const percentA = percents[i];
                if (percentA > remainingPercent) {
                    continue;
                }
                // At some point the amount * percentage is so small that the quoter is unable to get
                // a quote. In this case there could be no quotes for that percentage.
                if (!percentToSortedQuotes[percentA]) {
                    continue;
                }
                const candidateRoutesA = percentToSortedQuotes[percentA];
                // Find the best route in the complimentary percentage that doesn't re-use a pool already
                // used in the current route. Re-using pools is not allowed as each swap through a pool changes its liquidity,
                // so it would make the quotes inaccurate.
                const routeWithQuoteA = findFirstRouteNotUsingUsedPools(curRoutes, candidateRoutesA, forceCrossProtocol);
                if (!routeWithQuoteA) {
                    continue;
                }
                const remainingPercentNew = remainingPercent - percentA;
                const curRoutesNew = [...curRoutes, routeWithQuoteA];
                // If we've found a route combination that uses all 100%, and it has at least minSplits, update our best route.
                if (remainingPercentNew == 0 && splits >= minSplits) {
                    const quotesNew = _.map(curRoutesNew, (r) => by(r));
                    const quoteNew = sumFn(quotesNew);
                    let gasCostL1QuoteToken = CurrencyAmount.fromRawAmount(quoteNew.currency, 0);
                    if (HAS_L1_FEE.includes(chainId)) {
                        const onlyV3Routes = curRoutesNew.every((route) => route.protocol == Protocol.V3);
                        if (gasModel == undefined || !onlyV3Routes) {
                            throw new Error("Can't compute L1 gas fees.");
                        }
                        else {
                            const gasCostL1 = await gasModel.calculateL1GasFees(curRoutesNew);
                            gasCostL1QuoteToken = gasCostL1.gasCostL1QuoteToken;
                        }
                    }
                    const quoteAfterL1Adjust = routeType == TradeType.EXACT_INPUT
                        ? quoteNew.subtract(gasCostL1QuoteToken)
                        : quoteNew.add(gasCostL1QuoteToken);
                    bestSwapsPerSplit.push({
                        quote: quoteAfterL1Adjust,
                        routes: curRoutesNew,
                    });
                    if (!bestQuote || quoteCompFn(quoteAfterL1Adjust, bestQuote)) {
                        bestQuote = quoteAfterL1Adjust;
                        bestSwap = curRoutesNew;
                        // Temporary experiment.
                        if (special) {
                            metric.putMetric(`BestSwapNotPickingBestForPercent`, 1, MetricLoggerUnit.Count);
                        }
                    }
                }
                else {
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
    let quoteGasAdjusted = sumFn(_.map(bestSwap, (routeWithValidQuote) => routeWithValidQuote.quoteAdjustedForGas));
    // this calculates the base gas used
    // if on L1, its the estimated gas used based on hops and ticks across all the routes
    // if on L2, its the gas used on the L2 based on hops and ticks across all the routes
    const estimatedGasUsed = _(bestSwap)
        .map((routeWithValidQuote) => routeWithValidQuote.gasEstimate)
        .reduce((sum, routeWithValidQuote) => sum.add(routeWithValidQuote), BigNumber.from(0));
    if (!usdGasTokensByChain[chainId] || !usdGasTokensByChain[chainId][0]) {
        // Each route can use a different stablecoin to account its gas costs.
        // They should all be pegged, and this is just an estimate, so we do a merge
        // to an arbitrary stable.
        throw new Error(`Could not find a USD token for computing gas costs on ${chainId}`);
    }
    const usdToken = usdGasTokensByChain[chainId][0];
    const usdTokenDecimals = usdToken.decimals;
    // if on L2, calculate the L1 security fee
    let gasCostsL1ToL2 = {
        gasUsedL1: BigNumber.from(0),
        gasUsedL1OnL2: BigNumber.from(0),
        gasCostL1USD: CurrencyAmount.fromRawAmount(usdToken, 0),
        gasCostL1QuoteToken: CurrencyAmount.fromRawAmount(
        // eslint-disable-next-line @typescript-eslint/no-non-null-asserted-optional-chain
        (_a = bestSwap[0]) === null || _a === void 0 ? void 0 : _a.quoteToken, 0),
    };
    // If swapping on an L2 that includes a L1 security fee, calculate the fee and include it in the gas adjusted quotes
    if (HAS_L1_FEE.includes(chainId)) {
        // ensure the gasModel exists and that the swap route is a v3 only route
        const onlyV3Routes = bestSwap.every((route) => route.protocol == Protocol.V3);
        if (gasModel == undefined || !onlyV3Routes) {
            throw new Error("Can't compute L1 gas fees.");
        }
        else {
            gasCostsL1ToL2 = await gasModel.calculateL1GasFees(bestSwap);
        }
    }
    const { gasUsedL1OnL2, gasCostL1USD, gasCostL1QuoteToken } = gasCostsL1ToL2;
    // For each gas estimate, normalize decimals to that of the chosen usd token.
    const estimatedGasUsedUSDs = _(bestSwap)
        .map((routeWithValidQuote) => {
        // TODO: will error if gasToken has decimals greater than usdToken
        const decimalsDiff = usdTokenDecimals - routeWithValidQuote.gasCostInUSD.currency.decimals;
        if (decimalsDiff == 0) {
            return CurrencyAmount.fromRawAmount(usdToken, routeWithValidQuote.gasCostInUSD.quotient);
        }
        return CurrencyAmount.fromRawAmount(usdToken, JSBI.multiply(routeWithValidQuote.gasCostInUSD.quotient, JSBI.exponentiate(JSBI.BigInt(10), JSBI.BigInt(decimalsDiff))));
    })
        .value();
    let estimatedGasUsedUSD = sumFn(estimatedGasUsedUSDs);
    // if they are different usd pools, convert to the usdToken
    if (estimatedGasUsedUSD.currency != gasCostL1USD.currency) {
        const decimalsDiff = usdTokenDecimals - gasCostL1USD.currency.decimals;
        estimatedGasUsedUSD = estimatedGasUsedUSD.add(CurrencyAmount.fromRawAmount(usdToken, JSBI.multiply(gasCostL1USD.quotient, JSBI.exponentiate(JSBI.BigInt(10), JSBI.BigInt(decimalsDiff)))));
    }
    else {
        estimatedGasUsedUSD = estimatedGasUsedUSD.add(gasCostL1USD);
    }
    log.info({
        estimatedGasUsedUSD: estimatedGasUsedUSD.toExact(),
        normalizedUsdToken: usdToken,
        routeUSDGasEstimates: _.map(bestSwap, (b) => `${b.percent}% ${routeToString(b.route)} ${b.gasCostInUSD.toExact()}`),
        flatL1GasCostUSD: gasCostL1USD.toExact(),
    }, 'USD gas estimates of best route');
    const estimatedGasUsedQuoteToken = sumFn(_.map(bestSwap, (routeWithValidQuote) => routeWithValidQuote.gasCostInToken)).add(gasCostL1QuoteToken);
    let estimatedGasUsedGasToken;
    if (routingConfig.gasToken) {
        // sum the gas costs in the gas token across all routes
        // if there is a route with undefined gasCostInGasToken, throw an error
        if (bestSwap.some((routeWithValidQuote) => routeWithValidQuote.gasCostInGasToken === undefined)) {
            log.info({
                bestSwap,
                routingConfig,
            }, 'Could not find gasCostInGasToken for a route in bestSwap');
            throw new Error("Can't compute estimatedGasUsedGasToken");
        }
        estimatedGasUsedGasToken = sumFn(_.map(bestSwap, 
        // ok to type cast here because we throw above if any are not defined
        (routeWithValidQuote) => routeWithValidQuote.gasCostInGasToken));
    }
    const quote = sumFn(_.map(bestSwap, (routeWithValidQuote) => routeWithValidQuote.quote));
    // Adjust the quoteGasAdjusted for the l1 fee
    if (routeType == TradeType.EXACT_INPUT) {
        const quoteGasAdjustedForL1 = quoteGasAdjusted.subtract(gasCostL1QuoteToken);
        quoteGasAdjusted = quoteGasAdjustedForL1;
    }
    else {
        const quoteGasAdjustedForL1 = quoteGasAdjusted.add(gasCostL1QuoteToken);
        quoteGasAdjusted = quoteGasAdjustedForL1;
    }
    const routeWithQuotes = bestSwap.sort((routeAmountA, routeAmountB) => routeAmountB.amount.greaterThan(routeAmountA.amount) ? 1 : -1);
    metric.putMetric('PostSplitDone', Date.now() - postSplitNow, MetricLoggerUnit.Milliseconds);
    return {
        quote,
        quoteGasAdjusted,
        estimatedGasUsed: estimatedGasUsed.add(gasUsedL1OnL2),
        estimatedGasUsedUSD,
        estimatedGasUsedQuoteToken,
        estimatedGasUsedGasToken,
        routes: portionProvider.getRouteWithQuotePortionAdjusted(routeType, routeWithQuotes, swapConfig),
    };
}
// We do not allow pools to be re-used across split routes, as swapping through a pool changes the pools state.
// Given a list of used routes, this function finds the first route in the list of candidate routes that does not re-use an already used pool.
const findFirstRouteNotUsingUsedPools = (usedRoutes, candidateRouteQuotes, forceCrossProtocol) => {
    const poolAddressSet = new Set();
    const usedPoolAddresses = _(usedRoutes)
        .flatMap((r) => r.poolAddresses)
        .value();
    for (const poolAddress of usedPoolAddresses) {
        poolAddressSet.add(poolAddress);
    }
    const protocolsSet = new Set();
    const usedProtocols = _(usedRoutes)
        .flatMap((r) => r.protocol)
        .uniq()
        .value();
    for (const protocol of usedProtocols) {
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiYmVzdC1zd2FwLXJvdXRlLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiLi4vLi4vLi4vLi4vLi4vc3JjL3JvdXRlcnMvYWxwaGEtcm91dGVyL2Z1bmN0aW9ucy9iZXN0LXN3YXAtcm91dGUudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUEsT0FBTyxFQUFFLFNBQVMsRUFBRSxNQUFNLDBCQUEwQixDQUFDO0FBQ3JELE9BQU8sRUFBRSxRQUFRLEVBQUUsTUFBTSxxQkFBcUIsQ0FBQztBQUMvQyxPQUFPLEVBQVcsU0FBUyxFQUFFLE1BQU0sbUJBQW1CLENBQUM7QUFDdkQsT0FBTyxJQUFJLE1BQU0sTUFBTSxDQUFDO0FBQ3hCLE9BQU8sQ0FBQyxNQUFNLFFBQVEsQ0FBQztBQUN2QixPQUFPLGdCQUFnQixNQUFNLDhCQUE4QixDQUFDO0FBQzVELE9BQU8sS0FBSyxNQUFNLGlCQUFpQixDQUFDO0FBR3BDLE9BQU8sRUFBRSxVQUFVLEVBQUUsTUFBTSxlQUFlLENBQUM7QUFDM0MsT0FBTyxFQUFFLGNBQWMsRUFBRSxNQUFNLHVCQUF1QixDQUFDO0FBQ3ZELE9BQU8sRUFBRSxHQUFHLEVBQUUsTUFBTSxtQkFBbUIsQ0FBQztBQUN4QyxPQUFPLEVBQUUsTUFBTSxFQUFFLGdCQUFnQixFQUFFLE1BQU0sc0JBQXNCLENBQUM7QUFDaEUsT0FBTyxFQUFFLG9CQUFvQixFQUFFLGFBQWEsRUFBRSxNQUFNLHNCQUFzQixDQUFDO0FBRzNFLE9BQU8sRUFBNkIsbUJBQW1CLEVBQUUsTUFBTSxlQUFlLENBQUM7QUFpQi9FLE1BQU0sQ0FBQyxLQUFLLFVBQVUsZ0JBQWdCLENBQ3BDLE1BQXNCLEVBQ3RCLFFBQWtCLEVBQ2xCLHFCQUE0QyxFQUM1QyxTQUFvQixFQUNwQixPQUFnQixFQUNoQixhQUFnQyxFQUNoQyxlQUFpQyxFQUNqQyxRQUEyQyxFQUMzQyxVQUF3QjtJQUV4QixNQUFNLEdBQUcsR0FBRyxJQUFJLENBQUMsR0FBRyxFQUFFLENBQUM7SUFFdkIsTUFB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