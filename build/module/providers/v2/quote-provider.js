import { BigNumber } from '@ethersproject/bignumber';
import { TradeType } from '@uniswap/sdk-core';
import { InsufficientInputAmountError, InsufficientReservesError, } from '@uniswap/v2-sdk';
import { log } from '../../util/log';
import { routeToString } from '../../util/routes';
/**
 * Computes quotes for V2 off-chain. Quotes are computed using the balances
 * of the pools within each route provided.
 *
 * @export
 * @class V2QuoteProvider
 */
export class V2QuoteProvider {
    /* eslint-disable @typescript-eslint/no-empty-function */
    constructor() { }
    /* eslint-enable @typescript-eslint/no-empty-function */
    async getQuotesManyExactIn(amountIns, routes, providerConfig) {
        return this.getQuotes(amountIns, routes, TradeType.EXACT_INPUT, providerConfig);
    }
    async getQuotesManyExactOut(amountOuts, routes, providerConfig) {
        return this.getQuotes(amountOuts, routes, TradeType.EXACT_OUTPUT, providerConfig);
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
                    if (tradeType == TradeType.EXACT_INPUT) {
                        let outputAmount = amount.wrapped;
                        for (const pair of route.pairs) {
                            [outputAmount] = pair.getOutputAmount(outputAmount, providerConfig.enableFeeOnTransferFeeFetching === true);
                        }
                        amountQuotes.push({
                            amount,
                            quote: BigNumber.from(outputAmount.quotient.toString()),
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
                            quote: BigNumber.from(inputAmount.quotient.toString()),
                        });
                    }
                }
                catch (err) {
                    // Can fail to get quotes, e.g. throws InsufficientReservesError or InsufficientInputAmountError.
                    if (err instanceof InsufficientInputAmountError) {
                        insufficientInputAmountErrorCount =
                            insufficientInputAmountErrorCount + 1;
                        amountQuotes.push({ amount, quote: null });
                    }
                    else if (err instanceof InsufficientReservesError) {
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
                    routeToString(route),
                ]} Input: ${insufficientInputAmountErrorCount} Reserves: ${insufficientReservesErrorCount} }`);
            }
            routesWithQuotes.push([route, amountQuotes]);
        }
        if (debugStrs.length > 0) {
            log.info({ debugStrs }, `Failed quotes for V2 routes`);
        }
        return {
            routesWithQuotes,
        };
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicXVvdGUtcHJvdmlkZXIuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi8uLi8uLi8uLi9zcmMvcHJvdmlkZXJzL3YyL3F1b3RlLXByb3ZpZGVyLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBLE9BQU8sRUFBRSxTQUFTLEVBQUUsTUFBTSwwQkFBMEIsQ0FBQztBQUNyRCxPQUFPLEVBQUUsU0FBUyxFQUFFLE1BQU0sbUJBQW1CLENBQUM7QUFDOUMsT0FBTyxFQUNMLDRCQUE0QixFQUM1Qix5QkFBeUIsR0FDMUIsTUFBTSxpQkFBaUIsQ0FBQztBQUl6QixPQUFPLEVBQUUsR0FBRyxFQUFFLE1BQU0sZ0JBQWdCLENBQUM7QUFDckMsT0FBTyxFQUFFLGFBQWEsRUFBRSxNQUFNLG1CQUFtQixDQUFDO0FBeUJsRDs7Ozs7O0dBTUc7QUFDSCxNQUFNLE9BQU8sZUFBZTtJQUMxQix5REFBeUQ7SUFDekQsZ0JBQWUsQ0FBQztJQUVoQix3REFBd0Q7SUFFakQsS0FBSyxDQUFDLG9CQUFvQixDQUMvQixTQUEyQixFQUMzQixNQUFpQixFQUNqQixjQUE4QjtRQUU5QixPQUFPLElBQUksQ0FBQyxTQUFTLENBQ25CLFNBQVMsRUFDVCxNQUFNLEVBQ04sU0FBUyxDQUFDLFdBQVcsRUFDckIsY0FBYyxDQUNmLENBQUM7SUFDSixDQUFDO0lBRU0sS0FBSyxDQUFDLHFCQUFxQixDQUNoQyxVQUE0QixFQUM1QixNQUFpQixFQUNqQixjQUE4QjtRQUU5QixPQUFPLElBQUksQ0FBQyxTQUFTLENBQ25CLFVBQVUsRUFDVixNQUFNLEVBQ04sU0FBUyxDQUFDLFlBQVksRUFDdEIsY0FBYyxDQUNmLENBQUM7SUFDSixDQUFDO0lBRU8sS0FBSyxDQUFDLFNBQVMsQ0FDckIsT0FBeUIsRUFDekIsTUFBaUIsRUFDakIsU0FBb0IsRUFDcEIsY0FBOEI7UUFFOUIsTUFBTSxnQkFBZ0IsR0FBd0IsRUFBRSxDQUFDO1FBRWpELE1BQU0sU0FBUyxHQUFhLEVBQUUsQ0FBQztRQUMv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