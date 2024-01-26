"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PortionProvider = void 0;
const bignumber_1 = require("@ethersproject/bignumber");
const router_sdk_1 = require("@uniswap/router-sdk");
const sdk_core_1 = require("@uniswap/sdk-core");
const routers_1 = require("../routers");
const util_1 = require("../util");
class PortionProvider {
    getPortionAmount(tokenOutAmount, tradeType, swapConfig) {
        if ((swapConfig === null || swapConfig === void 0 ? void 0 : swapConfig.type) !== routers_1.SwapType.UNIVERSAL_ROUTER) {
            return undefined;
        }
        const swapConfigUniversalRouter = swapConfig;
        switch (tradeType) {
            case sdk_core_1.TradeType.EXACT_INPUT:
                if (swapConfigUniversalRouter.fee &&
                    swapConfigUniversalRouter.fee.fee.greaterThan(router_sdk_1.ZERO)) {
                    return tokenOutAmount.multiply(swapConfigUniversalRouter.fee.fee);
                }
                return undefined;
            case sdk_core_1.TradeType.EXACT_OUTPUT:
                if (swapConfigUniversalRouter.flatFee &&
                    swapConfigUniversalRouter.flatFee.amount > bignumber_1.BigNumber.from(0)) {
                    return util_1.CurrencyAmount.fromRawAmount(tokenOutAmount.currency, swapConfigUniversalRouter.flatFee.amount.toString());
                }
                return undefined;
            default:
                throw new Error(`Unknown trade type ${tradeType}`);
        }
    }
    getPortionQuoteAmount(tradeType, quote, portionAdjustedAmount, portionAmount) {
        if (!portionAmount) {
            return undefined;
        }
        // this method can only be called for exact out
        // for exact in, there is no need to compute the portion quote amount, since portion is always against token out amount
        if (tradeType !== sdk_core_1.TradeType.EXACT_OUTPUT) {
            return undefined;
        }
        // 1. then we know portion amount and portion adjusted exact out amount,
        //    we can get a ratio
        //    i.e. portionToPortionAdjustedAmountRatio = portionAmountToken / portionAdjustedAmount
        const portionToPortionAdjustedAmountRatio = new sdk_core_1.Fraction(portionAmount.quotient, portionAdjustedAmount.quotient);
        // 2. we have the portionAmountToken / portionAdjustedAmount ratio
        //    then we can estimate the portion amount for quote, i.e. what is the estimated token in amount deducted for the portion
        //    this amount will be portionQuoteAmountToken = portionAmountToken / portionAdjustedAmount * quote
        //    CAVEAT: we prefer to use the quote currency amount OVER quote gas adjusted currency amount for the formula
        //    because the portion amount calculated from the exact out has no way to account for the gas units.
        return util_1.CurrencyAmount.fromRawAmount(quote.currency, portionToPortionAdjustedAmountRatio.multiply(quote).quotient);
    }
    getRouteWithQuotePortionAdjusted(tradeType, routeWithQuotes, swapConfig) {
        // the route with quote portion adjustment is only needed for exact in routes with quotes
        // because the route with quotes does not know the output amount needs to subtract the portion amount
        if (tradeType !== sdk_core_1.TradeType.EXACT_INPUT) {
            return routeWithQuotes;
        }
        // the route with quote portion adjustment is only needed for universal router
        // for swap router 02, it doesn't have portion-related commands
        if ((swapConfig === null || swapConfig === void 0 ? void 0 : swapConfig.type) !== routers_1.SwapType.UNIVERSAL_ROUTER) {
            return routeWithQuotes;
        }
        return routeWithQuotes.map((routeWithQuote) => {
            const portionAmount = this.getPortionAmount(routeWithQuote.quote, tradeType, swapConfig);
            // This is a sub-optimal solution agreed among the teams to work around the exact in
            // portion amount issue for universal router.
            // The most optimal solution is to update router-sdk https://github.com/Uniswap/router-sdk/blob/main/src/entities/trade.ts#L215
            // `minimumAmountOut` to include portionBips as well, `public minimumAmountOut(slippageTolerance: Percent, amountOut = this.outputAmount, portionBips: Percent)
            // but this will require a new release of router-sdk, and bump router-sdk versions in across downstream dependencies across the stack.
            // We opt to use this sub-optimal solution for now, and revisit the optimal solution in the future.
            // Since SOR subtracts portion amount from EACH route output amount (note the routeWithQuote.quote above),
            // SOR will have as accurate ouput amount per route as possible, which helps with the final `minimumAmountOut`
            if (portionAmount) {
                routeWithQuote.quote = routeWithQuote.quote.subtract(portionAmount);
            }
            return routeWithQuote;
        });
    }
    getQuote(tradeType, quote, portionQuoteAmount) {
        switch (tradeType) {
            case sdk_core_1.TradeType.EXACT_INPUT:
                return quote;
            case sdk_core_1.TradeType.EXACT_OUTPUT:
                return portionQuoteAmount ? quote.subtract(portionQuoteAmount) : quote;
            default:
                throw new Error(`Unknown trade type ${tradeType}`);
        }
    }
    getQuoteGasAdjusted(tradeType, quoteGasAdjusted, portionQuoteAmount) {
        switch (tradeType) {
            case sdk_core_1.TradeType.EXACT_INPUT:
                return quoteGasAdjusted;
            case sdk_core_1.TradeType.EXACT_OUTPUT:
                return portionQuoteAmount
                    ? quoteGasAdjusted.subtract(portionQuoteAmount)
                    : quoteGasAdjusted;
            default:
                throw new Error(`Unknown trade type ${tradeType}`);
        }
    }
    getQuoteGasAndPortionAdjusted(tradeType, quoteGasAdjusted, portionAmount) {
        if (!portionAmount) {
            return undefined;
        }
        switch (tradeType) {
            case sdk_core_1.TradeType.EXACT_INPUT:
                return quoteGasAdjusted.subtract(portionAmount);
            case sdk_core_1.TradeType.EXACT_OUTPUT:
                return quoteGasAdjusted;
            default:
                throw new Error(`Unknown trade type ${tradeType}`);
        }
    }
}
exports.PortionProvider = PortionProvider;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicG9ydGlvbi1wcm92aWRlci5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbIi4uLy4uLy4uL3NyYy9wcm92aWRlcnMvcG9ydGlvbi1wcm92aWRlci50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiOzs7QUFBQSx3REFBcUQ7QUFDckQsb0RBQTJDO0FBQzNDLGdEQUF3RDtBQUV4RCx3Q0FLb0I7QUFDcEIsa0NBQXlDO0FBd0d6QyxNQUFhLGVBQWU7SUFDMUIsZ0JBQWdCLENBQ2QsY0FBOEIsRUFDOUIsU0FBb0IsRUFDcEIsVUFBd0I7UUFFeEIsSUFBSSxDQUFBLFVBQVUsYUFBVixVQUFVLHVCQUFWLFVBQVUsQ0FBRSxJQUFJLE1BQUssa0JBQVEsQ0FBQyxnQkFBZ0IsRUFBRTtZQUNsRCxPQUFPLFNBQVMsQ0FBQztTQUNsQjtRQUVELE1BQU0seUJBQXlCLEdBQUcsVUFBd0MsQ0FBQztRQUMzRSxRQUFRLFNBQVMsRUFBRTtZQUNqQixLQUFLLG9CQUFTLENBQUMsV0FBVztnQkFDeEIsSUFDRSx5QkFBeUIsQ0FBQyxHQUFHO29CQUM3Qix5QkFBeUIsQ0FBQyxHQUFHLENBQUMsR0FBRyxDQUFDLFdBQVcsQ0FBQyxpQkFBSSxDQUFDLEVBQ25EO29CQUNBLE9BQU8sY0FBYyxDQUFDLFFBQVEsQ0FBQyx5QkFBeUIsQ0FBQyxHQUFHLENBQUMsR0FBRyxDQUFDLENBQUM7aUJBQ25FO2dCQUVELE9BQU8sU0FBUyxDQUFDO1lBQ25CLEtBQUssb0JBQVMsQ0FBQyxZQUFZO2dCQUN6QixJQUNFLHlCQUF5QixDQUFDLE9BQU87b0JBQ2pDLHlCQUF5QixDQUFDLE9BQU8sQ0FBQyxNQUFNLEdBQUcscUJBQVMsQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDLEVBQzVEO29CQUNBLE9BQU8scUJBQWMsQ0FBQyxhQUFhLENBQ2pDLGNBQWMsQ0FBQyxRQUFRLEVBQ3ZCLHlCQUF5QixDQUFDLE9BQU8sQ0FBQyxNQUFNLENBQUMsUUFBUSxFQUFFLENBQ3BELENBQUM7aUJBQ0g7Z0JBRUQs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