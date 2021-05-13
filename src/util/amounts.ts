import { Token, CurrencyAmount } from '@uniswap/sdk-core';
import { parseUnits } from 'ethers/lib/utils';
import JSBI from 'jsbi';

// try to parse a user entered amount for a given token
export function parseAmount(value: string, currency: Token): CurrencyAmount {
  const typedValueParsed = parseUnits(value, currency.decimals).toString();
  return new CurrencyAmount(currency, JSBI.BigInt(typedValueParsed));
}
