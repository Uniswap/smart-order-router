import { Fraction } from '@uniswap/sdk-core';
import { CurrencyAmount } from '../../../util/amounts';

export function calculateRatioAmountIn(
	optimalRatio: Fraction,
	price: Fraction,
	currencyInBalance: CurrencyAmount,
	currencyOutBalance: CurrencyAmount,
): CurrencyAmount {
	// formula: amountToSwap = (tokenInBalance - (optimalRatio * tokenOutBalance)) / ((optimalRatio * price) + 1))
	const amountToSwapRaw = new Fraction(currencyInBalance.quotient)
			.subtract(optimalRatio.multiply(currencyOutBalance.quotient))
			.divide(optimalRatio.multiply(price).add(1))

	return CurrencyAmount.fromRawAmount(currencyInBalance.currency, amountToSwapRaw.quotient)
}
