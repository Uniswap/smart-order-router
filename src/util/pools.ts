import { Currency, Token } from '@uniswap/sdk-core';
import { Pair } from '@uniswap/v2-sdk';

export function getTokenWithFotTaxFromPools(token: Token, pools?: Pair[]): Token | undefined {
  const firstPoolContainingToken = pools?.find((pool) => pool.involvesToken(token));
  let tokenWithFotTax: Token | undefined = undefined;

  if (firstPoolContainingToken) {
    if (firstPoolContainingToken.token0.equals(token)) {
      tokenWithFotTax = firstPoolContainingToken.token0;
    } else if (firstPoolContainingToken.token1.equals(token)) {
      tokenWithFotTax = firstPoolContainingToken.token1;
    }
  }

  return tokenWithFotTax;
}

export function getCurrencyWithFotTaxFromPools(currency: Currency, pools?: Pair[]): Currency | undefined {
  // ok to wrap currency as Token class type, since NativeCurrency is never going to be FOT
  return getTokenWithFotTaxFromPools(currency.wrapped, pools);
}
