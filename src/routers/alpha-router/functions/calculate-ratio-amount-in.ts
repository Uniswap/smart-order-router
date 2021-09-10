import { Fraction } from '@uniswap/sdk-core';
import { CurrencyAmount } from '../../../util/amounts';

export function calculateRatioAmountIn(
  optimalRatio: Fraction,
  token0Price: Fraction,
  token0Balance: CurrencyAmount,
  token1Balance: CurrencyAmount
): CurrencyAmount {
  // formula: amountToSwap = (token0Balance - (optimalRatio * token1Balance)) / ((optimalRatio * token0Price) + 1))
  const amountToSwapRaw = new Fraction(token0Balance.quotient)
    .subtract(optimalRatio.multiply(token1Balance.quotient))
    .divide(optimalRatio.multiply(token0Price).add(1));

  return CurrencyAmount.fromRawAmount(
    token0Balance.currency,
    amountToSwapRaw.quotient
  );
}
