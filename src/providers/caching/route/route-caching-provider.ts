/**
 * Provider for getting token data from a Token List.
 *
 * @export
 * @interface IRouteCachingProvider
 */
import { Currency, CurrencyAmount, Token, TradeType } from '@uniswap/sdk-core';

import { CachedRoutes } from './model/cached-routes';

export abstract class IRouteCachingProvider {
  abstract getCachedRoute(
    chainId: number,
    amount: CurrencyAmount<Currency>,
    quoteToken: Token,
    tradeType: TradeType,
  ): Promise<CachedRoutes | undefined>

  abstract setCachedRoute(cachedRoutes: CachedRoutes): Promise<boolean>
}
