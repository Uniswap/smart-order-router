import { encodeSqrtRatioX96, FeeAmount, Pool } from '@uniswap/v3-sdk';
import { DAI_MAINNET as DAI, USDC_MAINNET as USDC, USDT_MAINNET as USDT, WBTC_MAINNET as WBTC } from '../../../../../src';
import { computeAllRoutes } from '../../../../../src/routers/alpha-router/functions/compute-all-routes';
import {
  DAI_USDT_LOW,
  USDC_DAI_LOW,
  USDC_DAI_MEDIUM,
  USDC_WETH_LOW,
  WETH9_USDT_LOW,
} from '../../../test-util/mock-data';

describe('compute all routes', () => {
  test('succeeds to compute all routes', async () => {
    const pools = [
      USDC_DAI_LOW,
      USDC_DAI_MEDIUM,
      USDC_WETH_LOW,
      WETH9_USDT_LOW,
      DAI_USDT_LOW,
    ];
    const routes = computeAllRoutes(USDC, DAI, pools, 3);

    expect(routes).toHaveLength(3);
  });

  test('succeeds to compute all routes with 1 hop', async () => {
    const pools = [
      USDC_DAI_LOW,
      USDC_DAI_MEDIUM,
      USDC_WETH_LOW,
      WETH9_USDT_LOW,
      DAI_USDT_LOW,
    ];
    const routes = computeAllRoutes(USDC, DAI, pools, 1);

    expect(routes).toHaveLength(2);
  });

  test('succeeds when no routes', async () => {
    const pools = [
      USDC_DAI_LOW,
      USDC_DAI_MEDIUM,
      USDC_WETH_LOW,
      WETH9_USDT_LOW,
      DAI_USDT_LOW,
      new Pool(USDT, WBTC, FeeAmount.LOW, encodeSqrtRatioX96(1, 1), 500, 0),
    ];

    // No way to get from USDC to WBTC in 2 hops
    const routes = computeAllRoutes(USDC, WBTC, pools, 2);

    expect(routes).toHaveLength(0);
  });
});
