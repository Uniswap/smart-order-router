import { Protocol } from '@uniswap/router-sdk';
import { ChainId, Currency, CurrencyAmount, Token, TradeType } from '@uniswap/sdk-core';
import { CachedRoutes, CacheMode, IRouteCachingProvider } from '../../../../../../src';

export class InMemoryRouteCachingProvider extends IRouteCachingProvider {
  public routesCache: Map<string, CachedRoutes> = new Map();
  public blocksToLive: number = 1;
  public cacheMode: CacheMode = CacheMode.Darkmode;
  public forceFail: boolean = false;
  public internalGetCacheRouteCalls: number = 0;
  public internalSetCacheRouteCalls: number = 0;
  public getCacheModeCalls: number = 0;

  protected async _getBlocksToLive(_cachedRoutes: CachedRoutes, _amount: CurrencyAmount<Currency>): Promise<number> {
    return this.blocksToLive;
  }

  protected async _getCachedRoute(
    chainId: ChainId,
    amount: CurrencyAmount<Currency>,
    quoteToken: Token,
    tradeType: TradeType,
    protocols: Protocol[]
  ): Promise<CachedRoutes | undefined> {
    this.internalGetCacheRouteCalls += 1;

    const cacheKey = `${amount.currency.wrapped.symbol}/${quoteToken.symbol}/${chainId}/${tradeType}/${protocols.sort()}`;

    return this.routesCache.get(cacheKey);
  }

  protected async _setCachedRoute(cachedRoutes: CachedRoutes, _amount: CurrencyAmount<Currency>): Promise<boolean> {
    this.internalSetCacheRouteCalls += 1;

    if (this.forceFail) return false;

    const cacheKey = `${cachedRoutes.tokenIn.symbol}/${cachedRoutes.tokenOut.symbol}/${cachedRoutes.chainId}/${cachedRoutes.tradeType}/${cachedRoutes.protocolsCovered.sort()}`;
    this.routesCache.set(cacheKey, cachedRoutes);

    return true;
  }

  async getCacheMode(
    _chainId: ChainId,
    _amount: CurrencyAmount<Currency>,
    _quoteToken: Token,
    _tradeType: TradeType,
    _protocols: Protocol[]
  ): Promise<CacheMode> {
    this.getCacheModeCalls += 1;
    return this.cacheMode;
  }
}
