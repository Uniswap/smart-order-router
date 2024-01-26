import { TradeType } from '@uniswap/sdk-core';
import { RouteWithValidQuote, SwapOptions } from '../routers';
import { CurrencyAmount } from '../util';
export interface IPortionProvider {
    /**
     * Get the portion amount for the given token out amount.
     * portion amount is always calculated against the token out amount.
     *
     * @param tokenOutAmount the token out amount, either the quote for exact in, or the swapper requested amount for exact out
     * @param tradeType the trade type, exact in or exact out
     * @param swapConfig swap config, containing the portion related data
     */
    getPortionAmount(tokenOutAmount: CurrencyAmount, tradeType: TradeType, swapConfig?: SwapOptions): CurrencyAmount | undefined;
    /**
     * Get the portion quote amount for the given portion amount.
     * Only applicable for exact out. For exact out, will return zero amount.
     *
     * @param tradeType the trade type, exact in or exact out
     * @param quote token in amount for exact out.
     * @param amount swapper request amount for exact out.
     * @param portionAmount the portion amount
     */
    getPortionQuoteAmount(tradeType: TradeType, quote: CurrencyAmount, amount: CurrencyAmount, portionAmount?: CurrencyAmount): CurrencyAmount | undefined;
    /**
     * In-place update the route quote amount with the portion amount deducted.
     * This method is only applicable for exact in.
     * For exact out, the portion amount gets added into the swapper requested amount at the beginning of
     * `AlphaRouter.route(...)` method.
     *
     * For exact in, the portion amount gets subtracted from the quote amount at the end of
     * get best swap route.
     *
     * @param tradeType the trade type, exact in or exact out
     * @param routeWithQuotes the route with quotes
     * @param swapConfig swap config, containing the portion related data
     */
    getRouteWithQuotePortionAdjusted(tradeType: TradeType, routeWithQuotes: RouteWithValidQuote[], swapConfig?: SwapOptions): RouteWithValidQuote[];
    /**
     * Get the quote gas adjusted amount for exact in and exact out.
     * For exact in, quote amount is the same as the best swap quote.
     * For exact out, quote amount is the best swap quote minus the portion quote token amount.
     * The reason is SOR adds the portion amount into the exact out swapper requested amount.
     * SOR needs to estimate the equivalent portion quote token amount, and have quote amount subtract portion quote token amount.
     *
     * @param tradeType the trade type, exact in or exact out
     * @param quote the best swap quote
     * @param portionQuoteAmount the portion quote token amount
     */
    getQuote(tradeType: TradeType, quote: CurrencyAmount, portionQuoteAmount?: CurrencyAmount): CurrencyAmount;
    /**
     * Get the quote gas adjusted amount for exact in and exact out.
     * For exact in, quote gas adjusted amount is the same as the best swap quote gas adjusted amount.
     * For exact out, quote gas adjusted amount is the best swap quote gas adjusted amount minus the portion quote token amount.
     * The reason is SOR adds the portion amount into the exact out swapper requested amount.
     * SOR needs to estimate the equivalent portion quote token amount, and have quote gas adjusted amount subtract portion quote token amount.
     *
     * @param tradeType the trade type, exact in or exact out
     * @param quoteGasAdjusted the best swap quote gas adjusted amount
     * @param portionQuoteAmount the portion quote token amount
     */
    getQuoteGasAdjusted(tradeType: TradeType, quoteGasAdjusted: CurrencyAmount, portionQuoteAmount?: CurrencyAmount): CurrencyAmount;
    /**
     * Get the quote gas and portion adjusted amount for exact in and exact out.
     * For exact in, quote gas and portion adjusted amount is the best swap quote gas adjusted amount minus the portion amount.
     * The reason is because quote gas and portion adjusted amount for exact in does not know anything about portion.
     * For exact out, quote gas and portion adjusted amount is the best swap quote gas adjusted amount.
     * The reason is because quote gas and portion adjusted amount for exact out has already added the portion quote token amount.
     *
     * @param tradeType
     * @param quoteGasAdjusted
     * @param portionAmount
     */
    getQuoteGasAndPortionAdjusted(tradeType: TradeType, quoteGasAdjusted: CurrencyAmount, portionAmount?: CurrencyAmount): CurrencyAmount | undefined;
}
export declare class PortionProvider implements IPortionProvider {
    getPortionAmount(tokenOutAmount: CurrencyAmount, tradeType: TradeType, swapConfig?: SwapOptions): CurrencyAmount | undefined;
    getPortionQuoteAmount(tradeType: TradeType, quote: CurrencyAmount, portionAdjustedAmount: CurrencyAmount, portionAmount?: CurrencyAmount): CurrencyAmount | undefined;
    getRouteWithQuotePortionAdjusted(tradeType: TradeType, routeWithQuotes: RouteWithValidQuote[], swapConfig?: SwapOptions): RouteWithValidQuote[];
    getQuote(tradeType: TradeType, quote: CurrencyAmount, portionQuoteAmount?: CurrencyAmount): CurrencyAmount;
    getQuoteGasAdjusted(tradeType: TradeType, quoteGasAdjusted: CurrencyAmount, portionQuoteAmount?: CurrencyAmount): CurrencyAmount;
    getQuoteGasAndPortionAdjusted(tradeType: TradeType, quoteGasAdjusted: CurrencyAmount, portionAmount?: CurrencyAmount): CurrencyAmount | undefined;
}
