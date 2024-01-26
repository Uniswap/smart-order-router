"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildSwapMethodParameters = exports.buildTrade = void 0;
const router_sdk_1 = require("@uniswap/router-sdk");
const sdk_core_1 = require("@uniswap/sdk-core");
const universal_router_sdk_1 = require("@uniswap/universal-router-sdk");
const v2_sdk_1 = require("@uniswap/v2-sdk");
const v3_sdk_1 = require("@uniswap/v3-sdk");
const lodash_1 = __importDefault(require("lodash"));
const __1 = require("..");
function buildTrade(tokenInCurrency, tokenOutCurrency, tradeType, routeAmounts) {
    /// Removed partition because of new mixedRoutes
    const v3RouteAmounts = lodash_1.default.filter(routeAmounts, (routeAmount) => routeAmount.protocol === router_sdk_1.Protocol.V3);
    const v2RouteAmounts = lodash_1.default.filter(routeAmounts, (routeAmount) => routeAmount.protocol === router_sdk_1.Protocol.V2);
    const mixedRouteAmounts = lodash_1.default.filter(routeAmounts, (routeAmount) => routeAmount.protocol === router_sdk_1.Protocol.MIXED);
    const v3Routes = lodash_1.default.map(v3RouteAmounts, (routeAmount) => {
        const { route, amount, quote } = routeAmount;
        // The route, amount and quote are all in terms of wrapped tokens.
        // When constructing the Trade object the inputAmount/outputAmount must
        // use native currencies if specified by the user. This is so that the Trade knows to wrap/unwrap.
        if (tradeType == sdk_core_1.TradeType.EXACT_INPUT) {
            const amountCurrency = __1.CurrencyAmount.fromFractionalAmount(tokenInCurrency, amount.numerator, amount.denominator);
            const quoteCurrency = __1.CurrencyAmount.fromFractionalAmount(tokenOutCurrency, quote.numerator, quote.denominator);
            const routeRaw = new v3_sdk_1.Route(route.pools, amountCurrency.currency, quoteCurrency.currency);
            return {
                routev3: routeRaw,
                inputAmount: amountCurrency,
                outputAmount: quoteCurrency,
            };
        }
        else {
            const quoteCurrency = __1.CurrencyAmount.fromFractionalAmount(tokenInCurrency, quote.numerator, quote.denominator);
            const amountCurrency = __1.CurrencyAmount.fromFractionalAmount(tokenOutCurrency, amount.numerator, amount.denominator);
            const routeCurrency = new v3_sdk_1.Route(route.pools, quoteCurrency.currency, amountCurrency.currency);
            return {
                routev3: routeCurrency,
                inputAmount: quoteCurrency,
                outputAmount: amountCurrency,
            };
        }
    });
    const v2Routes = lodash_1.default.map(v2RouteAmounts, (routeAmount) => {
        const { route, amount, quote } = routeAmount;
        // The route, amount and quote are all in terms of wrapped tokens.
        // When constructing the Trade object the inputAmount/outputAmount must
        // use native currencies if specified by the user. This is so that the Trade knows to wrap/unwrap.
        if (tradeType == sdk_core_1.TradeType.EXACT_INPUT) {
            const amountCurrency = __1.CurrencyAmount.fromFractionalAmount(tokenInCurrency, amount.numerator, amount.denominator);
            const quoteCurrency = __1.CurrencyAmount.fromFractionalAmount(tokenOutCurrency, quote.numerator, quote.denominator);
            const routeV2SDK = new v2_sdk_1.Route(route.pairs, amountCurrency.currency, quoteCurrency.currency);
            return {
                routev2: routeV2SDK,
                inputAmount: amountCurrency,
                outputAmount: quoteCurrency,
            };
        }
        else {
            const quoteCurrency = __1.CurrencyAmount.fromFractionalAmount(tokenInCurrency, quote.numerator, quote.denominator);
            const amountCurrency = __1.CurrencyAmount.fromFractionalAmount(tokenOutCurrency, amount.numerator, amount.denominator);
            const routeV2SDK = new v2_sdk_1.Route(route.pairs, quoteCurrency.currency, amountCurrency.currency);
            return {
                routev2: routeV2SDK,
                inputAmount: quoteCurrency,
                outputAmount: amountCurrency,
            };
        }
    });
    const mixedRoutes = lodash_1.default.map(mixedRouteAmounts, (routeAmount) => {
        const { route, amount, quote } = routeAmount;
        if (tradeType != sdk_core_1.TradeType.EXACT_INPUT) {
            throw new Error('Mixed routes are only supported for exact input trades');
        }
        // The route, amount and quote are all in terms of wrapped tokens.
        // When constructing the Trade object the inputAmount/outputAmount must
        // use native currencies if specified by the user. This is so that the Trade knows to wrap/unwrap.
        const amountCurrency = __1.CurrencyAmount.fromFractionalAmount(tokenInCurrency, amount.numerator, amount.denominator);
        const quoteCurrency = __1.CurrencyAmount.fromFractionalAmount(tokenOutCurrency, quote.numerator, quote.denominator);
        const routeRaw = new router_sdk_1.MixedRouteSDK(route.pools, amountCurrency.currency, quoteCurrency.currency);
        return {
            mixedRoute: routeRaw,
            inputAmount: amountCurrency,
            outputAmount: quoteCurrency,
        };
    });
    const trade = new router_sdk_1.Trade({ v2Routes, v3Routes, mixedRoutes, tradeType });
    return trade;
}
exports.buildTrade = buildTrade;
function buildSwapMethodParameters(trade, swapConfig, chainId) {
    if (swapConfig.type == __1.SwapType.UNIVERSAL_ROUTER) {
        return Object.assign(Object.assign({}, universal_router_sdk_1.SwapRouter.swapERC20CallParameters(trade, swapConfig)), { to: (0, universal_router_sdk_1.UNIVERSAL_ROUTER_ADDRESS)(chainId) });
    }
    else if (swapConfig.type == __1.SwapType.SWAP_ROUTER_02) {
        const { recipient, slippageTolerance, deadline, inputTokenPermit } = swapConfig;
        return Object.assign(Object.assign({}, router_sdk_1.SwapRouter.swapCallParameters(trade, {
            recipient,
            slippageTolerance,
            deadlineOrPreviousBlockhash: deadline,
            inputTokenPermit,
        })), { to: (0, __1.SWAP_ROUTER_02_ADDRESSES)(chainId) });
    }
    throw new Error(`Unsupported swap type ${swapConfig}`);
}
exports.buildSwapMethodParameters = buildSwapMethodParameters;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibWV0aG9kUGFyYW1ldGVycy5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbIi4uLy4uLy4uL3NyYy91dGlsL21ldGhvZFBhcmFtZXRlcnMudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7Ozs7O0FBQUEsb0RBSzZCO0FBQzdCLGdEQUFpRTtBQUNqRSx3RUFHdUM7QUFDdkMsNENBQXNEO0FBQ3RELDRDQUFzRDtBQUN0RCxvREFBdUI7QUFFdkIsMEJBVVk7QUFFWixTQUFnQixVQUFVLENBQ3hCLGVBQXlCLEVBQ3pCLGdCQUEwQixFQUMxQixTQUFxQixFQUNyQixZQUFtQztJQUVuQyxnREFBZ0Q7SUFDaEQsTUFBTSxjQUFjLEdBQUcsZ0JBQUMsQ0FBQyxNQUFNLENBQzdCLFlBQVksRUFDWixDQUFDLFdBQVcsRUFBRSxFQUFFLENBQUMsV0FBVyxDQUFDLFFBQVEsS0FBSyxxQkFBUSxDQUFDLEVBQUUsQ0FDdEQsQ0FBQztJQUNGLE1BQU0sY0FBYyxHQUFHLGdCQUFDLENBQUMsTUFBTSxDQUM3QixZQUFZLEVBQ1osQ0FBQyxXQUFXLEVBQUUsRUFBRSxDQUFDLFdBQVcsQ0FBQyxRQUFRLEtBQUsscUJBQVEsQ0FBQyxFQUFFLENBQ3RELENBQUM7SUFDRixNQUFNLGlCQUFpQixHQUFHLGdCQUFDLENBQUMsTUFBTSxDQUNoQyxZQUFZLEVBQ1osQ0FBQyxXQUFXLEVBQUUsRUFBRSxDQUFDLFdBQVcsQ0FBQyxRQUFRLEtBQUsscUJBQVEsQ0FBQyxLQUFLLENBQ3pELENBQUM7SUFFRixNQUFNLFFBQVEsR0FBRyxnQkFBQyxDQUFDLEdBQUcsQ0FRcEIsY0FBeUMsRUFDekMsQ0FBQyxXQUFrQyxFQUFFLEVBQUU7UUFDckMsTUFBTSxFQUFFLEtBQUssRUFBRSxNQUFNLEVBQUUsS0FBSyxFQUFFLEdBQUcsV0FBVyxDQUFDO1FBRTdDLGtFQUFrRTtRQUNsRSx1RUFBdUU7UUFDdkUsa0dBQWtHO1FBQ2xHLElBQUksU0FBUyxJQUFJLG9CQUFTLENBQUMsV0FBVyxFQUFFO1lB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