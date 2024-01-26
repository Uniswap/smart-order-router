import { BigNumber } from '@ethersproject/bignumber';
import { ZERO } from '@uniswap/router-sdk';
import { Fraction, TradeType } from '@uniswap/sdk-core';
import { SwapType, } from '../routers';
import { CurrencyAmount } from '../util';
export class PortionProvider {
    getPortionAmount(tokenOutAmount, tradeType, swapConfig) {
        if ((swapConfig === null || swapConfig === void 0 ? void 0 : swapConfig.type) !== SwapType.UNIVERSAL_ROUTER) {
            return undefined;
        }
        const swapConfigUniversalRouter = swapConfig;
        switch (tradeType) {
            case TradeType.EXACT_INPUT:
                if (swapConfigUniversalRouter.fee &&
                    swapConfigUniversalRouter.fee.fee.greaterThan(ZERO)) {
                    return tokenOutAmount.multiply(swapConfigUniversalRouter.fee.fee);
                }
                return undefined;
            case TradeType.EXACT_OUTPUT:
                if (swapConfigUniversalRouter.flatFee &&
                    swapConfigUniversalRouter.flatFee.amount > BigNumber.from(0)) {
                    return CurrencyAmount.fromRawAmount(tokenOutAmount.currency, swapConfigUniversalRouter.flatFee.amount.toString());
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
        if (tradeType !== TradeType.EXACT_OUTPUT) {
            return undefined;
        }
        // 1. then we know portion amount and portion adjusted exact out amount,
        //    we can get a ratio
        //    i.e. portionToPortionAdjustedAmountRatio = portionAmountToken / portionAdjustedAmount
        const portionToPortionAdjustedAmountRatio = new Fraction(portionAmount.quotient, portionAdjustedAmount.quotient);
        // 2. we have the portionAmountToken / portionAdjustedAmount ratio
        //    then we can estimate the portion amount for quote, i.e. what is the estimated token in amount deducted for the portion
        //    this amount will be portionQuoteAmountToken = portionAmountToken / portionAdjustedAmount * quote
        //    CAVEAT: we prefer to use the quote currency amount OVER quote gas adjusted currency amount for the formula
        //    because the portion amount calculated from the exact out has no way to account for the gas units.
        return CurrencyAmount.fromRawAmount(quote.currency, portionToPortionAdjustedAmountRatio.multiply(quote).quotient);
    }
    getRouteWithQuotePortionAdjusted(tradeType, routeWithQuotes, swapConfig) {
        // the route with quote portion adjustment is only needed for exact in routes with quotes
        // because the route with quotes does not know the output amount needs to subtract the portion amount
        if (tradeType !== TradeType.EXACT_INPUT) {
            return routeWithQuotes;
        }
        // the route with quote portion adjustment is only needed for universal router
        // for swap router 02, it doesn't have portion-related commands
        if ((swapConfig === null || swapConfig === void 0 ? void 0 : swapConfig.type) !== SwapType.UNIVERSAL_ROUTER) {
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
            case TradeType.EXACT_INPUT:
                return quote;
            case TradeType.EXACT_OUTPUT:
                return portionQuoteAmount ? quote.subtract(portionQuoteAmount) : quote;
            default:
                throw new Error(`Unknown trade type ${tradeType}`);
        }
    }
    getQuoteGasAdjusted(tradeType, quoteGasAdjusted, portionQuoteAmount) {
        switch (tradeType) {
            case TradeType.EXACT_INPUT:
                return quoteGasAdjusted;
            case TradeType.EXACT_OUTPUT:
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
            case TradeType.EXACT_INPUT:
                return quoteGasAdjusted.subtract(portionAmount);
            case TradeType.EXACT_OUTPUT:
                return quoteGasAdjusted;
            default:
                throw new Error(`Unknown trade type ${tradeType}`);
        }
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicG9ydGlvbi1wcm92aWRlci5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbIi4uLy4uLy4uL3NyYy9wcm92aWRlcnMvcG9ydGlvbi1wcm92aWRlci50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQSxPQUFPLEVBQUUsU0FBUyxFQUFFLE1BQU0sMEJBQTBCLENBQUM7QUFDckQsT0FBTyxFQUFFLElBQUksRUFBRSxNQUFNLHFCQUFxQixDQUFDO0FBQzNDLE9BQU8sRUFBRSxRQUFRLEVBQUUsU0FBUyxFQUFFLE1BQU0sbUJBQW1CLENBQUM7QUFFeEQsT0FBTyxFQUlMLFFBQVEsR0FDVCxNQUFNLFlBQVksQ0FBQztBQUNwQixPQUFPLEVBQUUsY0FBYyxFQUFFLE1BQU0sU0FBUyxDQUFDO0FBd0d6QyxNQUFNLE9BQU8sZUFBZTtJQUMxQixnQkFBZ0IsQ0FDZCxjQUE4QixFQUM5QixTQUFvQixFQUNwQixVQUF3QjtRQUV4QixJQUFJLENBQUEsVUFBVSxhQUFWLFVBQVUsdUJBQVYsVUFBVSxDQUFFLElBQUksTUFBSyxRQUFRLENBQUMsZ0JBQWdCLEVBQUU7WUFDbEQsT0FBTyxTQUFTLENBQUM7U0FDbEI7UUFFRCxNQUFNLHlCQUF5QixHQUFHLFVBQXdDLENBQUM7UUFDM0UsUUFBUSxTQUFTLEVBQUU7WUFDakIsS0FBSyxTQUFTLENBQUMsV0FBVztnQkFDeEIsSUFDRSx5QkFBeUIsQ0FBQyxHQUFHO29CQUM3Qix5QkFBeUIsQ0FBQyxHQUFHLENBQUMsR0FBRyxDQUFDLFdBQVcsQ0FBQyxJQUFJLENBQUMsRUFDbkQ7b0JBQ0EsT0FBTyxjQUFjLENBQUMsUUFBUSxDQUFDLHlCQUF5QixDQUFDLEdBQUcsQ0FBQyxHQUFHLENBQUMsQ0FBQztpQkFDbkU7Z0JBRUQsT0FBTyxTQUFTLENBQUM7WUFDbkIsS0FBSyxTQUFTLENBQUMsWUFBWTtnQkFDekIsSUFDRSx5QkFBeUIsQ0FBQyxPQUFPO29CQUNqQyx5QkFBeUIsQ0FBQyxPQUFPLENBQUMsTUFBTSxHQUFHLFNBQVMsQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDLEVBQzVEO29CQUNBLE9BQU8sY0FBYyxDQUFDLGFBQWEsQ0FDakMsY0FBYyxDQUFDLFFBQVEsRUFDdkIseUJBQXlCLENBQUMsT0FBTyxDQUFDLE1BQU0sQ0FBQyxRQUFRLEVBQUUsQ0FDcEQsQ0FBQztpQkFDSDtnQkFFRCxPQUFPLFNBQVMsQ0FBQztZQUNuQjtnQkFDRSxNQUFNLElBQUksS0FBSyxDQUFDLHNCQUFzQixTQUFTLEVBQUUsQ0FBQyxDQUFDO1NBQ3REO0lBQ0gsQ0FBQztJQUVELHFCQUFxQixDQUNuQixTQUFvQixFQUNwQixLQUFxQixFQUNyQixxQkFBcUMsRUFDckMsYUFBOEI7UUFFOUIsSUFBSSxDQUFDLGFBQWEsRUFBRTtZQUNsQixPQUFPLFNBQVMsQ0FBQztTQUNsQjtRQUVELCtDQUErQztRQUMvQyx1SEFBdUg7UUFDdkgsSUFBSSxTQUFTLEtBQUssU0FBUyxDQUFDLFlBQVksRUFBRTtZQUN4QyxPQUFPLFNBQVMsQ0FBQztTQUNsQjtRQUVELHdFQUF3RTtRQUN4RSx3QkFBd0I7UUFDeEIsMkZBQTJGO1FBQzNGLE1BQU0sbUNBQW1DLEdBQUcsSUFBSSxRQUFRLENBQ3RELGFBQWEsQ0FBQyxRQUFRLEVBQ3RCLHFCQUFxQixDQUFDLFFBQVEsQ0FDL0IsQ0FBQztRQUNGLGtFQUFrRTtRQUNsRSw0SEFBNEg7UUFDNUgsc0dBQXNHO1FBQ3RHLGdIQUFnSDtRQUNoSCx1R0FBdUc7UUFDdkcsT0FBTyxjQUFjLENBQUMsYUFBYSxDQUNqQyxLQUFLLENBQUMsUUFBUSxFQUNkLG1DQUFtQyxDQUFDLFFBQVEsQ0FBQyxLQUFLLENBQUMsQ0FBQyxRQUFRLENBQzdELENBQUM7SUFDSixDQUFDO0lBRUQsZ0NBQWdDLENBQzlCLFNBQW9CLEVBQ3BCLGVBQXNDLEVBQ3RDLFVBQXdCO1FBRXhCLHlGQUF5RjtRQUN6RixxR0FBcUc7UUFDckcsSUFBSSxTQUFTLEtBQUssU0FBUyxDQUFDLFdBQVcsRUFBRTtZQUN2QyxPQUFPLGVBQWUsQ0FBQztTQUN4QjtRQUVELDhFQUE4RTtRQUM5RSwrREFBK0Q7UUFDL0QsSUFBSSxDQUFBLFVBQVUsYUFBVixVQUFVLHVCQUFWLFVBQVUsQ0FBRSxJQUFJLE1BQUssUUFBUSxDQUFDLGdCQUFnQixFQUFFO1lBQ2xELE9BQU8sZUFBZSxDQUFDO1NBQ3hCO1FBRUQsT0FBTyxlQUFlLENBQUMsR0FBRyxDQUFDLENBQUMsY0FBYyxFQUFFLEVBQUU7WUFDNUMsTUFBTSxhQUFhLEdBQUcsSUFBSSxDQUFDLGdCQUFnQixDQUN6QyxjQUFjLENBQUMsS0FBSyxFQUNwQixTQUFTLEVBQ1QsVUFBVSxDQUNYLENBQUM7WUFFRixvRkFBb0Y7WUFDcEYsNkNBQTZDO1lBQzdDLCtIQUErSDtZQUMvSCwrSkFBK0o7WUFDL0osc0lBQXNJO1lBQ3RJLG1HQUFtRztZQUNuRywwR0FBMEc7WUFDMUcsOEdBQThHO1lBQzlHLElBQUksYUFBYSxFQUFFO2dCQUNqQixjQUFjLENBQUMsS0FBSyxHQUFHLGNBQWMsQ0FBQyxLQUFLLENBQUMsUUFBUSxDQUFDLGFBQWEsQ0FBQyxDQUFDO2FBQ3JFO1lBRUQsT0FBTyxjQUFjLENBQUM7UUFDeEIsQ0FBQyxDQUFDLENBQUM7SUFDTCxDQUFDO0lBRUQsUUFBUSxDQUNOLFNBQW9CLEVBQ3BCLEtBQXFCLEVBQ3JCLGtCQUFtQztRQUVuQyxRQUFRLFNBQVMsRUFBRTtZQUNqQixLQUFLLFNBQVMsQ0FBQyxXQUFXO2dCQUN4QixPQUFPLEtBQUssQ0FBQztZQUNmLEtBQUssU0FBUyxDQUFDLFlBQVk7Z0JBQ3pCLE9BQU8sa0JBQWtCLENBQUMsQ0FBQyxDQUFDLEtBQUssQ0FBQyxRQUFRLENBQUMsa0JBQWtCLENBQUMsQ0FBQyxDQUFDLENBQUMsS0FBSyxDQUFDO1lBQ3pFO2dCQUNFLE1BQU0sSUFBSSxLQUFLLENBQUMsc0JBQXNCLFNBQVMsRUFBRSxDQUFDLENBQUM7U0FDdEQ7SUFDSCxDQUFDO0lBRUQsbUJBQW1CLENBQ2pCLFNBQW9CLEVBQ3BCLGdCQUFnQyxFQUNoQyxrQkFBbUM7UUFFbkMsUUFBUSxTQUFTLEVBQUU7WUFDakIsS0FBSyxTQUFTLENBQUMsV0FBVztnQkFDeEIsT0FBTyxnQkFBZ0IsQ0FBQztZQUMxQixLQUFLLFNBQVMsQ0FBQyxZQUFZO2dCQUN6QixPQUFPLGtCQUFrQjtvQkFDdkIsQ0FBQyxDQUFDLGdCQUFnQixDQUFDLFFBQVEsQ0FBQyxrQkFBa0IsQ0FBQztvQkFDL0MsQ0FBQyxDQUFDLGdCQUFnQixDQUFDO1lBQ3ZCO2dCQUNFLE1BQU0sSUFBSSxLQUFLLENBQUMsc0JBQXNCLFNBQVMsRUFBRSxDQUFDLENBQUM7U0FDdEQ7SUFDSCxDQUFDO0lBRUQsNkJBQTZCLENBQzNCLFNBQW9CLEVBQ3BCLGdCQUFnQyxFQUNoQyxhQUE4QjtRQUU5QixJQUFJLENBQUMsYUFBYSxFQUFFO1lBQ2xCLE9BQU8sU0FBUyxDQUFDO1NBQ2xCO1FBRUQsUUFBUSxTQUFTLEVBQUU7WUFDakIsS0FBSyxTQUFTLENBQUMsV0FBVztnQkFDeEIsT0FBTyxnQkFBZ0IsQ0FBQyxRQUFRLENBQUMsYUFBYSxDQUFDLENBQUM7WUFDbEQsS0FBSyxTQUFTLENBQUMsWUFBWTtnQkFDekIsT0FBTyxnQkFBZ0IsQ0FBQztZQUMxQjtnQkFDRSxNQUFNLElBQUksS0FBSyxDQUFDLHNCQUFzQixTQUFTLEVBQUUsQ0FBQyxDQUFDO1NBQ3REO0lBQ0gsQ0FBQztDQUNGIn0=