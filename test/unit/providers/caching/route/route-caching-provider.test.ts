import { Protocol } from '@uniswap/router-sdk';
import { Currency, CurrencyAmount, Token, TradeType } from '@uniswap/sdk-core';
import { ChainId, DAI_MAINNET as DAI, USDC_MAINNET as USDC, WBTC_MAINNET as WBTC } from '../../../../../build/main';
import { CachedRoutes, CacheMode, IRouteCachingProvider } from '../../../../../src';
import { getCachedRoutesStub } from './test-util/mocked-dependencies';

class InMemoryRouteCachingProvider extends IRouteCachingProvider {
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
    chainId: number,
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
    _tokenIn: string,
    _tokenOut: string,
    _tradeType: TradeType,
    _amount: CurrencyAmount<Currency>
  ): CacheMode {
    return this.cacheMode;
  }
}

describe('RouteCachingProvider', () => {
  let routeCachingProvider: InMemoryRouteCachingProvider;
  let blockNumber: number = 1;

  beforeEach(() => {
    routeCachingProvider = new InMemoryRouteCachingProvider();
  });

  describe('.setCachedRoute', () => {
    let uncachedRoute: CachedRoutes;

    beforeEach(() => {
      uncachedRoute = getCachedRoutesStub(blockNumber)!;
    });

    it('updates cachedRoutes.blocksToLive before inserting in cache', async () => {
      expect(uncachedRoute.blocksToLive).toEqual(0);

      await routeCachingProvider.setCachedRoute(uncachedRoute, CurrencyAmount.fromRawAmount(USDC, 100));

      expect(uncachedRoute.blocksToLive).not.toEqual(0);
      expect(uncachedRoute.blocksToLive).toEqual(routeCachingProvider.blocksToLive);
    });

    it('inserts cachedRoutes in the cache', async () => {
      const cacheSuccess = await routeCachingProvider.setCachedRoute(
        uncachedRoute,
        CurrencyAmount.fromRawAmount(USDC, 100)
      );

      expect(cacheSuccess).toBeTruthy();
      expect(routeCachingProvider.internalSetCacheRouteCalls).toEqual(1);
    });

    it('returns false when cache insertion fails', async () => {
      routeCachingProvider.forceFail = true;
      const cacheSuccess = await routeCachingProvider.setCachedRoute(
        uncachedRoute,
        CurrencyAmount.fromRawAmount(USDC, 100)
      );

      expect(cacheSuccess).toBeFalsy();
      expect(routeCachingProvider.internalSetCacheRouteCalls).toEqual(1);
    });
  });

  describe('.getCachedRoute', () => {
    describe('with route in cache', () => {
      let cachedRoute: CachedRoutes;

      beforeEach(async () => {
        cachedRoute = getCachedRoutesStub(blockNumber)!;
        await routeCachingProvider.setCachedRoute(cachedRoute, CurrencyAmount.fromRawAmount(USDC, 100));
      });

      it('gets the route in cache when requested', async () => {
        const route = await routeCachingProvider.getCachedRoute(
          cachedRoute.chainId,
          CurrencyAmount.fromRawAmount(USDC, 100),
          DAI,
          TradeType.EXACT_INPUT,
          [Protocol.V2, Protocol.MIXED, Protocol.V3],
          blockNumber
        );

        expect(route).toBeDefined();
        expect(route).toBeInstanceOf(CachedRoutes);
        expect(route).toEqual(cachedRoute);
        expect(routeCachingProvider.internalGetCacheRouteCalls).toEqual(1);
      });

      it('filtersOut expired cache entries', async () => {
        const route = await routeCachingProvider.getCachedRoute(
          cachedRoute.chainId,
          CurrencyAmount.fromRawAmount(USDC, 100),
          DAI,
          TradeType.EXACT_INPUT,
          [Protocol.V2, Protocol.MIXED, Protocol.V3],
          blockNumber + 100
        );

        expect(route).toBeUndefined();
        expect(routeCachingProvider.internalGetCacheRouteCalls).toEqual(1);
      });

      it('does not get the route for a different pair', async () => {
        const route = await routeCachingProvider.getCachedRoute(
          cachedRoute.chainId,
          CurrencyAmount.fromRawAmount(USDC, 100),
          WBTC,
          TradeType.EXACT_INPUT,
          [Protocol.V2, Protocol.MIXED, Protocol.V3],
          blockNumber
        );

        expect(route).toBeUndefined();
        expect(routeCachingProvider.internalGetCacheRouteCalls).toEqual(1);
      });
    });
  });
});