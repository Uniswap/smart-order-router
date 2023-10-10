import { BigNumber } from '@ethersproject/bignumber';
import { ZERO } from '@uniswap/router-sdk';
import { Fraction, TradeType } from '@uniswap/sdk-core';

import { SwapOptions, SwapOptionsUniversalRouter, SwapType } from '../routers';
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
  getPortionAmount(
    tokenOutAmount: CurrencyAmount,
    tradeType: TradeType,
    swapConfig?: SwapOptions
  ): CurrencyAmount;

  /**
   * Get the portion quote amount for the given portion amount.
   * Only applicable for exact out. For exact out, will return zero amount.
   *
   * @param tradeType the trade type, exact in or exact out
   * @param portionAmountToken the portion amount for token out. computed against swapper request amount for exact out.
   * @param quote token in amount for exact out.
   * @param amount swapper request amount for exact out.
   */
  getPortionQuoteAmount(
    tradeType: TradeType,
    portionAmountToken: CurrencyAmount,
    quote: CurrencyAmount,
    amount: CurrencyAmount
  ): CurrencyAmount;

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
  getQuote(
    tradeType: TradeType,
    quote: CurrencyAmount,
    portionQuoteAmount: CurrencyAmount
  ): CurrencyAmount;

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
  getQuoteGasAdjusted(
    tradeType: TradeType,
    quoteGasAdjusted: CurrencyAmount,
    portionQuoteAmount: CurrencyAmount
  ): CurrencyAmount;

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
  getQuoteGasAndPortionAdjusted(
    tradeType: TradeType,
    quoteGasAdjusted: CurrencyAmount,
    portionAmount: CurrencyAmount
  ): CurrencyAmount;
}

export class PortionProvider implements IPortionProvider {
  getPortionAmount(
    tokenOutAmount: CurrencyAmount,
    tradeType: TradeType,
    swapConfig?: SwapOptions
  ): CurrencyAmount {
    const zeroAmount = CurrencyAmount.fromRawAmount(
      tokenOutAmount.currency,
      ZERO
    );

    if (swapConfig?.type !== SwapType.UNIVERSAL_ROUTER) {
      return zeroAmount;
    }

    const swapConfigUniversalRouter = swapConfig as SwapOptionsUniversalRouter;
    switch (tradeType) {
      case TradeType.EXACT_INPUT:
        if (
          swapConfigUniversalRouter.fee &&
          swapConfigUniversalRouter.fee.fee.greaterThan(ZERO)
        ) {
          return tokenOutAmount.multiply(swapConfigUniversalRouter.fee.fee);
        }

        return zeroAmount;
      case TradeType.EXACT_OUTPUT:
        if (
          swapConfigUniversalRouter.flatFee &&
          swapConfigUniversalRouter.flatFee.amount > BigNumber.from(0)
        ) {
          return CurrencyAmount.fromRawAmount(
            tokenOutAmount.currency,
            swapConfigUniversalRouter.flatFee.amount.toString()
          );
        }

        return zeroAmount;
      default:
        throw new Error(`Unknown trade type ${tradeType}`);
    }
  }

  getPortionQuoteAmount(
    tradeType: TradeType,
    portionAmountToken: CurrencyAmount,
    quote: CurrencyAmount,
    amount: CurrencyAmount
  ): CurrencyAmount {
    // this method can only be called for exact out
    // for exact in, there is no need to compute the portion quote amount, since portion is always against token out amount
    if (tradeType !== TradeType.EXACT_OUTPUT) {
      return CurrencyAmount.fromRawAmount(quote.currency, ZERO);
    }

    // 1. we know the portion amount for exact out with 100% correctness,
    //    so we can add the portion amount into the exact out amount swapper requested.
    //    i.e. portionAdjustedAmount = amount + portionAmountToken
    const portionAdjustedAmount = amount.add(portionAmountToken);
    // 2. then we know portion amount and portion adjusted exact out amount,
    //    we can get a ratio
    //    i.e. portionToPortionAdjustedAmountRatio = portionAmountToken / portionAdjustedAmount
    const portionToPortionAdjustedAmountRatio = new Fraction(
      portionAmountToken.quotient,
      portionAdjustedAmount.quotient
    );
    // 3. we have the portionAmountToken / portionAdjustedAmount ratio
    //    then we can estimate the portion amount for quote, i.e. what is the estimated token in amount deducted for the portion
    //    this amount will be portionQuoteAmountToken = portionAmountToken / portionAdjustedAmount * quote
    //    CAVEAT: we prefer to use the quote currency amount OVER quote gas adjusted currency amount for the formula
    //    because the portion amount calculated from the exact out has no way to account for the gas units.
    return CurrencyAmount.fromRawAmount(
      quote.currency,
      portionToPortionAdjustedAmountRatio.multiply(quote).quotient
    );
  }

  getQuote(
    tradeType: TradeType,
    quote: CurrencyAmount,
    portionQuoteAmount: CurrencyAmount
  ): CurrencyAmount {
    switch (tradeType) {
      case TradeType.EXACT_INPUT:
        return quote;
      case TradeType.EXACT_OUTPUT:
        return quote.subtract(portionQuoteAmount);
      default:
        throw new Error(`Unknown trade type ${tradeType}`);
    }
  }

  getQuoteGasAdjusted(
    tradeType: TradeType,
    quoteGasAdjusted: CurrencyAmount,
    portionQuoteAmount: CurrencyAmount
  ): CurrencyAmount {
    switch (tradeType) {
      case TradeType.EXACT_INPUT:
        return quoteGasAdjusted;
      case TradeType.EXACT_OUTPUT:
        return quoteGasAdjusted.subtract(portionQuoteAmount);
      default:
        throw new Error(`Unknown trade type ${tradeType}`);
    }
  }

  getQuoteGasAndPortionAdjusted(
    tradeType: TradeType,
    quoteGasAdjusted: CurrencyAmount,
    portionAmount: CurrencyAmount
  ): CurrencyAmount {
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
