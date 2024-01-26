"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.V2QuoteProvider = void 0;
const bignumber_1 = require("@ethersproject/bignumber");
const sdk_core_1 = require("@uniswap/sdk-core");
const v2_sdk_1 = require("@uniswap/v2-sdk");
const log_1 = require("../../util/log");
const routes_1 = require("../../util/routes");
/**
 * Computes quotes for V2 off-chain. Quotes are computed using the balances
 * of the pools within each route provided.
 *
 * @export
 * @class V2QuoteProvider
 */
class V2QuoteProvider {
    /* eslint-disable @typescript-eslint/no-empty-function */
    constructor() { }
    /* eslint-enable @typescript-eslint/no-empty-function */
    async getQuotesManyExactIn(amountIns, routes, providerConfig) {
        return this.getQuotes(amountIns, routes, sdk_core_1.TradeType.EXACT_INPUT, providerConfig);
    }
    async getQuotesManyExactOut(amountOuts, routes, providerConfig) {
        return this.getQuotes(amountOuts, routes, sdk_core_1.TradeType.EXACT_OUTPUT, providerConfig);
    }
    async getQuotes(amounts, routes, tradeType, providerConfig) {
        const routesWithQuotes = [];
        const debugStrs = [];
        for (const route of routes) {
            const amountQuotes = [];
            let insufficientInputAmountErrorCount = 0;
            let insufficientReservesErrorCount = 0;
            for (const amount of amounts) {
                try {
                    if (tradeType == sdk_core_1.TradeType.EXACT_INPUT) {
                        let outputAmount = amount.wrapped;
                        for (const pair of route.pairs) {
                            [outputAmount] = pair.getOutputAmount(outputAmount, providerConfig.enableFeeOnTransferFeeFetching === true);
                        }
                        amountQuotes.push({
                            amount,
                            quote: bignumber_1.BigNumber.from(outputAmount.quotient.toString()),
                        });
                    }
                    else {
                        let inputAmount = amount.wrapped;
                        for (let i = route.pairs.length - 1; i >= 0; i--) {
                            const pair = route.pairs[i];
                            [inputAmount] = pair.getInputAmount(inputAmount, providerConfig.enableFeeOnTransferFeeFetching === true);
                        }
                        amountQuotes.push({
                            amount,
                            quote: bignumber_1.BigNumber.from(inputAmount.quotient.toString()),
                        });
                    }
                }
                catch (err) {
                    // Can fail to get quotes, e.g. throws InsufficientReservesError or InsufficientInputAmountError.
                    if (err instanceof v2_sdk_1.InsufficientInputAmountError) {
                        insufficientInputAmountErrorCount =
                            insufficientInputAmountErrorCount + 1;
                        amountQuotes.push({ amount, quote: null });
                    }
                    else if (err instanceof v2_sdk_1.InsufficientReservesError) {
                        insufficientReservesErrorCount = insufficientReservesErrorCount + 1;
                        amountQuotes.push({ amount, quote: null });
                    }
                    else {
                        throw err;
                    }
                }
            }
            if (insufficientInputAmountErrorCount > 0 ||
                insufficientReservesErrorCount > 0) {
                debugStrs.push(`${[
                    (0, routes_1.routeToString)(route),
                ]} Input: ${insufficientInputAmountErrorCount} Reserves: ${insufficientReservesErrorCount} }`);
            }
            routesWithQuotes.push([route, amountQuotes]);
        }
        if (debugStrs.length > 0) {
            log_1.log.info({ debugStrs }, `Failed quotes for V2 routes`);
        }
        return {
            routesWithQuotes,
        };
    }
}
exports.V2QuoteProvider = V2QuoteProvider;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicXVvdGUtcHJvdmlkZXIuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi8uLi8uLi8uLi9zcmMvcHJvdmlkZXJzL3YyL3F1b3RlLXByb3ZpZGVyLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7OztBQUFBLHdEQUFxRDtBQUNyRCxnREFBOEM7QUFDOUMsNENBR3lCO0FBSXpCLHdDQUFxQztBQUNyQyw4Q0FBa0Q7QUF5QmxEOzs7Ozs7R0FNRztBQUNILE1BQWEsZUFBZTtJQUMxQix5REFBeUQ7SUFDekQsZ0JBQWUsQ0FBQztJQUVoQix3REFBd0Q7SUFFakQsS0FBSyxDQUFDLG9CQUFvQixDQUMvQixTQUEyQixFQUMzQixNQUFpQixFQUNqQixjQUE4QjtRQUU5QixPQUFPLElBQUksQ0FBQyxTQUFTLENBQ25CLFNBQVMsRUFDVCxNQUFNLEVBQ04sb0JBQVMsQ0FBQyxXQUFXLEVBQ3JCLGNBQWMsQ0FDZixDQUFDO0lBQ0osQ0FBQztJQUVNLEtBQUssQ0FBQyxxQkFBcUIsQ0FDaEMsVUFBNEIsRUFDNUIsTUFBaUIsRUFDakIsY0FBOEI7UUFFOUIsT0FBTyxJQUFJLENBQUMsU0FBUyxDQUNuQixVQUFVLEVBQ1YsTUFBTSxFQUNOLG9CQUFTLENBQUMsWUFBWSxFQUN0QixjQUFjLENBQ2YsQ0FBQztJQUNKLENBQUM7SUFFTyxLQUFLLENBQUMsU0FBUyxDQUNyQixPQUF5QixFQUN6QixNQUFpQixFQUNqQixTQUFvQixFQUNwQixjQUE4QjtRQUU5QixNQUFNLGdCQUFnQixHQUF3QixFQUFFLENBQUM7UUFFakQsTUFBTSxTQUFTLEdBQWEsRUFBRSxDQUFDO1FBQy9CLEtBQUssTUFBTSxLQUFLLElBQUksTUFBTSxFQUFFO1lBQzFCLE1BQU0sWUFBWSxHQUFvQixFQUFFLENBQUM7WUFFekMsSUFBSSxpQ0FBaUMsR0FBRyxDQUFDLENBQUM7WUFDMUMsSUFBSSw4QkFBOEIsR0FBRyxDQUFDLENBQUM7WUFDdkMsS0FBSyxNQUFNLE1BQU0sSUFBSSxPQUFPLEVBQUU7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