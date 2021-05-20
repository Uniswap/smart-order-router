import { Token, CurrencyAmount as CurrencyAmountRaw } from '@uniswap/sdk-core';
import { FeeAmount } from '@uniswap/v3-sdk';
import { parseUnits } from 'ethers/lib/utils';
import JSBI from 'jsbi';

export class CurrencyAmount extends CurrencyAmountRaw<Token> {};

// Try to parse a user entered amount for a given token
export function parseAmount(value: string, currency: Token): CurrencyAmount {
  const typedValueParsed = parseUnits(value, currency.decimals).toString();
  return CurrencyAmount.fromRawAmount(currency, JSBI.BigInt(typedValueParsed));
}

export function parseFeeAmount(feeAmountStr: string) {
  switch (feeAmountStr) {
    case '10000':
      return FeeAmount.HIGH;
    case '3000':
      return FeeAmount.MEDIUM;
    case '500':
      return FeeAmount.LOW;
    default:
      throw new Error(`Fee amount ${feeAmountStr} not supported.`);
  }
}
