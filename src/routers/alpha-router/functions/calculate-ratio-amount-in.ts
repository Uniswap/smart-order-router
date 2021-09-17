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

  const zeroForOne = !amountToSwapRaw.lessThan(0)

  return CurrencyAmount.fromRawAmount(
    zeroForOne ? token0Balance.currency : token1Balance.currency,
    zeroForOne ? amountToSwapRaw.quotient : amountToSwapRaw.multiply(-1).multiply(token0Price).quotient
  );
}
