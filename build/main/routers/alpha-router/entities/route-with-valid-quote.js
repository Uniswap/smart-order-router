"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.MixedRouteWithValidQuote = exports.V3RouteWithValidQuote = exports.V2RouteWithValidQuote = void 0;
const router_sdk_1 = require("@uniswap/router-sdk");
const sdk_core_1 = require("@uniswap/sdk-core");
const v3_sdk_1 = require("@uniswap/v3-sdk");
const lodash_1 = __importDefault(require("lodash"));
const amounts_1 = require("../../../util/amounts");
const routes_1 = require("../../../util/routes");
/**
 * Represents a quote for swapping on a V2 only route. Contains all information
 * such as the route used, the amount specified by the user, the type of quote
 * (exact in or exact out), the quote itself, and gas estimates.
 *
 * @export
 * @class V2RouteWithValidQuote
 */
class V2RouteWithValidQuote {
    toString() {
        return `${this.percent.toFixed(2)}% QuoteGasAdj[${this.quoteAdjustedForGas.toExact()}] Quote[${this.quote.toExact()}] Gas[${this.gasEstimate.toString()}] = ${(0, routes_1.routeToString)(this.route)}`;
    }
    constructor({ amount, rawQuote, percent, route, gasModel, quoteToken, tradeType, v2PoolProvider, }) {
        this.protocol = router_sdk_1.Protocol.V2;
        this.amount = amount;
        this.rawQuote = rawQuote;
        this.quote = amounts_1.CurrencyAmount.fromRawAmount(quoteToken, rawQuote.toString());
        this.percent = percent;
        this.route = route;
        this.gasModel = gasModel;
        this.quoteToken = quoteToken;
        this.tradeType = tradeType;
        const { gasEstimate, gasCostInToken, gasCostInUSD, gasCostInGasToken } = this.gasModel.estimateGasCost(this);
        this.gasCostInToken = gasCostInToken;
        this.gasCostInUSD = gasCostInUSD;
        this.gasEstimate = gasEstimate;
        this.gasCostInGasToken = gasCostInGasToken;
        // If its exact out, we need to request *more* of the input token to account for the gas.
        if (this.tradeType == sdk_core_1.TradeType.EXACT_INPUT) {
            const quoteGasAdjusted = this.quote.subtract(gasCostInToken);
            this.quoteAdjustedForGas = quoteGasAdjusted;
        }
        else {
            const quoteGasAdjusted = this.quote.add(gasCostInToken);
            this.quoteAdjustedForGas = quoteGasAdjusted;
        }
        this.poolAddresses = lodash_1.default.map(route.pairs, (p) => v2PoolProvider.getPoolAddress(p.token0, p.token1).poolAddress);
        this.tokenPath = this.route.path;
    }
}
exports.V2RouteWithValidQuote = V2RouteWithValidQuote;
/**
 * Represents a quote for swapping on a V3 only route. Contains all information
 * such as the route used, the amount specified by the user, the type of quote
 * (exact in or exact out), the quote itself, and gas estimates.
 *
 * @export
 * @class V3RouteWithValidQuote
 */
class V3RouteWithValidQuote {
    toString() {
        return `${this.percent.toFixed(2)}% QuoteGasAdj[${this.quoteAdjustedForGas.toExact()}] Quote[${this.quote.toExact()}] Gas[${this.gasEstimate.toString()}] = ${(0, routes_1.routeToString)(this.route)}`;
    }
    constructor({ amount, rawQuote, sqrtPriceX96AfterList, initializedTicksCrossedList, quoterGasEstimate, percent, route, gasModel, quoteToken, tradeType, v3PoolProvider, }) {
        this.protocol = router_sdk_1.Protocol.V3;
        this.amount = amount;
        this.rawQuote = rawQuote;
        this.sqrtPriceX96AfterList = sqrtPriceX96AfterList;
        this.initializedTicksCrossedList = initializedTicksCrossedList;
        this.quoterGasEstimate = quoterGasEstimate;
        this.quote = amounts_1.CurrencyAmount.fromRawAmount(quoteToken, rawQuote.toString());
        this.percent = percent;
        this.route = route;
        this.gasModel = gasModel;
        this.quoteToken = quoteToken;
        this.tradeType = tradeType;
        const { gasEstimate, gasCostInToken, gasCostInUSD, gasCostInGasToken } = this.gasModel.estimateGasCost(this);
        this.gasCostInToken = gasCostInToken;
        this.gasCostInUSD = gasCostInUSD;
        this.gasEstimate = gasEstimate;
        this.gasCostInGasToken = gasCostInGasToken;
        // If its exact out, we need to request *more* of the input token to account for the gas.
        if (this.tradeType == sdk_core_1.TradeType.EXACT_INPUT) {
            const quoteGasAdjusted = this.quote.subtract(gasCostInToken);
            this.quoteAdjustedForGas = quoteGasAdjusted;
        }
        else {
            const quoteGasAdjusted = this.quote.add(gasCostInToken);
            this.quoteAdjustedForGas = quoteGasAdjusted;
        }
        this.poolAddresses = lodash_1.default.map(route.pools, (p) => v3PoolProvider.getPoolAddress(p.token0, p.token1, p.fee).poolAddress);
        this.tokenPath = this.route.tokenPath;
    }
}
exports.V3RouteWithValidQuote = V3RouteWithValidQuote;
/**
 * Represents a quote for swapping on a Mixed Route. Contains all information
 * such as the route used, the amount specified by the user, the type of quote
 * (exact in or exact out), the quote itself, and gas estimates.
 *
 * @export
 * @class MixedRouteWithValidQuote
 */
class MixedRouteWithValidQuote {
    toString() {
        return `${this.percent.toFixed(2)}% QuoteGasAdj[${this.quoteAdjustedForGas.toExact()}] Quote[${this.quote.toExact()}] Gas[${this.gasEstimate.toString()}] = ${(0, routes_1.routeToString)(this.route)}`;
    }
    constructor({ amount, rawQuote, sqrtPriceX96AfterList, initializedTicksCrossedList, quoterGasEstimate, percent, route, mixedRouteGasModel, quoteToken, tradeType, v3PoolProvider, v2PoolProvider, }) {
        this.protocol = router_sdk_1.Protocol.MIXED;
        this.amount = amount;
        this.rawQuote = rawQuote;
        this.sqrtPriceX96AfterList = sqrtPriceX96AfterList;
        this.initializedTicksCrossedList = initializedTicksCrossedList;
        this.quoterGasEstimate = quoterGasEstimate;
        this.quote = amounts_1.CurrencyAmount.fromRawAmount(quoteToken, rawQuote.toString());
        this.percent = percent;
        this.route = route;
        this.gasModel = mixedRouteGasModel;
        this.quoteToken = quoteToken;
        this.tradeType = tradeType;
        const { gasEstimate, gasCostInToken, gasCostInUSD, gasCostInGasToken } = this.gasModel.estimateGasCost(this);
        this.gasCostInToken = gasCostInToken;
        this.gasCostInUSD = gasCostInUSD;
        this.gasEstimate = gasEstimate;
        this.gasCostInGasToken = gasCostInGasToken;
        // If its exact out, we need to request *more* of the input token to account for the gas.
        if (this.tradeType == sdk_core_1.TradeType.EXACT_INPUT) {
            const quoteGasAdjusted = this.quote.subtract(gasCostInToken);
            this.quoteAdjustedForGas = quoteGasAdjusted;
        }
        else {
            const quoteGasAdjusted = this.quote.add(gasCostInToken);
            this.quoteAdjustedForGas = quoteGasAdjusted;
        }
        this.poolAddresses = lodash_1.default.map(route.pools, (p) => {
            return p instanceof v3_sdk_1.Pool
                ? v3PoolProvider.getPoolAddress(p.token0, p.token1, p.fee).poolAddress
                : v2PoolProvider.getPoolAddress(p.token0, p.token1).poolAddress;
        });
        this.tokenPath = this.route.path;
    }
}
exports.MixedRouteWithValidQuote = MixedRouteWithValidQuote;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicm91dGUtd2l0aC12YWxpZC1xdW90ZS5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbIi4uLy4uLy4uLy4uLy4uL3NyYy9yb3V0ZXJzL2FscGhhLXJvdXRlci9lbnRpdGllcy9yb3V0ZS13aXRoLXZhbGlkLXF1b3RlLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7Ozs7OztBQUNBLG9EQUErQztBQUMvQyxnREFBcUQ7QUFDckQsNENBQXVDO0FBQ3ZDLG9EQUF1QjtBQUl2QixtREFBdUQ7QUFDdkQsaURBQXFEO0FBMkRyRDs7Ozs7OztHQU9HO0FBQ0gsTUFBYSxxQkFBcUI7SUFtQnpCLFFBQVE7UUFDYixPQUFPLEdBQUcsSUFBSSxDQUFDLE9BQU8sQ0FBQyxPQUFPLENBQzVCLENBQUMsQ0FDRixpQkFBaUIsSUFBSSxDQUFDLG1CQUFtQixDQUFDLE9BQU8sRUFBRSxXQUFXLElBQUksQ0FBQyxLQUFLLENBQUMsT0FBTyxFQUFFLFNBQVMsSUFBSSxDQUFDLFdBQVcsQ0FBQyxRQUFRLEVBQUUsT0FBTyxJQUFBLHNCQUFhLEVBQ3pJLElBQUksQ0FBQyxLQUFLLENBQ1gsRUFBRSxDQUFDO0lBQ04sQ0FBQztJQUVELFlBQVksRUFDVixNQUFNLEVBQ04sUUFBUSxFQUNSLE9BQU8sRUFDUCxLQUFLLEVBQ0wsUUFBUSxFQUNSLFVBQVUsRUFDVixTQUFTLEVBQ1QsY0FBYyxHQUNjO1FBbkNkLGFBQVEsR0FBRyxxQkFBUSxDQUFDLEVBQUUsQ0FBQztRQW9DckMsSUFBSSxDQUFDLE1BQU0sR0FBRyxNQUFNLENBQUM7UUFDckIsSUFBSSxDQUFDLFFBQVEsR0FBRyxRQUFRLENBQUM7UUFDekIsSUFBSSxDQUFDLEtBQUssR0FBRyx3QkFBYyxDQUFDLGFBQWEsQ0FBQyxVQUFVLEVBQUUsUUFBUSxDQUFDLFFBQVEsRUFBRSxDQUFDLENBQUM7UUFDM0UsSUFBSSxDQUFDLE9BQU8sR0FBRyxPQUFPLENBQUM7UUFDdkIsSUFBSSxDQUFDLEtBQUssR0FBRyxLQUFLLENBQUM7UUFD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