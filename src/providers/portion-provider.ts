import { BigNumber } from '@ethersproject/bignumber';
import { ZERO } from '@uniswap/router-sdk';
import { Fraction, TradeType } from '@uniswap/sdk-core';

import { SwapOptions, SwapOptionsUniversalRouter, SwapType } from '../routers';
import { CurrencyAmount } from '../util';

export interface IPortionProvider {
  getPortionAmount(
    tokenOutAmount: CurrencyAmount,
    tradeType: TradeType,
    swapConfig?: SwapOptions
  ): CurrencyAmount;

  getPortionQuoteAmount(
    tradeType: TradeType,
    portionAmountToken: CurrencyAmount,
    quote: CurrencyAmount,
    amount: CurrencyAmount
  ): CurrencyAmount;

  getQuote(
    tradeType: TradeType,
    quote: CurrencyAmount,
    portionQuoteAmount: CurrencyAmount
  ): CurrencyAmount;

  getQuoteGasAdjusted(
    tradeType: TradeType,
    quoteGasAdjusted: CurrencyAmount,
    portionQuoteAmount: CurrencyAmount
  ): CurrencyAmount;

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
      return  CurrencyAmount.fromRawAmount(
        quote.currency,
        ZERO
      );
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
