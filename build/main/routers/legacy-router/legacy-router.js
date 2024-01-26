"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.LegacyRouter = void 0;
const bignumber_1 = require("@ethersproject/bignumber");
const logger_1 = require("@ethersproject/logger");
const router_sdk_1 = require("@uniswap/router-sdk");
const sdk_core_1 = require("@uniswap/sdk-core");
const v3_sdk_1 = require("@uniswap/v3-sdk");
const lodash_1 = __importDefault(require("lodash"));
const token_provider_1 = require("../../providers/token-provider");
const util_1 = require("../../util");
const amounts_1 = require("../../util/amounts");
const log_1 = require("../../util/log");
const routes_1 = require("../../util/routes");
const alpha_router_1 = require("../alpha-router");
const router_1 = require("../router");
const bases_1 = require("./bases");
// Interface defaults to 2.
const MAX_HOPS = 2;
/**
 * Replicates the router implemented in the V3 interface.
 * Code is mostly a copy from https://github.com/Uniswap/uniswap-interface/blob/0190b5a408c13016c87e1030ffc59326c085f389/src/hooks/useBestV3Trade.ts#L22-L23
 * with React/Redux hooks removed, and refactoring to allow re-use in other routers.
 */
class LegacyRouter {
    constructor({ chainId, multicall2Provider, poolProvider, quoteProvider, tokenProvider, }) {
        this.chainId = chainId;
        this.multicall2Provider = multicall2Provider;
        this.poolProvider = poolProvider;
        this.quoteProvider = quoteProvider;
        this.tokenProvider = tokenProvider;
    }
    async route(amount, quoteCurrency, swapType, swapConfig, partialRoutingConfig) {
        if (swapType == sdk_core_1.TradeType.EXACT_INPUT) {
            return this.routeExactIn(amount.currency, quoteCurrency, amount, swapConfig, partialRoutingConfig);
        }
        return this.routeExactOut(quoteCurrency, amount.currency, amount, swapConfig, partialRoutingConfig);
    }
    async routeExactIn(currencyIn, currencyOut, amountIn, swapConfig, routingConfig) {
        const tokenIn = currencyIn.wrapped;
        const tokenOut = currencyOut.wrapped;
        const routes = await this.getAllRoutes(tokenIn, tokenOut, routingConfig);
        const routeQuote = await this.findBestRouteExactIn(amountIn, tokenOut, routes, routingConfig);
        if (!routeQuote) {
            return null;
        }
        const trade = this.buildTrade(currencyIn, currencyOut, sdk_core_1.TradeType.EXACT_INPUT, routeQuote);
        return {
            quote: routeQuote.quote,
            quoteGasAdjusted: routeQuote.quote,
            route: [routeQuote],
            estimatedGasUsed: bignumber_1.BigNumber.from(0),
            estimatedGasUsedQuoteToken: amounts_1.CurrencyAmount.fromFractionalAmount(tokenOut, 0, 1),
            estimatedGasUsedUSD: amounts_1.CurrencyAmount.fromFractionalAmount(token_provider_1.DAI_MAINNET, 0, 1),
            gasPriceWei: bignumber_1.BigNumber.from(0),
            trade,
            methodParameters: swapConfig
                ? Object.assign(Object.assign({}, this.buildMethodParameters(trade, swapConfig)), { to: (0, util_1.SWAP_ROUTER_02_ADDRESSES)(this.chainId) }) : undefined,
            blockNumber: bignumber_1.BigNumber.from(0),
        };
    }
    async routeExactOut(currencyIn, currencyOut, amountOut, swapConfig, routingConfig) {
        const tokenIn = currencyIn.wrapped;
        const tokenOut = currencyOut.wrapped;
        const routes = await this.getAllRoutes(tokenIn, tokenOut, routingConfig);
        const routeQuote = await this.findBestRouteExactOut(amountOut, tokenIn, routes, routingConfig);
        if (!routeQuote) {
            return null;
        }
        const trade = this.buildTrade(currencyIn, currencyOut, sdk_core_1.TradeType.EXACT_OUTPUT, routeQuote);
        return {
            quote: routeQuote.quote,
            quoteGasAdjusted: routeQuote.quote,
            route: [routeQuote],
            estimatedGasUsed: bignumber_1.BigNumber.from(0),
            estimatedGasUsedQuoteToken: amounts_1.CurrencyAmount.fromFractionalAmount(tokenIn, 0, 1),
            estimatedGasUsedUSD: amounts_1.CurrencyAmount.fromFractionalAmount(token_provider_1.DAI_MAINNET, 0, 1),
            gasPriceWei: bignumber_1.BigNumber.from(0),
            trade,
            methodParameters: swapConfig
                ? Object.assign(Object.assign({}, this.buildMethodParameters(trade, swapConfig)), { to: (0, util_1.SWAP_ROUTER_02_ADDRESSES)(this.chainId) }) : undefined,
            blockNumber: bignumber_1.BigNumber.from(0),
        };
    }
    async findBestRouteExactIn(amountIn, tokenOut, routes, routingConfig) {
        const { routesWithQuotes: quotesRaw } = await this.quoteProvider.getQuotesManyExactIn([amountIn], routes, {
            blockNumber: routingConfig === null || routingConfig === void 0 ? void 0 : routingConfig.blockNumber,
        });
        const quotes100Percent = lodash_1.default.map(quotesRaw, ([route, quotes]) => { var _a, _b; return `${(0, routes_1.routeToString)(route)} : ${(_b = (_a = quotes[0]) === null || _a === void 0 ? void 0 : _a.quote) === null || _b === void 0 ? void 0 : _b.toString()}`; });
        log_1.log.info({ quotes100Percent }, '100% Quotes');
        const bestQuote = await this.getBestQuote(routes, quotesRaw, tokenOut, sdk_core_1.TradeType.EXACT_INPUT);
        return bestQuote;
    }
    async findBestRouteExactOut(amountOut, tokenIn, routes, routingConfig) {
        const { routesWithQuotes: quotesRaw } = await this.quoteProvider.getQuotesManyExactOut([amountOut], routes, {
            blockNumber: routingConfig === null || routingConfig === void 0 ? void 0 : routingConfig.blockNumber,
        });
        const bestQuote = await this.getBestQuote(routes, quotesRaw, tokenIn, sdk_core_1.TradeType.EXACT_OUTPUT);
        return bestQuote;
    }
    async getBestQuote(routes, quotesRaw, quoteToken, routeType) {
        log_1.log.debug(`Got ${lodash_1.default.filter(quotesRaw, ([_, quotes]) => !!quotes[0]).length} valid quotes from ${routes.length} possible routes.`);
        const routeQuotesRaw = [];
        for (let i = 0; i < quotesRaw.length; i++) {
            const [route, quotes] = quotesRaw[i];
            const { quote, amount } = quotes[0];
            if (!quote) {
                logger_1.Logger.globalLogger().debug(`No quote for ${(0, routes_1.routeToString)(route)}`);
                continue;
            }
            routeQuotesRaw.push({ route, quote, amount });
        }
        if (routeQuotesRaw.length == 0) {
            return null;
        }
        routeQuotesRaw.sort((routeQuoteA, routeQuoteB) => {
            if (routeType == sdk_core_1.TradeType.EXACT_INPUT) {
                return routeQuoteA.quote.gt(routeQuoteB.quote) ? -1 : 1;
            }
            else {
                return routeQuoteA.quote.lt(routeQuoteB.quote) ? -1 : 1;
            }
        });
        const routeQuotes = lodash_1.default.map(routeQuotesRaw, ({ route, quote, amount }) => {
            return new alpha_router_1.V3RouteWithValidQuote({
                route,
                rawQuote: quote,
                amount,
                percent: 100,
                gasModel: {
                    estimateGasCost: () => ({
                        gasCostInToken: amounts_1.CurrencyAmount.fromRawAmount(quoteToken, 0),
                        gasCostInUSD: amounts_1.CurrencyAmount.fromRawAmount(token_provider_1.USDC_MAINNET, 0),
                        gasEstimate: bignumber_1.BigNumber.from(0),
                    }),
                },
                sqrtPriceX96AfterList: [],
                initializedTicksCrossedList: [],
                quoterGasEstimate: bignumber_1.BigNumber.from(0),
                tradeType: routeType,
                quoteToken,
                v3PoolProvider: this.poolProvider,
            });
        });
        for (const rq of routeQuotes) {
            log_1.log.debug(`Quote: ${rq.amount.toFixed(Math.min(rq.amount.currency.decimals, 2))} Route: ${(0, routes_1.routeToString)(rq.route)}`);
        }
        return routeQuotes[0];
    }
    async getAllRoutes(tokenIn, tokenOut, routingConfig) {
        const tokenPairs = await this.getAllPossiblePairings(tokenIn, tokenOut);
        const poolAccessor = await this.poolProvider.getPools(tokenPairs, {
            blockNumber: routingConfig === null || routingConfig === void 0 ? void 0 : routingConfig.blockNumber,
        });
        const pools = poolAccessor.getAllPools();
        const routes = this.computeAllRoutes(tokenIn, tokenOut, pools, this.chainId, [], [], tokenIn, MAX_HOPS);
        log_1.log.info({ routes: lodash_1.default.map(routes, routes_1.routeToString) }, `Computed ${routes.length} possible routes.`);
        return routes;
    }
    async getAllPossiblePairings(tokenIn, tokenOut) {
        var _a, _b, _c, _d, _e;
        const common = (_a = (0, bases_1.BASES_TO_CHECK_TRADES_AGAINST)(this.tokenProvider)[this.chainId]) !== null && _a !== void 0 ? _a : [];
        const additionalA = (_c = (_b = (await (0, bases_1.ADDITIONAL_BASES)(this.tokenProvider))[this.chainId]) === null || _b === void 0 ? void 0 : _b[tokenIn.address]) !== null && _c !== void 0 ? _c : [];
        const additionalB = (_e = (_d = (await (0, bases_1.ADDITIONAL_BASES)(this.tokenProvider))[this.chainId]) === null || _d === void 0 ? void 0 : _d[tokenOut.address]) !== null && _e !== void 0 ? _e : [];
        const bases = [...common, ...additionalA, ...additionalB];
        const basePairs = lodash_1.default.flatMap(bases, (base) => bases.map((otherBase) => [base, otherBase]));
        const customBases = (await (0, bases_1.CUSTOM_BASES)(this.tokenProvider))[this.chainId];
        const allPairs = (0, lodash_1.default)([
            // the direct pair
            [tokenIn, tokenOut],
            // token A against all bases
            ...bases.map((base) => [tokenIn, base]),
            // token B against all bases
            ...bases.map((base) => [tokenOut, base]),
            // each base against all bases
            ...basePairs,
        ])
            .filter((tokens) => Boolean(tokens[0] && tokens[1]))
            .filter(([tokenA, tokenB]) => tokenA.address !== tokenB.address && !tokenA.equals(tokenB))
            .filter(([tokenA, tokenB]) => {
            const customBasesA = customBases === null || customBases === void 0 ? void 0 : customBases[tokenA.address];
            const customBasesB = customBases === null || customBases === void 0 ? void 0 : customBases[tokenB.address];
            if (!customBasesA && !customBasesB)
                return true;
            if (customBasesA && !customBasesA.find((base) => tokenB.equals(base)))
                return false;
            if (customBasesB && !customBasesB.find((base) => tokenA.equals(base)))
                return false;
            return true;
        })
            .flatMap(([tokenA, tokenB]) => {
            return [
                [tokenA, tokenB, v3_sdk_1.FeeAmount.LOW],
                [tokenA, tokenB, v3_sdk_1.FeeAmount.MEDIUM],
                [tokenA, tokenB, v3_sdk_1.FeeAmount.HIGH],
            ];
        })
            .value();
        return allPairs;
    }
    computeAllRoutes(tokenIn, tokenOut, pools, chainId, currentPath = [], allPaths = [], startTokenIn = tokenIn, maxHops = 2) {
        for (const pool of pools) {
            if (currentPath.indexOf(pool) !== -1 || !pool.involvesToken(tokenIn))
                continue;
            const outputToken = pool.token0.equals(tokenIn)
                ? pool.token1
                : pool.token0;
            if (outputToken.equals(tokenOut)) {
                allPaths.push(new router_1.V3Route([...currentPath, pool], startTokenIn, tokenOut));
            }
            else if (maxHops > 1) {
                this.computeAllRoutes(outputToken, tokenOut, pools, chainId, [...currentPath, pool], allPaths, startTokenIn, maxHops - 1);
            }
        }
        return allPaths;
    }
    buildTrade(tokenInCurrency, tokenOutCurrency, tradeType, routeAmount) {
        const { route, amount, quote } = routeAmount;
        // The route, amount and quote are all in terms of wrapped tokens.
        // When constructing the Trade object the inputAmount/outputAmount must
        // use native currencies if necessary. This is so that the Trade knows to wrap/unwrap.
        if (tradeType == sdk_core_1.TradeType.EXACT_INPUT) {
            const amountCurrency = amounts_1.CurrencyAmount.fromFractionalAmount(tokenInCurrency, amount.numerator, amount.denominator);
            const quoteCurrency = amounts_1.CurrencyAmount.fromFractionalAmount(tokenOutCurrency, quote.numerator, quote.denominator);
            const routeCurrency = new v3_sdk_1.Route(route.pools, amountCurrency.currency, quoteCurrency.currency);
            return new router_sdk_1.Trade({
                v3Routes: [
                    {
                        routev3: routeCurrency,
                        inputAmount: amountCurrency,
                        outputAmount: quoteCurrency,
                    },
                ],
                v2Routes: [],
                tradeType: tradeType,
            });
        }
        else {
            const quoteCurrency = amounts_1.CurrencyAmount.fromFractionalAmount(tokenInCurrency, quote.numerator, quote.denominator);
            const amountCurrency = amounts_1.CurrencyAmount.fromFractionalAmount(tokenOutCurrency, amount.numerator, amount.denominator);
            const routeCurrency = new v3_sdk_1.Route(route.pools, quoteCurrency.currency, amountCurrency.currency);
            return new router_sdk_1.Trade({
                v3Routes: [
                    {
                        routev3: routeCurrency,
                        inputAmount: quoteCurrency,
                        outputAmount: amountCurrency,
                    },
                ],
                v2Routes: [],
                tradeType: tradeType,
            });
        }
    }
    buildMethodParameters(trade, swapConfig) {
        const { recipient, slippageTolerance, deadline } = swapConfig;
        const methodParameters = router_sdk_1.SwapRouter.swapCallParameters(trade, {
            recipient,
            slippageTolerance,
            deadlineOrPreviousBlockhash: deadline,
            // ...(signatureData
            //   ? {
            //       inputTokenPermit:
            //         'allowed' in signatureData
            //           ? {
            //               expiry: signatureData.deadline,
            //               nonce: signatureData.nonce,
            //               s: signatureData.s,
            //               r: signatureData.r,
            //               v: signatureData.v as any,
            //             }
            //           : {
            //               deadline: signatureData.deadline,
            //               amount: signatureData.amount,
            //               s: signatureData.s,
            //               r: signatureData.r,
            //               v: signatureData.v as any,
            //             },
            //     }
            //   : {}),
        });
        return methodParameters;
    }
}
exports.LegacyRouter = LegacyRouter;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibGVnYWN5LXJvdXRlci5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbIi4uLy4uLy4uLy4uL3NyYy9yb3V0ZXJzL2xlZ2FjeS1yb3V0ZXIvbGVnYWN5LXJvdXRlci50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiOzs7Ozs7QUFBQSx3REFBcUQ7QUFDckQsa0RBQStDO0FBQy9DLG9EQUF3RDtBQUN4RCxnREFBd0U7QUFDeEUsNENBQTJFO0FBQzNFLG9EQUF1QjtBQUl2QixtRUFJd0M7QUFFeEMscUNBQXNEO0FBQ3RELGdEQUFvRDtBQUNwRCx3Q0FBcUM7QUFDckMsOENBQWtEO0FBQ2xELGtEQUF3RDtBQUN4RCxzQ0FBd0U7QUFFeEUsbUNBSWlCO0FBVWpCLDJCQUEyQjtBQUMzQixNQUFNLFFBQVEsR0FBRyxDQUFDLENBQUM7QUFNbkI7Ozs7R0FJRztBQUNILE1BQWEsWUFBWTtJQU92QixZQUFZLEVBQ1YsT0FBTyxFQUNQLGtCQUFrQixFQUNsQixZQUFZLEVBQ1osYUFBYSxFQUNiLGFBQWEsR0FDTTtRQUNuQixJQUFJLENBQUMsT0FBTyxHQUFHLE9BQU8sQ0FBQztRQUN2QixJQUFJLENBQUMsa0JBQWtCLEdBQUcsa0JBQWtCLENBQUM7UUFDN0MsSUFBSSxDQUFDLFlBQVksR0FBRyxZQUFZLENBQUM7UUFDakMsSUFBSSxDQUFDLGFBQWEsR0FBRyxhQUFhLENBQUM7UUFDbkMsSUFBSSxDQUFDLGFBQWEsR0FBRyxhQUFhLENBQUM7SUFDckMsQ0FBQztJQUNNLEtBQUssQ0FBQyxLQUFLLENBQ2hCLE1BQXNCLEVBQ3RCLGFBQXVCLEVBQ3ZCLFFBQW1CLEVBQ25CLFVBQW9DLEVBQ3BDLG9CQUFtRDtRQUVuRCxJQUFJLFFBQVEsSUFBSSxvQkFBUyxDQUFDLFdBQVcsRUFBRTtZQUNyQyxPQUFPLElBQUksQ0FBQyxZQUFZLENBQ3RCLE1BQU0sQ0FBQyxRQUFRLEVBQ2YsYUFBYSxFQUNiLE1BQU0sRUFDTixVQUFVLEVBQ1Ysb0JBQW9CLENBQ3JCLENBQUM7U0FDSDtR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