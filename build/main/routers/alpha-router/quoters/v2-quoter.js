"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.V2Quoter = void 0;
const router_sdk_1 = require("@uniswap/router-sdk");
const sdk_core_1 = require("@uniswap/sdk-core");
const lodash_1 = __importDefault(require("lodash"));
const providers_1 = require("../../../providers");
const util_1 = require("../../../util");
const entities_1 = require("../entities");
const compute_all_routes_1 = require("../functions/compute-all-routes");
const gas_costs_1 = require("../gas-models/v3/gas-costs");
const base_quoter_1 = require("./base-quoter");
class V2Quoter extends base_quoter_1.BaseQuoter {
    constructor(v2SubgraphProvider, v2PoolProvider, v2QuoteProvider, v2GasModelFactory, tokenProvider, chainId, blockedTokenListProvider, tokenValidatorProvider) {
        super(tokenProvider, chainId, router_sdk_1.Protocol.V2, blockedTokenListProvider, tokenValidatorProvider);
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
            if (tokenValidation == providers_1.TokenValidationResult.STF &&
                (token.equals(tokenIn) || token.equals(tokenOut))) {
                return false;
            }
            return tokenValidation == providers_1.TokenValidationResult.STF;
        });
        // Given all our candidate pools, compute all the possible ways to route from tokenIn to tokenOut.
        const { maxSwapsPerPath } = routingConfig;
        const routes = (0, compute_all_routes_1.computeAllV2Routes)(tokenIn, tokenOut, pools, maxSwapsPerPath);
        util_1.metric.putMetric('V2GetRoutesLoad', Date.now() - beforeGetRoutes, util_1.MetricLoggerUnit.Milliseconds);
        return {
            routes,
            candidatePools,
        };
    }
    async getQuotes(routes, amounts, percents, quoteToken, tradeType, _routingConfig, candidatePools, _gasModel, gasPriceWei) {
        const beforeGetQuotes = Date.now();
        util_1.log.info('Starting to get V2 quotes');
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
        const quoteFn = tradeType == sdk_core_1.TradeType.EXACT_INPUT
            ? this.v2QuoteProvider.getQuotesManyExactIn.bind(this.v2QuoteProvider)
            : this.v2QuoteProvider.getQuotesManyExactOut.bind(this.v2QuoteProvider);
        const beforeQuotes = Date.now();
        util_1.log.info(`Getting quotes for V2 for ${routes.length} routes with ${amounts.length} amounts per route.`);
        const { routesWithQuotes } = await quoteFn(amounts, routes, _routingConfig);
        const v2GasModel = await this.v2GasModelFactory.buildGasModel({
            chainId: this.chainId,
            gasPriceWei,
            poolProvider: this.v2PoolProvider,
            token: quoteToken,
            providerConfig: Object.assign(Object.assign({}, _routingConfig), { additionalGasOverhead: (0, gas_costs_1.NATIVE_OVERHEAD)(this.chainId, amountToken, quoteToken), gasToken }),
        });
        util_1.metric.putMetric('V2QuotesLoad', Date.now() - beforeQuotes, util_1.MetricLoggerUnit.Milliseconds);
        util_1.metric.putMetric('V2QuotesFetched', (0, lodash_1.default)(routesWithQuotes)
            .map(([, quotes]) => quotes.length)
            .sum(), util_1.MetricLoggerUnit.Count);
        const routesWithValidQuotes = [];
        for (const routeWithQuote of routesWithQuotes) {
            const [route, quotes] = routeWithQuote;
            for (let i = 0; i < quotes.length; i++) {
                const percent = percents[i];
                const amountQuote = quotes[i];
                const { quote, amount } = amountQuote;
                if (!quote) {
                    util_1.log.debug({
                        route: (0, util_1.routeToString)(route),
                        amountQuote,
                    }, 'Dropping a null V2 quote for route.');
                    continue;
                }
                const routeWithValidQuote = new entities_1.V2RouteWithValidQuote({
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
        util_1.metric.putMetric('V2GetQuotesLoad', Date.now() - beforeGetQuotes, util_1.MetricLoggerUnit.Milliseconds);
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
            const routes = (0, compute_all_routes_1.computeAllV2Routes)(tokenIn, tokenOut, poolAccesor.getAllPools(), routingConfig.maxSwapsPerPath);
            return this.getQuotes(routes, amounts, percents, quoteToken, tradeType, routingConfig, undefined, undefined, gasPriceWei);
        });
    }
}
exports.V2Quoter = V2Quoter;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidjItcXVvdGVyLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiLi4vLi4vLi4vLi4vLi4vc3JjL3JvdXRlcnMvYWxwaGEtcm91dGVyL3F1b3RlcnMvdjItcXVvdGVyLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7Ozs7OztBQUNBLG9EQUErQztBQUMvQyxnREFBd0U7QUFDeEUsb0RBQXVCO0FBRXZCLGtEQVE0QjtBQUM1Qix3Q0FNdUI7QUFHdkIsMENBQW9EO0FBQ3BELHdFQUFxRTtBQU1yRSwwREFBNkQ7QUFFN0QsK0NBQTJDO0FBSTNDLE1BQWEsUUFBUyxTQUFRLHdCQUFxQztJQU1qRSxZQUNFLGtCQUF1QyxFQUN2QyxjQUErQixFQUMvQixlQUFpQyxFQUNqQyxpQkFBcUMsRUFDckMsYUFBNkIsRUFDN0IsT0FBZ0IsRUFDaEIsd0JBQTZDLEVBQzdDLHNCQUFnRDtRQUVoRCxLQUFLLENBQ0gsYUFBYSxFQUNiLE9BQU8sRUFDUCxxQkFBUSxDQUFDLEVBQUUsRUFDWCx3QkFBd0IsRUFDeEIsc0JBQXNCLENBQ3ZCLENBQUM7UUFDRixJQUFJLENBQUMsa0JBQWtCLEdBQUcsa0JBQWtCLENBQUM7UUFDN0MsSUFBSSxDQUFDLGNBQWMsR0FBRyxjQUFjLENBQUM7UUFDckMsSUFBSSxDQUFDLGVBQWUsR0FBRyxlQUFlLENBQUM7UUFDdkMsSUFBSSxDQUFDLGlCQUFpQixHQUFHLGlCQUFpQixDQUFDO0lBQzdDLENBQUM7SUFFUyxLQUFLLENBQUMsU0FBUyxDQUN2QixPQUFjLEVBQ2QsUUFBZSxFQUNmLGdCQUFrQyxFQUNsQyxVQUFxQixFQUNyQixhQUFnQztRQUVoQyxNQUFNLGVBQWUsR0FBRyxJQUFJLENBQUMsR0FBRyxFQUFFLENBQUM7UUFDbkMsNkVBQTZFO1FBQzdFLDhFQUE4RTtRQUM5RSx5QkFBeUI7UUFDekIsTUFBTSxFQUFFLFlBQVksRUFBRSxjQUFjLEVBQUUsR0FBRyxnQkFBZ0IsQ0FBQztRQUMxRCxNQUFNLFFBQVEsR0FBRyxZQUFZLENBQUMs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