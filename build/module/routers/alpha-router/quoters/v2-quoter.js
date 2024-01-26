import { Protocol } from '@uniswap/router-sdk';
import { TradeType } from '@uniswap/sdk-core';
import _ from 'lodash';
import { TokenValidationResult, } from '../../../providers';
import { log, metric, MetricLoggerUnit, routeToString, } from '../../../util';
import { V2RouteWithValidQuote } from '../entities';
import { computeAllV2Routes } from '../functions/compute-all-routes';
import { NATIVE_OVERHEAD } from '../gas-models/v3/gas-costs';
import { BaseQuoter } from './base-quoter';
export class V2Quoter extends BaseQuoter {
    constructor(v2SubgraphProvider, v2PoolProvider, v2QuoteProvider, v2GasModelFactory, tokenProvider, chainId, blockedTokenListProvider, tokenValidatorProvider) {
        super(tokenProvider, chainId, Protocol.V2, blockedTokenListProvider, tokenValidatorProvider);
        this.v2SubgraphProvider = v2SubgraphProvider;
        this.v2PoolProvider = v2PoolProvider;
        this.v2QuoteProvider = v2QuoteProvider;
        this.v2GasModelFactory = v2GasModelFactory;
    }
    async getRoutes(tokenIn, tokenOut, v2CandidatePools, _tradeType, routingConfig) {
        const beforeGetRoutes = Date.now();
        // Fetch all the pools that we will consider routing via. There are thousands
        // of pools, so we filter them to a set of candidate pools that we expect will
        // result in good prices.
        const { poolAccessor, candidatePools } = v2CandidatePools;
        const poolsRaw = poolAccessor.getAllPools();
        // Drop any pools that contain tokens that can not be transferred according to the token validator.
        const pools = await this.applyTokenValidatorToPools(poolsRaw, (token, tokenValidation) => {
            // If there is no available validation result we assume the token is fine.
            if (!tokenValidation) {
                return false;
            }
            // Only filters out *intermediate* pools that involve tokens that we detect
            // cant be transferred. This prevents us trying to route through tokens that may
            // not be transferrable, but allows users to still swap those tokens if they
            // specify.
            if (tokenValidation == TokenValidationResult.STF &&
                (token.equals(tokenIn) || token.equals(tokenOut))) {
                return false;
            }
            return tokenValidation == TokenValidationResult.STF;
        });
        // Given all our candidate pools, compute all the possible ways to route from tokenIn to tokenOut.
        const { maxSwapsPerPath } = routingConfig;
        const routes = computeAllV2Routes(tokenIn, tokenOut, pools, maxSwapsPerPath);
        metric.putMetric('V2GetRoutesLoad', Date.now() - beforeGetRoutes, MetricLoggerUnit.Milliseconds);
        return {
            routes,
            candidatePools,
        };
    }
    async getQuotes(routes, amounts, percents, quoteToken, tradeType, _routingConfig, candidatePools, _gasModel, gasPriceWei) {
        const beforeGetQuotes = Date.now();
        log.info('Starting to get V2 quotes');
        if (gasPriceWei === undefined) {
            throw new Error('GasPriceWei for V2Routes is required to getQuotes');
        }
        // throw if we have no amounts or if there are different tokens in the amounts
        if (amounts.length == 0 ||
            !amounts.every((amount) => amount.currency.equals(amounts[0].currency))) {
            throw new Error('Amounts must have at least one amount and must be same token');
        }
        // safe to force unwrap here because we throw if there are no amounts
        const amountToken = amounts[0].currency;
        const gasToken = _routingConfig.gasToken
            ? (await this.tokenProvider.getTokens([_routingConfig.gasToken])).getTokenByAddress(_routingConfig.gasToken)
            : undefined;
        if (routes.length == 0) {
            return { routesWithValidQuotes: [], candidatePools };
        }
        // For all our routes, and all the fractional amounts, fetch quotes on-chain.
        const quoteFn = tradeType == TradeType.EXACT_INPUT
            ? this.v2QuoteProvider.getQuotesManyExactIn.bind(this.v2QuoteProvider)
            : this.v2QuoteProvider.getQuotesManyExactOut.bind(this.v2QuoteProvider);
        const beforeQuotes = Date.now();
        log.info(`Getting quotes for V2 for ${routes.length} routes with ${amounts.length} amounts per route.`);
        const { routesWithQuotes } = await quoteFn(amounts, routes, _routingConfig);
        const v2GasModel = await this.v2GasModelFactory.buildGasModel({
            chainId: this.chainId,
            gasPriceWei,
            poolProvider: this.v2PoolProvider,
            token: quoteToken,
            providerConfig: {
                ..._routingConfig,
                additionalGasOverhead: NATIVE_OVERHEAD(this.chainId, amountToken, quoteToken),
                gasToken,
            },
        });
        metric.putMetric('V2QuotesLoad', Date.now() - beforeQuotes, MetricLoggerUnit.Milliseconds);
        metric.putMetric('V2QuotesFetched', _(routesWithQuotes)
            .map(([, quotes]) => quotes.length)
            .sum(), MetricLoggerUnit.Count);
        const routesWithValidQuotes = [];
        for (const routeWithQuote of routesWithQuotes) {
            const [route, quotes] = routeWithQuote;
            for (let i = 0; i < quotes.length; i++) {
                const percent = percents[i];
                const amountQuote = quotes[i];
                const { quote, amount } = amountQuote;
                if (!quote) {
                    log.debug({
                        route: routeToString(route),
                        amountQuote,
                    }, 'Dropping a null V2 quote for route.');
                    continue;
                }
                const routeWithValidQuote = new V2RouteWithValidQuote({
                    route,
                    rawQuote: quote,
                    amount,
                    percent,
                    gasModel: v2GasModel,
                    quoteToken,
                    tradeType,
                    v2PoolProvider: this.v2PoolProvider,
                });
                routesWithValidQuotes.push(routeWithValidQuote);
            }
        }
        metric.putMetric('V2GetQuotesLoad', Date.now() - beforeGetQuotes, MetricLoggerUnit.Milliseconds);
        return {
            routesWithValidQuotes,
            candidatePools,
        };
    }
    async refreshRoutesThenGetQuotes(tokenIn, tokenOut, routes, amounts, percents, quoteToken, tradeType, routingConfig, gasPriceWei) {
        const tokenPairs = [];
        routes.forEach((route) => route.pairs.forEach((pair) => tokenPairs.push([pair.token0, pair.token1])));
        return this.v2PoolProvider
            .getPools(tokenPairs, routingConfig)
            .then((poolAccesor) => {
            const routes = computeAllV2Routes(tokenIn, tokenOut, poolAccesor.getAllPools(), routingConfig.maxSwapsPerPath);
            return this.getQuotes(routes, amounts, percents, quoteToken, tradeType, routingConfig, undefined, undefined, gasPriceWei);
        });
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidjItcXVvdGVyLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiLi4vLi4vLi4vLi4vLi4vc3JjL3JvdXRlcnMvYWxwaGEtcm91dGVyL3F1b3RlcnMvdjItcXVvdGVyLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUNBLE9BQU8sRUFBRSxRQUFRLEVBQUUsTUFBTSxxQkFBcUIsQ0FBQztBQUMvQyxPQUFPLEVBQTRCLFNBQVMsRUFBRSxNQUFNLG1CQUFtQixDQUFDO0FBQ3hFLE9BQU8sQ0FBQyxNQUFNLFFBQVEsQ0FBQztBQUV2QixPQUFPLEVBT0wscUJBQXFCLEdBQ3RCLE1BQU0sb0JBQW9CLENBQUM7QUFDNUIsT0FBTyxFQUVMLEdBQUcsRUFDSCxNQUFNLEVBQ04sZ0JBQWdCLEVBQ2hCLGFBQWEsR0FDZCxNQUFNLGVBQWUsQ0FBQztBQUd2QixPQUFPLEVBQUUscUJBQXFCLEVBQUUsTUFBTSxhQUFhLENBQUM7QUFDcEQsT0FBTyxFQUFFLGtCQUFrQixFQUFFLE1BQU0saUNBQWlDLENBQUM7QUFNckUsT0FBTyxFQUFFLGVBQWUsRUFBRSxNQUFNLDRCQUE0QixDQUFDO0FBRTdELE9BQU8sRUFBRSxVQUFVLEVBQUUsTUFBTSxlQUFlLENBQUM7QUFJM0MsTUFBTSxPQUFPLFFBQVMsU0FBUSxVQUFxQztJQU1qRSxZQUNFLGtCQUF1QyxFQUN2QyxjQUErQixFQUMvQixlQUFpQyxFQUNqQyxpQkFBcUMsRUFDckMsYUFBNkIsRUFDN0IsT0FBZ0IsRUFDaEIsd0JBQTZDLEVBQzdDLHNCQUFnRDtRQUVoRCxLQUFLLENBQ0gsYUFBYSxFQUNiLE9BQU8sRUFDUCxRQUFRLENBQUMsRUFBRSxFQUNYLHdCQUF3QixFQUN4QixzQkFBc0IsQ0FDdkIsQ0FBQztRQUNGLElBQUksQ0FBQyxrQkFBa0IsR0FBRyxrQkFBa0IsQ0FBQztRQUM3QyxJQUFJLENBQUMsY0FBYyxHQUFHLGNBQWMsQ0FBQztRQUNyQyxJQUFJLENBQUMsZUFBZSxHQUFHLGVBQWUsQ0FBQztRQUN2QyxJ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