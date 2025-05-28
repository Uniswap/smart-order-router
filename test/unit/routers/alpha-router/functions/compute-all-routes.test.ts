import { Pair } from '@uniswap/v2-sdk';
import { encodeSqrtRatioX96, FeeAmount, Pool as V3Pool } from '@uniswap/v3-sdk';
import { Pool as V4Pool } from '@uniswap/v4-sdk';
import {
  CurrencyAmount,
  DAI_MAINNET as DAI,
  nativeOnChain,
  USDC_MAINNET as USDC,
  USDT_MAINNET as USDT,
  V4_ETH_WETH_FAKE_POOL,
  WBTC_MAINNET as WBTC,
  WRAPPED_NATIVE_CURRENCY
} from '../../../../../src';
import {
  computeAllMixedRoutes,
  computeAllV2Routes,
  computeAllV3Routes,
  computeAllV4Routes
} from '../../../../../src/routers/alpha-router/functions/compute-all-routes';
import {
  DAI_ETH_V4_MEDIUM,
  DAI_USDT,
  DAI_USDT_LOW,
  DAI_USDT_V4_LOW,
  ETH_USDT_V4_LOW,
  UNI_ETH_V4_MEDIUM,
  UNI_WETH_MEDIUM,
  USDC_DAI,
  USDC_DAI_LOW,
  USDC_DAI_MEDIUM,
  USDC_DAI_V4_LOW,
  USDC_DAI_V4_MEDIUM,
  USDC_ETH_V4_LOW,
  USDC_USDT,
  USDC_WETH,
  USDC_WETH_LOW,
  USDC_WETH_V4_LOW,
  WBTC_WETH,
  WETH9_USDT_LOW,
  WETH9_USDT_V4_LOW,
  WETH_USDT
} from '../../../../test-util/mock-data';
import { ADDRESS_ZERO } from '@uniswap/router-sdk';
import { ChainId, WETH9 } from '@uniswap/sdk-core';
import { HooksOptions } from '../../../../../src/util/hooksOptions';

describe('compute all v4 routes', () => {
  test('succeeds to compute all routes', async () => {
    const pools = [
      USDC_DAI_V4_LOW,
      USDC_DAI_V4_MEDIUM,
      USDC_WETH_V4_LOW,
      WETH9_USDT_V4_LOW,
      DAI_USDT_V4_LOW,
    ];
    const routes = computeAllV4Routes(USDC, DAI, pools, 3);

    expect(routes).toHaveLength(3);
  })

  test('succeeds to compute all routes with 1 hop', async () => {
    const pools = [
      USDC_DAI_V4_LOW,
      USDC_DAI_V4_MEDIUM,
      USDC_WETH_V4_LOW,
      WETH9_USDT_V4_LOW,
      DAI_USDT_V4_LOW,
    ];
    const routes = computeAllV4Routes(USDC, DAI, pools, 1);

    expect(routes).toHaveLength(2);
  });

  test('succeeds to compute all routes with 4 hops, ignoring arbitrage opportunities', async () => {
    const pools = [
      USDC_DAI_V4_LOW,
      USDC_DAI_V4_MEDIUM,
      USDC_WETH_V4_LOW,
      WETH9_USDT_V4_LOW,
      DAI_USDT_V4_LOW,
    ];
    const routes = computeAllV4Routes(USDC, WRAPPED_NATIVE_CURRENCY[1]!, pools, 4);

    routes.forEach((route) => {
      expect(route.pools).not.toEqual([USDC_DAI_V4_MEDIUM, USDC_DAI_V4_LOW, USDC_WETH_V4_LOW]);
    });
    expect(routes).toHaveLength(3);
  });

  test('succeeds when no routes', async () => {
    const pools = [
      USDC_DAI_V4_LOW,
      USDC_DAI_V4_MEDIUM,
      USDC_WETH_V4_LOW,
      WETH9_USDT_V4_LOW,
      DAI_USDT_V4_LOW,
      new V4Pool(USDT, WBTC, FeeAmount.LOW, 10, ADDRESS_ZERO, encodeSqrtRatioX96(1, 1), 500, 0),
    ];

    // No way to get from USDC to WBTC in 2 hops
    const routes = computeAllV4Routes(USDC, WBTC, pools, 2);

    expect(routes).toHaveLength(0);
  });

  test('succeeds to compute native currency routes', async () => {
    const pools = [
      USDC_ETH_V4_LOW,
      ETH_USDT_V4_LOW,
      DAI_ETH_V4_MEDIUM,
      UNI_ETH_V4_MEDIUM
    ];
    const routes = computeAllV4Routes(USDC, USDT, pools, 3);

    expect(routes).toHaveLength(1);
  })

  test('succeeds to compute hook inclusive routes', async () => {
    const pools = [
      USDC_DAI_V4_LOW,
      USDC_DAI_V4_MEDIUM,
      USDC_WETH_V4_LOW,
      WETH9_USDT_V4_LOW,
      DAI_USDT_V4_LOW,
      new V4Pool(USDT, WBTC, FeeAmount.LOW, 10, '0x00001f3b9712708127b1fcad61cb892535951888', encodeSqrtRatioX96(1, 1), 500, 0),
      new V4Pool(USDT, WBTC, FeeAmount.LOW, 10, ADDRESS_ZERO, encodeSqrtRatioX96(1, 1), 500, 0),
    ];
    const routes = computeAllV4Routes(USDC, WBTC, pools, 3, HooksOptions.HOOKS_INCLUSIVE);

    expect(routes).toHaveLength(6);
  })

  test('succeeds to compute no hooks routes', async () => {
    const pools = [
      USDC_DAI_V4_LOW,
      USDC_DAI_V4_MEDIUM,
      USDC_WETH_V4_LOW,
      WETH9_USDT_V4_LOW,
      DAI_USDT_V4_LOW,
      new V4Pool(USDT, WBTC, FeeAmount.LOW, 10, '0x00001f3b9712708127b1fcad61cb892535951888', encodeSqrtRatioX96(1, 1), 500, 0),
      new V4Pool(USDT, WBTC, FeeAmount.LOW, 10, ADDRESS_ZERO, encodeSqrtRatioX96(1, 1), 500, 0),
    ];
    const routes = computeAllV4Routes(USDC, WBTC, pools, 3, HooksOptions.NO_HOOKS);

    expect(routes).toHaveLength(3);
  })

  test('succeeds to compute hooks only routes', async () => {
    const pools = [
      USDC_DAI_V4_LOW,
      USDC_DAI_V4_MEDIUM,
      USDC_WETH_V4_LOW,
      WETH9_USDT_V4_LOW,
      DAI_USDT_V4_LOW,
      new V4Pool(USDT, USDC, FeeAmount.LOW, 10, '0x00001f3b9712708127b1fcad61cb892535951888', encodeSqrtRatioX96(1, 1), 500, 0),
      new V4Pool(USDT, WBTC, FeeAmount.LOW, 10, '0x00001f3b9712708127b1fcad61cb892535951888', encodeSqrtRatioX96(1, 1), 500, 0),
      new V4Pool(USDT, WBTC, FeeAmount.LOW, 10, ADDRESS_ZERO, encodeSqrtRatioX96(1, 1), 500, 0),
    ];
    const routes = computeAllV4Routes(USDC, WBTC, pools, 3, HooksOptions.HOOKS_ONLY);

    expect(routes).toHaveLength(1);
  })
})

describe('compute all v3 routes', () => {
  test('succeeds to compute all routes', async () => {
    const pools = [
      USDC_DAI_LOW,
      USDC_DAI_MEDIUM,
      USDC_WETH_LOW,
      WETH9_USDT_LOW,
      DAI_USDT_LOW,
    ];
    const routes = computeAllV3Routes(USDC, DAI, pools, 3);

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
    const routes = computeAllV3Routes(USDC, DAI, pools, 1);

    expect(routes).toHaveLength(2);
  });

  test('succeeds to compute all routes with 4 hops, ignoring arbitrage opportunities', async () => {
    const pools = [
      USDC_DAI_LOW,
      USDC_DAI_MEDIUM,
      USDC_WETH_LOW,
      WETH9_USDT_LOW,
      DAI_USDT_LOW,
    ];
    const routes = computeAllV3Routes(USDC, WRAPPED_NATIVE_CURRENCY[1]!, pools, 4);

    routes.forEach((route) => {
      expect(route.pools).not.toEqual([USDC_DAI_MEDIUM, USDC_DAI_LOW, USDC_WETH_LOW]);
    });
    expect(routes).toHaveLength(3);
  });

  test('succeeds when no routes', async () => {
    const pools = [
      USDC_DAI_LOW,
      USDC_DAI_MEDIUM,
      USDC_WETH_LOW,
      WETH9_USDT_LOW,
      DAI_USDT_LOW,
      new V3Pool(USDT, WBTC, FeeAmount.LOW, encodeSqrtRatioX96(1, 1), 500, 0),
    ];

    // No way to get from USDC to WBTC in 2 hops
    const routes = computeAllV3Routes(USDC, WBTC, pools, 2);

    expect(routes).toHaveLength(0);
  });
});

describe('compute all mixed routes', () => {
  test('succeeds to compute all routes', async () => {
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
  });

  test('fails to compute all routes with 1 hop (since mixed requires at least 2 hops)', async () => {
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
    ];
    const routes = computeAllMixedRoutes(USDC, DAI, pools, 1);

    expect(routes).toHaveLength(0);
  });

  test('succeeds to compute all routes with 2 hops', async () => {
    const pools = [
      DAI_USDT,
      USDC_WETH,
      WETH_USDT,
      USDC_DAI,
      USDC_USDT,
      WBTC_WETH,
      USDC_DAI_LOW,
      USDC_DAI_MEDIUM,
      USDC_WETH_LOW,
      WETH9_USDT_LOW,
      DAI_USDT_LOW,
    ];
    const routes = computeAllMixedRoutes(USDC, DAI, pools, 2);

    expect(routes).toHaveLength(1);
  });

  test('succeeds to compute all routes with 5 hops. ignoring arbitrage opportunities', async () => {
    const pools = [
      DAI_USDT,
      USDC_DAI,
      USDC_USDT,
      USDC_WETH,
      WETH_USDT,
      WBTC_WETH,
      USDC_DAI_LOW,
      USDC_DAI_MEDIUM,
      USDC_WETH_LOW,
      WETH9_USDT_LOW,
      DAI_USDT_LOW,
    ];
    const routes = computeAllMixedRoutes(USDC, WRAPPED_NATIVE_CURRENCY[1]!, pools, 4);

    routes.forEach((route) => {
      expect(route.pools).not.toEqual([USDC_DAI, USDC_DAI_LOW, USDC_WETH]);
      expect(route.pools).not.toEqual([USDC_DAI, USDC_DAI_MEDIUM, USDC_WETH]);
      expect(route.pools).not.toEqual([USDC_DAI_LOW, USDC_DAI_MEDIUM, USDC_WETH]);
      expect(route.pools).not.toEqual([USDC_DAI_LOW, USDC_DAI, USDC_WETH]);
      expect(route.pools).not.toEqual([USDC_DAI_MEDIUM, USDC_DAI_LOW, USDC_WETH]);
      expect(route.pools).not.toEqual([USDC_DAI_MEDIUM, USDC_DAI, USDC_WETH]);
    });

    expect(routes).toHaveLength(10);
  });

  test('succeeds when no routes', async () => {
    const pools = [
      DAI_USDT,
      WETH_USDT,
      USDC_DAI,
      WBTC_WETH,
      WETH9_USDT_LOW,
      DAI_USDT_LOW,
      new Pair(
        CurrencyAmount.fromRawAmount(USDT, 10),
        CurrencyAmount.fromRawAmount(WBTC, 10)
      ),
    ];

    // No way to get from USDC to WBTC in 2 hops
    const routes = computeAllMixedRoutes(USDC, WBTC, pools, 2);

    expect(routes).toHaveLength(0);
  });

  test('succeeds to compute native currency routes', async () => {
    const pools = [
      ETH_USDT_V4_LOW,
      UNI_ETH_V4_MEDIUM,
      UNI_WETH_MEDIUM,
    ];
    const routes = computeAllMixedRoutes(USDT, WETH9[ChainId.MAINNET]!, pools, 3);

    expect(routes).toHaveLength(1);
  });

  test('handles ETH/WETH wrapping in mixed routes', async () => {
    const pools = [
      USDC_WETH_LOW, // V3 pool
      ETH_USDT_V4_LOW
    ];
    const routes = computeAllMixedRoutes(USDC, USDT, pools, 2, true);
    expect(routes.length).toBeGreaterThan(0);
    // Routes should not include both ETH and WETH fake pools
    routes.forEach(route => {
      expect(route.pools).toEqual([USDC_WETH_LOW, V4_ETH_WETH_FAKE_POOL[ChainId.MAINNET], ETH_USDT_V4_LOW])
      expect(route.path).toEqual([USDC, nativeOnChain(ChainId.MAINNET).wrapped, nativeOnChain(ChainId.MAINNET), USDT])
      expect(route.input).toEqual(USDC)
      expect(route.output).toEqual(USDT)
      expect(route.pathInput).toEqual(USDC)
      expect(route.pathOutput).toEqual(USDT)
      expect(route.chainId).toEqual(1)
    });
  });

  test('disables ETH/WETH wrapping in mixed routes', async () => {
    const pools = [
      USDC_WETH_LOW, // V3 pool
      ETH_USDT_V4_LOW
    ];
    const routes = computeAllMixedRoutes(USDC, USDT, pools, 2, false);
    expect(routes.length).toEqual(0);
  });

  test('handles WETH/ETH unwrapping in mixed routes', async () => {
    const pools = [
      ETH_USDT_V4_LOW,
      USDC_WETH_LOW
    ];
    const routes = computeAllMixedRoutes(USDT, USDC, pools, 2, true);
    expect(routes.length).toBeGreaterThan(0);
    // Routes should not include both ETH and WETH fake pools
    routes.forEach(route => {
      expect(route.pools).toEqual([ETH_USDT_V4_LOW, V4_ETH_WETH_FAKE_POOL[ChainId.MAINNET], USDC_WETH_LOW])
      expect(route.path).toEqual([USDT, nativeOnChain(ChainId.MAINNET), nativeOnChain(ChainId.MAINNET).wrapped, USDC])
      expect(route.input).toEqual(USDT)
      expect(route.output).toEqual(USDC)
      expect(route.pathInput).toEqual(USDT)
      expect(route.pathOutput).toEqual(USDC)
      expect(route.chainId).toEqual(1)
    });
  });

  test('disables WETH/ETH unwrapping in mixed routes', async () => {
    const pools = [
      ETH_USDT_V4_LOW,
      USDC_WETH_LOW
    ];
    const routes = computeAllMixedRoutes(USDT, USDC, pools, 2, false);
    expect(routes.length).toEqual(0);
  });

  test('succeeds to compute hook inclusive routes', async () => {
    const pools = [
      DAI_USDT,
      new V4Pool(USDC, DAI, FeeAmount.LOW, 10, '0x00001f3b9712708127b1fcad61cb892535951888', encodeSqrtRatioX96(1, 1), 500, 0),
      new V4Pool(USDC, DAI, FeeAmount.LOW, 10, ADDRESS_ZERO, encodeSqrtRatioX96(1, 1), 500, 0),
    ];
    const routes = computeAllMixedRoutes(USDC, USDT, pools, 3, true, HooksOptions.HOOKS_INCLUSIVE);

    expect(routes).toHaveLength(2);
  })

  test('succeeds to compute no hooks routes', async () => {
    const pools = [
      DAI_USDT,
      new V4Pool(USDC, DAI, FeeAmount.LOW, 10, '0x00001f3b9712708127b1fcad61cb892535951888', encodeSqrtRatioX96(1, 1), 500, 0),
      new V4Pool(USDC, DAI, FeeAmount.LOW, 10, ADDRESS_ZERO, encodeSqrtRatioX96(1, 1), 500, 0),
    ]
    const routes = computeAllMixedRoutes(USDC, USDT, pools, 3, true, HooksOptions.NO_HOOKS);

    expect(routes).toHaveLength(1);
  })

  test('succeeds to compute hooks only routes', async () => {
    const pools = [
      DAI_USDT,
      new V4Pool(USDC, DAI, FeeAmount.LOW, 10, '0x00001f3b9712708127b1fcad61cb892535951888', encodeSqrtRatioX96(1, 1), 500, 0),
      new V4Pool(USDC, DAI, FeeAmount.LOW, 10, ADDRESS_ZERO, encodeSqrtRatioX96(1, 1), 500, 0),
    ];
    const routes = computeAllMixedRoutes(USDC, USDT, pools, 3, true, HooksOptions.HOOKS_ONLY);

    expect(routes).toHaveLength(1);
  })
});

describe('compute all v2 routes', () => {
  test('succeeds to compute all routes', async () => {
    const pools = [DAI_USDT, USDC_WETH, WETH_USDT, USDC_DAI, WBTC_WETH];
    const routes = computeAllV2Routes(USDC, DAI, pools, 3);

    expect(routes).toHaveLength(2);
  });

  test('succeeds to compute all routes with 1 hop', async () => {
    const pools = [DAI_USDT, USDC_WETH, WETH_USDT, USDC_DAI, WBTC_WETH];
    const routes = computeAllV2Routes(USDC, DAI, pools, 1);

    expect(routes).toHaveLength(1);
  });

  test('succeeds to compute all routes with 5 hops. ignoring arbitrage opportunities', async () => {
    const pools = [DAI_USDT, USDC_DAI, USDC_USDT, USDC_WETH, WETH_USDT, WBTC_WETH];
    const routes = computeAllV2Routes(USDC, WRAPPED_NATIVE_CURRENCY[1]!, pools, 5);

    routes.forEach((route) => {
      expect(route.pairs).not.toEqual([USDC_USDT, DAI_USDT, USDC_DAI, USDC_WETH]);
      expect(route.pairs).not.toEqual([USDC_DAI, DAI_USDT, USDC_USDT, USDC_WETH]);
    });
    expect(routes).toHaveLength(3);
  });

  test('succeeds when no routes', async () => {
    const pools = [
      DAI_USDT,
      WETH_USDT,
      USDC_DAI,
      WBTC_WETH,
      new Pair(
        CurrencyAmount.fromRawAmount(USDT, 10),
        CurrencyAmount.fromRawAmount(WBTC, 10)
      ),
    ];

    // No way to get from USDC to WBTC in 2 hops
    const routes = computeAllV2Routes(USDC, WBTC, pools, 2);

    expect(routes).toHaveLength(0);
  });
});
