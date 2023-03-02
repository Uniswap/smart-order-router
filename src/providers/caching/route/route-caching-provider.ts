/**
 * Provider for getting token data from a Token List.
 *
 * @export
 * @interface IRouteCachingProvider
 */
import { Protocol } from '@uniswap/router-sdk';
import { Currency, CurrencyAmount, Token, TradeType } from '@uniswap/sdk-core';

import { CachedRoutes } from './model/cached-routes';

export abstract class IRouteCachingProvider {
  abstract getCachedRoute(
    chainId: number,
    amount: CurrencyAmount<Currency>,
    quoteToken: Token,
    tradeType: TradeType,
    protocols: Protocol[],
    blockNumber: number,
  ): Promise<CachedRoutes | undefined>

  abstract setCachedRoute(cachedRoutes: CachedRoutes): Promise<boolean>
}
