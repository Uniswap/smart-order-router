"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.MixedQuoter = void 0;
const router_sdk_1 = require("@uniswap/router-sdk");
const sdk_core_1 = require("@uniswap/sdk-core");
const lodash_1 = __importDefault(require("lodash"));
const providers_1 = require("../../../providers");
const util_1 = require("../../../util");
const entities_1 = require("../entities");
const compute_all_routes_1 = require("../functions/compute-all-routes");
const get_candidate_pools_1 = require("../functions/get-candidate-pools");
const base_quoter_1 = require("./base-quoter");
class MixedQuoter extends base_quoter_1.BaseQuoter {
    constructor(v3SubgraphProvider, v3PoolProvider, v2SubgraphProvider, v2PoolProvider, onChainQuoteProvider, tokenProvider, chainId, blockedTokenListProvider, tokenValidatorProvider) {
        super(tokenProvider, chainId, router_sdk_1.Protocol.MIXED, blockedTokenListProvider, tokenValidatorProvider);
        this.v3SubgraphProvider = v3SubgraphProvider;
        this.v3PoolProvider = v3PoolProvider;
        this.v2SubgraphProvider = v2SubgraphProvider;
        this.v2PoolProvider = v2PoolProvider;
        this.onChainQuoteProvider = onChainQuoteProvider;
    }
    async getRoutes(tokenIn, tokenOut, v3v2candidatePools, tradeType, routingConfig) {
        const beforeGetRoutes = Date.now();
        if (tradeType != sdk_core_1.TradeType.EXACT_INPUT) {
            throw new Error('Mixed route quotes are not supported for EXACT_OUTPUT');
        }
        const [v3CandidatePools, v2CandidatePools] = v3v2candidatePools;
        const { V2poolAccessor, V3poolAccessor, candidatePools: mixedRouteCandidatePools, } = await (0, get_candidate_pools_1.getMixedRouteCandidatePools)({
            v3CandidatePools,
            v2CandidatePools,
            tokenProvider: this.tokenProvider,
            v3poolProvider: this.v3PoolProvider,
            v2poolProvider: this.v2PoolProvider,
            routingConfig,
            chainId: this.chainId,
        });
        const V3poolsRaw = V3poolAccessor.getAllPools();
        const V2poolsRaw = V2poolAccessor.getAllPools();
        const poolsRaw = [...V3poolsRaw, ...V2poolsRaw];
        const candidatePools = mixedRouteCandidatePools;
        // Drop any pools that contain fee on transfer tokens (not supported by v3) or have issues with being transferred.
        const pools = await this.applyTokenValidatorToPools(poolsRaw, (token, tokenValidation) => {
            // If there is no available validation result we assume the token is fine.
            if (!tokenValidation) {
                return false;
            }
            // Only filters out *intermediate* pools that involve tokens that we detect
            // cant be transferred. This prevents us trying to route through tokens that may
            // not be transferrable, but allows users to still swap those tokens if they
            // specify.
            //
            if (tokenValidation == providers_1.TokenValidationResult.STF &&
                (token.equals(tokenIn) || token.equals(tokenOut))) {
                return false;
            }
            return (tokenValidation == providers_1.TokenValidationResult.FOT ||
                tokenValidation == providers_1.TokenValidationResult.STF);
        });
        const { maxSwapsPerPath } = routingConfig;
        const routes = (0, compute_all_routes_1.computeAllMixedRoutes)(tokenIn, tokenOut, pools, maxSwapsPerPath);
        util_1.metric.putMetric('MixedGetRoutesLoad', Date.now() - beforeGetRoutes, util_1.MetricLoggerUnit.Milliseconds);
        return {
            routes,
            candidatePools,
        };
    }
    async getQuotes(routes, amounts, percents, quoteToken, tradeType, routingConfig, candidatePools, gasModel) {
        const beforeGetQuotes = Date.now();
        util_1.log.info('Starting to get mixed quotes');
        if (gasModel === undefined) {
            throw new Error('GasModel for MixedRouteWithValidQuote is required to getQuotes');
        }
        if (routes.length == 0) {
            return { routesWithValidQuotes: [], candidatePools };
        }
        // For all our routes, and all the fractional amounts, fetch quotes on-chain.
        const quoteFn = this.onChainQuoteProvider.getQuotesManyExactIn.bind(this.onChainQuoteProvider);
        const beforeQuotes = Date.now();
        util_1.log.info(`Getting quotes for mixed for ${routes.length} routes with ${amounts.length} amounts per route.`);
        const { routesWithQuotes } = await quoteFn(amounts, routes, {
            blockNumber: routingConfig.blockNumber,
        });
        util_1.metric.putMetric('MixedQuotesLoad', Date.now() - beforeQuotes, util_1.MetricLoggerUnit.Milliseconds);
        util_1.metric.putMetric('MixedQuotesFetched', (0, lodash_1.default)(routesWithQuotes)
            .map(([, quotes]) => quotes.length)
            .sum(), util_1.MetricLoggerUnit.Count);
        const routesWithValidQuotes = [];
        for (const routeWithQuote of routesWithQuotes) {
            const [route, quotes] = routeWithQuote;
            for (let i = 0; i < quotes.length; i++) {
                const percent = percents[i];
                const amountQuote = quotes[i];
                const { quote, amount, sqrtPriceX96AfterList, initializedTicksCrossedList, gasEstimate, } = amountQuote;
                if (!quote ||
                    !sqrtPriceX96AfterList ||
                    !initializedTicksCrossedList ||
                    !gasEstimate) {
                    util_1.log.debug({
                        route: (0, util_1.routeToString)(route),
                        amountQuote,
                    }, 'Dropping a null mixed quote for route.');
                    continue;
                }
                const routeWithValidQuote = new entities_1.MixedRouteWithValidQuote({
                    route,
                    rawQuote: quote,
                    amount,
                    percent,
                    sqrtPriceX96AfterList,
                    initializedTicksCrossedList,
                    quoterGasEstimate: gasEstimate,
                    mixedRouteGasModel: gasModel,
                    quoteToken,
                    tradeType,
                    v3PoolProvider: this.v3PoolProvider,
                    v2PoolProvider: this.v2PoolProvider,
                });
                routesWithValidQuotes.push(routeWithValidQuote);
            }
        }
        util_1.metric.putMetric('MixedGetQuotesLoad', Date.now() - beforeGetQuotes, util_1.MetricLoggerUnit.Milliseconds);
        return {
            routesWithValidQuotes,
            candidatePools,
        };
    }
}
exports.MixedQuoter = MixedQuoter;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibWl4ZWQtcXVvdGVyLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiLi4vLi4vLi4vLi4vLi4vc3JjL3JvdXRlcnMvYWxwaGEtcm91dGVyL3F1b3RlcnMvbWl4ZWQtcXVvdGVyLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7Ozs7OztBQUFBLG9EQUErQztBQUMvQyxnREFBd0U7QUFDeEUsb0RBQXVCO0FBRXZCLGtEQVU0QjtBQUM1Qix3Q0FNdUI7QUFHdkIsMENBQXVEO0FBQ3ZELHdFQUF3RTtBQUN4RSwwRUFLMEM7QUFHMUMsK0NBQTJDO0FBRzNDLE1BQWEsV0FBWSxTQUFRLHdCQUdoQztJQU9DLFlBQ0Usa0JBQXVDLEVBQ3ZDLGNBQStCLEVBQy9CLGtCQUF1QyxFQUN2QyxjQUErQixFQUMvQixvQkFBMkMsRUFDM0MsYUFBNkIsRUFDN0IsT0FBZ0IsRUFDaEIsd0JBQTZDLEVBQzdDLHNCQUFnRDtRQUVoRCxLQUFLLENBQ0gsYUFBYSxFQUNiLE9BQU8sRUFDUCxxQkFBUSxDQUFDLEtBQUssRUFDZCx3QkFBd0IsRUFDeEIsc0JBQXNCLENBQ3ZCLENBQUM7UUFDRixJQUFJLENBQUMsa0JBQWtCLEdBQUcsa0JBQWtCLENBQUM7UUFDN0MsSUFBSSxDQUFDLGNBQWMsR0FBRyxjQUFjLENBQUM7UUFDckMsSUFBSSxDQUFDLGtCQUFrQixHQUFHLGtCQUFrQixDQUFDO1FBQzdDLElBQUksQ0FBQyxjQUFjLEdBQUcsY0FBYyxDQUFDO1FBQ3JDLElBQUksQ0FBQyxvQkFBb0IsR0FBRyxvQkFBb0IsQ0FBQztJQUNuRCxDQUFDO0lBRVMsS0FBSyxDQUFDLFNBQVMsQ0FDdkIsT0FBYyxFQUNkLFFBQWUsRUFDZixrQkFBd0QsRUFDeEQsU0FBb0IsRUFDcEIsYUFBZ0M7UUFFaEMsTUFBTSxlQUFlLEdBQUcsSUFBSSxDQUFDLEdBQUcsRUFBRSxDQUFDO1FBRW5DLElBQUksU0FBUyxJQUFJLG9CQUFTLENBQUMsV0FBVyxFQUFFO1lBQ3RDLE1BQU0sSUFBSSxLQUFLLENB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