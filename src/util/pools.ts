import { Pair } from '@uniswap/v2-sdk';
import { Token } from '@uniswap/sdk-core';

export function getTokenWithFotTaxFromPools(token: Token, pools?: Pair[]): Token {
  const firstPoolContainingToken = pools?.find((pool) => pool.involvesToken(token));
  let tokenWithFotTax = token;

  if (firstPoolContainingToken) {
    if (firstPoolContainingToken.token0.equals(token)) {
      tokenWithFotTax = firstPoolContainingToken.token0;
    } else if (firstPoolContainingToken.token1.equals(token)) {
      tokenWithFotTax = firstPoolContainingToken.token1;
    }
  }

  return tokenWithFotTax
}
