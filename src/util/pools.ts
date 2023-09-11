import { Currency, Token } from '@uniswap/sdk-core';
import { Pair } from '@uniswap/v2-sdk';
import { V2Route } from '../routers';
import { CachedRoutes } from '../providers';

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

export function getMatchedPoolsFromV2Routes(v2RoutesFromCache: V2Route[], cachedRoutes: CachedRoutes): Pair[] {
  return v2RoutesFromCache.map((route) => route.pairs).reduce((matchedPools, currentPools) => {
    if (currentPools.find((pair) => pair.involvesToken(cachedRoutes.tokenIn)
      && !matchedPools.find((pair) => pair.involvesToken(cachedRoutes.tokenIn)))) {
      // only add current pools that contains the tokenIn to the matched pools
      // as well as ensuring the matched pools don't already have the tokenIn
      // to save memories
      return matchedPools.concat(currentPools)
    } else if (currentPools.find((pair) => pair.involvesToken(cachedRoutes.tokenOut)
      && !matchedPools.find((pair) => pair.involvesToken(cachedRoutes.tokenOut)))) {
      // only add current pools that contains the tokenOut to the matched pools
      // as well as ensuring the matched pools don't already have the tokenOut
      // to save memories
      return matchedPools.concat(currentPools)
    } else {
      return matchedPools
    }
  });
}
