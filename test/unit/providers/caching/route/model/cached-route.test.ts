import { Protocol } from '@uniswap/router-sdk';
import { DAI_MAINNET, MixedRoute, USDC_MAINNET, V2Route, V3Route } from '../../../../../../build/main';
import { CachedRoute } from '../../../../../../src';
import { USDC_DAI, USDC_DAI_MEDIUM } from '../../../../../test-util/mock-data';

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
      const route = new MixedRoute([USDC_DAI_MEDIUM], USDC_MAINNET, DAI_MAINNET);
      const cachedRoute = new CachedRoute({ route: route, percent: 100 });

      expect(cachedRoute.protocol).toEqual(Protocol.MIXED);
    });
  });
});
