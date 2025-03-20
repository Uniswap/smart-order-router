import {
  DAI_USDT,
  DAI_USDT_LOW,
  DAI_USDT_V4_LOW,
  USDC_DAI,
  USDC_DAI_LOW,
  USDC_DAI_MEDIUM, USDC_DAI_V4_LOW, USDC_DAI_V4_MEDIUM,
  USDC_WETH,
  USDC_WETH_LOW,
  USDC_WETH_V4_LOW,
  WBTC_WETH,
  WETH9_USDT_LOW,
  WETH9_USDT_V4_LOW,
  WETH_USDT
} from '../../test-util/mock-data';
import {
  computeAllMixedRoutes
} from '../../../src/routers/alpha-router/functions/compute-all-routes';
import { DAI_MAINNET as DAI, USDC_MAINNET as USDC } from '../../../src';
import {
  mixedRouteFilterOutV4Pools
} from '../../../src/util/mixedRouteFilterOutV4Pools';
import { Pool as V4Pool } from '@uniswap/v4-sdk';

describe('mixedRouteFilterOutV4Pools', () => {
  it('filter out v4 pool mixed route', async () => {
    const pools = [
      DAI_USDT,
      USDC_WETH,
      WETH_USDT,
      USDC_DAI,
      WBTC_WETH,
      USDC_DAI_LOW,
      USDC_DAI_MEDIUM,
      USDC_WETH_LOW,
      WETH9_USDT_LOW,
      DAI_USDT_LOW,
      DAI_USDT_V4_LOW,
      WETH9_USDT_V4_LOW,
      USDC_WETH_V4_LOW,
      USDC_DAI_V4_LOW,
      USDC_DAI_V4_MEDIUM,
    ];
    const routes = computeAllMixedRoutes(USDC, DAI, pools, 3);

    expect(routes).toHaveLength(24);
    const filteredRoutes = mixedRouteFilterOutV4Pools(routes);
    expect(filteredRoutes).toHaveLength(6);
    expect(filteredRoutes.every(route => !route.pools.some(pool => pool instanceof V4Pool))).toBeTruthy();
  });
});
