import { BigNumber } from '@ethersproject/bignumber';
import { V2Route } from '../../routers/router';
import { CurrencyAmount } from '../../util/amounts';
import { ProviderConfig } from '../provider';
export type V2AmountQuote = {
    amount: CurrencyAmount;
    quote: BigNumber | null;
};
export type V2RouteWithQuotes = [V2Route, V2AmountQuote[]];
export interface IV2QuoteProvider {
    getQuotesManyExactIn(amountIns: CurrencyAmount[], routes: V2Route[], providerConfig: ProviderConfig): Promise<{
        routesWithQuotes: V2RouteWithQuotes[];
    }>;
    getQuotesManyExactOut(amountOuts: CurrencyAmount[], routes: V2Route[], providerConfig: ProviderConfig): Promise<{
        routesWithQuotes: V2RouteWithQuotes[];
    }>;
}
/**
 * Computes quotes for V2 off-chain. Quotes are computed using the balances
 * of the pools within each route provided.
 *
 * @export
 * @class V2QuoteProvider
 */
export declare class V2QuoteProvider implements IV2QuoteProvider {
    constructor();
    getQuotesManyExactIn(amountIns: CurrencyAmount[], routes: V2Route[], providerConfig: ProviderConfig): Promise<{
        routesWithQuotes: V2RouteWithQuotes[];
    }>;
    getQuotesManyExactOut(amountOuts: CurrencyAmount[], routes: V2Route[], providerConfig: ProviderConfig): Promise<{
        routesWithQuotes: V2RouteWithQuotes[];
    }>;
    private getQuotes;
}
