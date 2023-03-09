import { Protocol } from '@uniswap/router-sdk';
import { Currency, CurrencyAmount, Token, TradeType } from '@uniswap/sdk-core';
import { ChainId } from '../../../../../../build/main';
import { CachedRoutes, CacheMode, IRouteCachingProvider } from '../../../../../../src';

export class InMemoryRouteCachingProvider extends IRouteCachingProvider {
  public routesCache: Map<string, CachedRoutes> = new Map();
  public blocksToLive: number = 1;
  public cacheMode: CacheMode = CacheMode.Darkmode;
  public forceFail: boolean = false;
  public internalGetCacheRouteCalls: number = 0;
  public internalSetCacheRouteCalls: number = 0;

  protected _getBlocksToLive(_cachedRoutes: CachedRoutes, _amount: CurrencyAmount<Currency>): number {
    return this.blocksToLive;
  }

  protected _getCachedRoute(
    chainId: ChainId,
    amount: CurrencyAmount<Currency>,
    quoteToken: Token,
    tradeType: TradeType,
    protocols: Protocol[]
  ): Promise<CachedRoutes | undefined> {
    this.internalGetCacheRouteCalls += 1;

    const cacheKey = `${amount.currency.wrapped.symbol}/${quoteToken.symbol}/${chainId}/${tradeType}/${protocols.sort}`;

    return Promise.resolve(this.routesCache.get(cacheKey));
  }

  protected _setCachedRoute(cachedRoutes: CachedRoutes, _amount: CurrencyAmount<Currency>): Promise<boolean> {
    this.internalSetCacheRouteCalls += 1;

    if (this.forceFail) return Promise.resolve(false);

    const cacheKey = `${cachedRoutes.tokenIn.symbol}/${cachedRoutes.tokenOut.symbol}/${cachedRoutes.chainId}/${cachedRoutes.tradeType}/${cachedRoutes.protocolsCovered.sort}`;
    this.routesCache.set(cacheKey, cachedRoutes);

    return Promise.resolve(true);
  }

  getCacheMode(
    _chainId: ChainId,
    _amount: CurrencyAmount<Currency>,
    _quoteToken: Token,
    _tradeType: TradeType,
    _protocols: Protocol[]
  ): CacheMode {
    return this.cacheMode;
  }
}