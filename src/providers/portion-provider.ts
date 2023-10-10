import { BigNumber } from '@ethersproject/bignumber';
import { ZERO } from '@uniswap/router-sdk';
import { Fraction, TradeType } from '@uniswap/sdk-core';

import { SwapOptions, SwapOptionsUniversalRouter, SwapType } from '../routers';
import { CurrencyAmount } from '../util';

export interface IPortionProvider {
  getPortionAmount(
    tokenOutAmount: CurrencyAmount,
    tradeType: TradeType,
    swapConfig?: SwapOptions,
  ): CurrencyAmount;

  getPortionQuoteAmount(
    portionAmountToken: CurrencyAmount,
    quoteCurrencyAmount: CurrencyAmount,
    amount: CurrencyAmount
  ): CurrencyAmount;

  getPortionAdjustedQuote(
    tradeType: TradeType,
    amount: CurrencyAmount,
    quote: CurrencyAmount,
    quoteGasAdjusted: CurrencyAmount,
    portionAmount: CurrencyAmount
  ): CurrencyAmount;
}

export class PortionProvider implements IPortionProvider {
  getPortionAmount(
    tokenOutAmount: CurrencyAmount,
    tradeType: TradeType,
    swapConfig?: SwapOptions,
  ): CurrencyAmount {
    const zeroAmount = CurrencyAmount.fromRawAmount(tokenOutAmount.currency, ZERO);

    if (swapConfig?.type !== SwapType.UNIVERSAL_ROUTER) {
      return zeroAmount;
    }

    const swapConfigUniversalRouter =
      swapConfig as SwapOptionsUniversalRouter;
    switch (tradeType) {
      case TradeType.EXACT_INPUT:
        if (swapConfigUniversalRouter.fee && swapConfigUniversalRouter.fee.fee.greaterThan(ZERO)) {
          return tokenOutAmount.multiply(swapConfigUniversalRouter.fee.fee)
        }

        return zeroAmount;
      case TradeType.EXACT_OUTPUT:
        if (swapConfigUniversalRouter.flatFee && swapConfigUniversalRouter.flatFee.amount > BigNumber.from(0)) {
          return CurrencyAmount.fromRawAmount(
            tokenOutAmount.currency, swapConfigUniversalRouter.flatFee.amount.toString()
          );
        }

        return zeroAmount;
      default:
        throw new Error(`Unknown trade type ${tradeType}`);
    }
  }

  getPortionQuoteAmount(
    portionAmountToken: CurrencyAmount,
    quoteCurrencyAmount: CurrencyAmount,
    amount: CurrencyAmount
  ): CurrencyAmount {
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
    //    this amount will be portionQuoteAmountToken = portionAmountToken / portionAdjustedAmount * quoteCurrencyAmount
    //    CAVEAT: we prefer to use the quote currency amount OVER quote gas adjusted currency amount for the formula
    //    because the portion amount calculated from the exact out has no way to account for the gas units.
    return CurrencyAmount.fromRawAmount(
      quoteCurrencyAmount.currency,
      portionToPortionAdjustedAmountRatio.multiply(quoteCurrencyAmount).quotient
    );
  }

  getPortionAdjustedQuote(
    tradeType: TradeType,
    amount: CurrencyAmount,
    quote: CurrencyAmount,
    quoteGasAdjusted: CurrencyAmount,
    portionAmount: CurrencyAmount
  ): CurrencyAmount {
    switch (tradeType) {
      case TradeType.EXACT_INPUT:
        return quoteGasAdjusted.subtract(portionAmount);
      case TradeType.EXACT_OUTPUT:
        return this.getQuoteGasAndPortionAdjustedForExactOut(
          portionAmount,
          quote,
          quoteGasAdjusted,
          amount
        );
      default:
        throw new Error(`Unknown trade type ${tradeType}`);
    }
  }

  /**
   * For exact out, there is no way we know the accurate quote gas and portion adjusted amount,
   * because we are exact out quoting using the user requested amount.
   *
   * This method is a simple approximation that assumes the portion amount is a portion of the user requested amount.
   * Then the portion amount can be adjusted to the quote gas adjusted amount, so that we can get a quote gas and portion adjusted.
   *
   * @param portionAmountToken this is the token out portion amount in decimal-less/unit-less token quantities
   * @param quoteCurrencyAmount this is the token in quote amount in decimal-less/unit-less token quantities
   * @param quoteGasAdjustedCurrencyAmount this is the token in quote adjusted gas amount in decimal-less/unit-less token quantities
   * @param amount this is the token out amount requested by the swapper for exact out swap
   * @private
   */
  private getQuoteGasAndPortionAdjustedForExactOut(
    portionAmountToken: CurrencyAmount,
    quoteCurrencyAmount: CurrencyAmount,
    quoteGasAdjustedCurrencyAmount: CurrencyAmount,
    amount: CurrencyAmount
  ): CurrencyAmount {
    // we have a simple heuristic to estimate the quote gas and portion adjusted for exact out

    const portionQuoteAmountToken = this.getPortionQuoteAmount(portionAmountToken, quoteCurrencyAmount, amount);
    // 4. finally we have the estimated portion quote amount, we can add it to the quote gas adjusted amount,
    //    i.e. quoteGasAdjustedCurrencyAmount = quoteGasAdjustedCurrencyAmount + portionQuoteAmountToken
    return quoteGasAdjustedCurrencyAmount.add(portionQuoteAmountToken);
  }
}
