import { Protocol } from '@uniswap/router-sdk';
import { CurrencyAmount, TradeType } from '@uniswap/sdk-core';
import { DAI_MAINNET as DAI, USDC_MAINNET as USDC, WBTC_MAINNET as WBTC } from '../../../../../build/main';
import { CachedRoutes, CacheMode } from '../../../../../src';
import { InMemoryRouteCachingProvider } from './test-util/inmemory-route-caching-provider';
import { getCachedRoutesStub } from './test-util/mocked-dependencies';

describe('RouteCachingProvider', () => {
  let routeCachingProvider: InMemoryRouteCachingProvider;
  let blockNumber: number = 1;

  beforeEach(() => {
    routeCachingProvider = new InMemoryRouteCachingProvider();
  });

  describe('.setCachedRoute', () => {
    describe('with cacheMode == Darkmode', () => {
      let uncachedRoute: CachedRoutes;

      beforeEach(() => {
        uncachedRoute = getCachedRoutesStub(blockNumber)!;
      });

      it('fails to insert cachedRoutes in the cache', async () => {
        const cacheSuccess = await routeCachingProvider.setCachedRoute(
          uncachedRoute,
          CurrencyAmount.fromRawAmount(USDC, 100)
        );

        expect(cacheSuccess).toBeFalsy();
        expect(routeCachingProvider.internalSetCacheRouteCalls).toEqual(0);
        expect(routeCachingProvider.getCacheModeCalls).toEqual(1);
      });

      it('does not update cachedRoutes.blocksToLive before inserting in cache', async () => {
        expect(uncachedRoute.blocksToLive).toEqual(0);

        await routeCachingProvider.setCachedRoute(uncachedRoute, CurrencyAmount.fromRawAmount(USDC, 100));

        expect(uncachedRoute.blocksToLive).toEqual(0);
      });
    });

    [CacheMode.Livemode, CacheMode.Tapcompare].forEach((cacheMode) => {
      describe(`with cacheMode == ${cacheMode}`, () => {
        let uncachedRoute: CachedRoutes;

        beforeEach(() => {
          routeCachingProvider.cacheMode = cacheMode;
          uncachedRoute = getCachedRoutesStub(blockNumber)!;
        });

        it('obtains the cacheMode internally', async () => {
          await routeCachingProvider.setCachedRoute(
            uncachedRoute,
            CurrencyAmount.fromRawAmount(USDC, 100)
          );

          expect(routeCachingProvider.getCacheModeCalls).toEqual(1);
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
    });
  });

  describe('.getCachedRoute', () => {
    describe('with route in cache', () => {
      let cachedRoute: CachedRoutes;

      beforeEach(async () => {
        routeCachingProvider.cacheMode = CacheMode.Livemode; // set to livemode in order to test.
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
