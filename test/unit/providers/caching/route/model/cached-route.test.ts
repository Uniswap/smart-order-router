import { Protocol } from '@uniswap/router-sdk';
import { DAI_MAINNET, MixedRoute, USDC_MAINNET, V2Route, V3Route, V4Route } from '../../../../../../build/main';
import { CachedRoute } from '../../../../../../src';
import { USDC_DAI, USDC_DAI_MEDIUM, WETH_DAI, USDC_DAI_V4_LOW, USDC_DAI_V4_MEDIUM } from '../../../../../test-util/mock-data';

describe('CachedRoute', () => {
  it('creates an instance given a route object and percent', () => {
    const v3Route = new V3Route([USDC_DAI_MEDIUM], USDC_MAINNET, DAI_MAINNET);
    const cachedRoute = new CachedRoute({ route: v3Route, percent: 100 });

    expect(cachedRoute).toBeInstanceOf(CachedRoute<V3Route>);
  });

  describe('protocol obtained from route', () => {
    it('is correctly V3 when using V3Route', () => {
      const route = new V3Route([USDC_DAI_MEDIUM], USDC_MAINNET, DAI_MAINNET);
      const cachedRoute = new CachedRoute({ route: route, percent: 100 });

      expect(cachedRoute.protocol).toEqual(Protocol.V3);
    });

    it('is correctly V2 when using V2Route', () => {
      const route = new V2Route([USDC_DAI], USDC_MAINNET, DAI_MAINNET);
      const cachedRoute = new CachedRoute({ route: route, percent: 100 });

      expect(cachedRoute.protocol).toEqual(Protocol.V2);
    });

    it('is correctly MIXED when using MixedRoute', () => {
      const route = new MixedRoute([USDC_DAI_MEDIUM, WETH_DAI], USDC_MAINNET, DAI_MAINNET);
      const cachedRoute = new CachedRoute({ route: route, percent: 100 });

      expect(cachedRoute.protocol).toEqual(Protocol.MIXED);
    });

    it('is correctly V4 when using V4Route', () => {
      const route = new V4Route([USDC_DAI_V4_LOW], USDC_MAINNET, DAI_MAINNET);
      const cachedRoute = new CachedRoute({ route: route, percent: 100 });

      expect(cachedRoute.protocol).toEqual(Protocol.V4);
    });
  });

  describe('#routePath', () => {
    it('is correctly returned when using V3Route', () => {
      const route = new V3Route([USDC_DAI_MEDIUM], USDC_MAINNET, DAI_MAINNET);
      const cachedRoute = new CachedRoute({ route: route, percent: 100 });

      expect(cachedRoute.routePath)
        .toEqual('[V3]0x6B175474E89094C44Da98b954EedeAC495271d0F/0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48/3000');
    });

    it('is correctly returned when using V2Route', () => {
      const route = new V2Route([USDC_DAI], USDC_MAINNET, DAI_MAINNET);
      const cachedRoute = new CachedRoute({ route: route, percent: 100 });

      expect(cachedRoute.routePath)
        .toEqual('[V2]0x6B175474E89094C44Da98b954EedeAC495271d0F/0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48');
    });

    it('is correctly returned when using MixedRoute', () => {
      const route = new MixedRoute([USDC_DAI_MEDIUM, WETH_DAI], USDC_MAINNET, DAI_MAINNET);
      const cachedRoute = new CachedRoute({ route: route, percent: 100 });

      expect(cachedRoute.routePath)
        .toEqual(
          '[V3]0x6B175474E89094C44Da98b954EedeAC495271d0F/0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48/3000->[V2]0x6B175474E89094C44Da98b954EedeAC495271d0F/0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2');
    });

    it('is correctly returned when using V4Route', () => {
      const route = new V4Route([USDC_DAI_V4_LOW], USDC_MAINNET, DAI_MAINNET);
      const cachedRoute = new CachedRoute({ route: route, percent: 100 });

      expect(cachedRoute.routePath)
        .toEqual('[V4]0x6B175474E89094C44Da98b954EedeAC495271d0F/0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48/500/0x0000000000000000000000000000000000000000/10');
    });

    it('is correctly returned when using V4Route with multiple pools', () => {
      const route = new V4Route([USDC_DAI_V4_LOW, USDC_DAI_V4_MEDIUM], USDC_MAINNET, DAI_MAINNET);
      const cachedRoute = new CachedRoute({ route: route, percent: 100 });

      expect(cachedRoute.routePath)
        .toEqual('[V4]0x6B175474E89094C44Da98b954EedeAC495271d0F/0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48/500/0x0000000000000000000000000000000000000000/10->[V4]0x6B175474E89094C44Da98b954EedeAC495271d0F/0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48/3000/0x0000000000000000000000000000000000000000/60');
    });

    it('is correctly returned when using MixedRoute with a V4Pool', () => {
      const route = new MixedRoute([
        USDC_DAI_V4_LOW, // V4
        WETH_DAI         // V2
      ], USDC_MAINNET, DAI_MAINNET);
      const cachedRoute = new CachedRoute({ route: route, percent: 100 });

      expect(cachedRoute.routePath).toEqual(
        '[V4]0x6B175474E89094C44Da98b954EedeAC495271d0F/0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48/500/0x0000000000000000000000000000000000000000/10->' +
        '[V2]0x6B175474E89094C44Da98b954EedeAC495271d0F/0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2'
      );
      expect(cachedRoute.routeId).toEqual(-569080591);
    });
  });

  describe('#routeId', () => {
    it('is correctly returned when using V3Route', () => {
      const route = new V3Route([USDC_DAI_MEDIUM], USDC_MAINNET, DAI_MAINNET);
      const cachedRoute = new CachedRoute({ route: route, percent: 100 });

      expect(cachedRoute.routeId).toEqual(610157808);
    });

    it('is correctly returned when using V2Route', () => {
      const route = new V2Route([USDC_DAI], USDC_MAINNET, DAI_MAINNET);
      const cachedRoute = new CachedRoute({ route: route, percent: 100 });

      expect(cachedRoute.routeId).toEqual(783252763);
    });

    it('is correctly returned when using MixedRoute', () => {
      const route = new MixedRoute([USDC_DAI_MEDIUM, WETH_DAI], USDC_MAINNET, DAI_MAINNET);
      const cachedRoute = new CachedRoute({ route: route, percent: 100 });

      expect(cachedRoute.routeId).toEqual(-882458629);
    });

    it('is correctly returned when using V4Route', () => {
      const route = new V4Route([USDC_DAI_V4_LOW], USDC_MAINNET, DAI_MAINNET);
      const cachedRoute = new CachedRoute({ route: route, percent: 100 });

      expect(cachedRoute.routeId).toEqual(1949573562);
    });

    it('is correctly returned when using V4Route with multiple pools', () => {
      const route = new V4Route([USDC_DAI_V4_LOW, USDC_DAI_V4_MEDIUM], USDC_MAINNET, DAI_MAINNET);
      const cachedRoute = new CachedRoute({ route: route, percent: 100 });

      expect(cachedRoute.routeId).toEqual(1386129036);
    });
  });
});
