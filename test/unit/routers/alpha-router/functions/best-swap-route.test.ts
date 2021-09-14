import { Token, TradeType } from '@uniswap/sdk-core';
import { Pool } from '@uniswap/v3-sdk';
import { BigNumber } from 'ethers';
import JSBI from 'jsbi';
import sinon from 'sinon';
import {
  AmountQuote,
  CurrencyAmount,
  GasModel,
  PoolProvider,
  RouteSOR,
  RouteWithQuotes,
  USDC,
  WETH9,
} from '../../../../../src';
import { getBestSwapRoute } from '../../../../../src/routers/alpha-router/functions/best-swap-route';
import {
  buildMockPoolAccessor,
  DAI_USDT_LOW,
  DAI_USDT_MEDIUM,
  mockRoutingConfig,
  USDC_DAI_LOW,
  USDC_DAI_MEDIUM,
  USDC_WETH_LOW,
  USDC_WETH_MEDIUM,
  WBTC_USDT_MEDIUM,
  WBTC_WETH_MEDIUM,
  WETH9_USDT_LOW,
} from '../../../test-util/mock-data';

const route1 = new RouteSOR(
  [USDC_DAI_LOW, DAI_USDT_LOW, WETH9_USDT_LOW],
  USDC,
  WETH9[1]
);
const route2 = new RouteSOR([USDC_WETH_LOW], USDC, WETH9[1]);
const route3 = new RouteSOR(
  [USDC_DAI_MEDIUM, DAI_USDT_MEDIUM, WBTC_USDT_MEDIUM, WBTC_WETH_MEDIUM],
  USDC,
  WETH9[1]!
);
const route4 = new RouteSOR(
  [USDC_WETH_MEDIUM],
  USDC,
  WETH9[1]!
);

const mockPools = [
  USDC_DAI_LOW,
  DAI_USDT_LOW,
  WETH9_USDT_LOW,
  USDC_DAI_MEDIUM,
  DAI_USDT_MEDIUM,
  WBTC_USDT_MEDIUM,
  WBTC_WETH_MEDIUM,
  USDC_WETH_LOW,
  USDC_WETH_MEDIUM,
];

describe('get best swap route', () => {
  let mockPoolProvider: sinon.SinonStubbedInstance<PoolProvider>;
  let mockGasModel: sinon.SinonStubbedInstance<GasModel>;

  beforeEach(() => {
    mockPoolProvider = sinon.createStubInstance(PoolProvider);
    mockPoolProvider.getPools.resolves(buildMockPoolAccessor(mockPools));
    mockPoolProvider.getPoolAddress.callsFake((tA, tB, fee) => ({
      poolAddress: Pool.getAddress(tA, tB, fee),
      token0: tA,
      token1: tB,
    }));

    mockGasModel = {
      estimateGasCost: sinon.stub(),
    };
    mockGasModel.estimateGasCost.callsFake((r) => {
      return {
        gasEstimate: BigNumber.from(10000),
        gasCostInToken: CurrencyAmount.fromRawAmount(r.quoteToken, 0),
        gasCostInUSD: CurrencyAmount.fromRawAmount(USDC, 0),
      };
    });
  });

  const buildAmountQuote = (
    amountToken: Token,
    amount: number,
    quote: number
  ): AmountQuote => {
    return {
      amount: CurrencyAmount.fromRawAmount(amountToken, amount),
      quote: BigNumber.from(quote),
      sqrtPriceX96AfterList: [BigNumber.from(1)],
      initializedTicksCrossedList: [1],
      gasEstimate: BigNumber.from(100000),
    };
  };

  test('succeeds to find 1 split best route', async () => {
    const amount = CurrencyAmount.fromRawAmount(USDC, 100000);
    const percents = [25, 50, 75, 100];
    const routesWithQuotes: RouteWithQuotes[] = [
      [
        route1,
        [
          buildAmountQuote(USDC, 25000, 10),
          buildAmountQuote(USDC, 50000, 20),
          buildAmountQuote(USDC, 75000, 30),
          buildAmountQuote(USDC, 100000, 40),
        ],
      ],
      [
        route2,
        [
          buildAmountQuote(USDC, 25000, 8),
          buildAmountQuote(USDC, 50000, 19),
          buildAmountQuote(USDC, 75000, 28),
          buildAmountQuote(USDC, 100000, 38),
        ],
      ],
      [
        route3,
        [
          buildAmountQuote(USDC, 25000, 14),
          buildAmountQuote(USDC, 50000, 19),
          buildAmountQuote(USDC, 75000, 23),
          buildAmountQuote(USDC, 100000, 60),
        ],
      ],
    ];

    const {
      quote,
      routes,
      quoteGasAdjusted,
      estimatedGasUsed,
      estimatedGasUsedUSD,
      estimatedGasUsedQuoteToken,
    } = getBestSwapRoute(
      amount,
      percents,
      routesWithQuotes,
      WETH9[1]!,
      TradeType.EXACT_INPUT,
      mockGasModel,
      { ...mockRoutingConfig, distributionPercent: 25 },
      mockPoolProvider
    )!;

    expect(quote.quotient.toString()).toBe('60');
    expect(quote.equalTo(quoteGasAdjusted)).toBeTruthy();
    expect(estimatedGasUsed.eq(BigNumber.from(10000))).toBeTruthy();
    expect(
      estimatedGasUsedUSD.equalTo(CurrencyAmount.fromRawAmount(USDC, 0))
    ).toBeTruthy();
    expect(
      estimatedGasUsedQuoteToken.equalTo(
        CurrencyAmount.fromRawAmount(WETH9[1], 0)
      )
    ).toBeTruthy();
    expect(routes).toHaveLength(1);
  });

  test('succeeds to find 2 split best route', async () => {
    const amount = CurrencyAmount.fromRawAmount(USDC, 100000);
    const percents = [25, 50, 75, 100];
    const routesWithQuotes: RouteWithQuotes[] = [
      [
        route1,
        [
          buildAmountQuote(USDC, 25000, 10),
          buildAmountQuote(USDC, 50000, 20),
          buildAmountQuote(USDC, 75000, 30),
          buildAmountQuote(USDC, 100000, 40),
        ],
      ],
      [
        route2,
        [
          buildAmountQuote(USDC, 25000, 8),
          buildAmountQuote(USDC, 50000, 19),
          buildAmountQuote(USDC, 75000, 28),
          buildAmountQuote(USDC, 100000, 38),
        ],
      ],
      [
        route3,
        [
          buildAmountQuote(USDC, 25000, 14),
          buildAmountQuote(USDC, 50000, 19),
          buildAmountQuote(USDC, 75000, 23),
          buildAmountQuote(USDC, 100000, 30),
        ],
      ],
    ];

    const {
      quote,
      routes,
      quoteGasAdjusted,
      estimatedGasUsed,
      estimatedGasUsedUSD,
      estimatedGasUsedQuoteToken,
    } = getBestSwapRoute(
      amount,
      percents,
      routesWithQuotes,
      WETH9[1]!,
      TradeType.EXACT_INPUT,
      mockGasModel,
      { ...mockRoutingConfig, distributionPercent: 25 },
      mockPoolProvider
    )!;

    expect(quote.quotient.toString()).toBe('44');
    expect(quote.equalTo(quoteGasAdjusted)).toBeTruthy();
    expect(estimatedGasUsed.eq(BigNumber.from(20000))).toBeTruthy();
    expect(
      estimatedGasUsedUSD.equalTo(CurrencyAmount.fromRawAmount(USDC, 0))
    ).toBeTruthy();
    expect(
      estimatedGasUsedQuoteToken.equalTo(
        CurrencyAmount.fromRawAmount(WETH9[1], 0)
      )
    ).toBeTruthy();
    expect(routes).toHaveLength(2);
  });

  test('succeeds to find 3 split best route', async () => {
    const amount = CurrencyAmount.fromRawAmount(USDC, 100000);
    const percents = [25, 50, 75, 100];
    const routesWithQuotes: RouteWithQuotes[] = [
      [
        route1,
        [
          buildAmountQuote(USDC, 25000, 10),
          buildAmountQuote(USDC, 50000, 50),
          buildAmountQuote(USDC, 75000, 10),
          buildAmountQuote(USDC, 100000, 10),
        ],
      ],
      [
        route2,
        [
          buildAmountQuote(USDC, 25000, 25),
          buildAmountQuote(USDC, 50000, 10),
          buildAmountQuote(USDC, 75000, 10),
          buildAmountQuote(USDC, 100000, 10),
        ],
      ],
      [
        route3,
        [
          buildAmountQuote(USDC, 25000, 25),
          buildAmountQuote(USDC, 50000, 10),
          buildAmountQuote(USDC, 75000, 10),
          buildAmountQuote(USDC, 100000, 10),
        ],
      ],
    ];

    const {
      quote,
      routes,
      quoteGasAdjusted,
      estimatedGasUsed,
      estimatedGasUsedUSD,
      estimatedGasUsedQuoteToken,
    } = getBestSwapRoute(
      amount,
      percents,
      routesWithQuotes,
      WETH9[1]!,
      TradeType.EXACT_INPUT,
      mockGasModel,
      { ...mockRoutingConfig, distributionPercent: 25 },
      mockPoolProvider
    )!;

    expect(quote.quotient.toString()).toBe('100');
    expect(quote.equalTo(quoteGasAdjusted)).toBeTruthy();
    expect(estimatedGasUsed.eq(BigNumber.from(30000))).toBeTruthy();
    expect(
      estimatedGasUsedUSD.equalTo(CurrencyAmount.fromRawAmount(USDC, 0))
    ).toBeTruthy();
    expect(
      estimatedGasUsedQuoteToken.equalTo(
        CurrencyAmount.fromRawAmount(WETH9[1], 0)
      )
    ).toBeTruthy();
    expect(routes).toHaveLength(3);
  });

  test('succeeds to find 4 split best route', async () => {
    const amount = CurrencyAmount.fromRawAmount(USDC, 100000);
    const percents = [25, 50, 75, 100];
    const routesWithQuotes: RouteWithQuotes[] = [
      [
        route1,
        [
          buildAmountQuote(USDC, 25000, 30),
          buildAmountQuote(USDC, 50000, 50),
          buildAmountQuote(USDC, 75000, 52),
          buildAmountQuote(USDC, 100000, 54),
        ],
      ],
      [
        route2,
        [
          buildAmountQuote(USDC, 25000, 35),
          buildAmountQuote(USDC, 50000, 35),
          buildAmountQuote(USDC, 75000, 34),
          buildAmountQuote(USDC, 100000, 50),
        ],
      ],
      [
        route3,
        [
          buildAmountQuote(USDC, 25000, 35),
          buildAmountQuote(USDC, 50000, 40),
          buildAmountQuote(USDC, 75000, 42),
          buildAmountQuote(USDC, 100000, 50),
        ],
      ],
      [
        route4,
        [
          buildAmountQuote(USDC, 25000, 40),
          buildAmountQuote(USDC, 50000, 42),
          buildAmountQuote(USDC, 75000, 44),
          buildAmountQuote(USDC, 100000, 56),
        ]
      ]
    ];

    const {
      quote,
      routes,
      quoteGasAdjusted,
      estimatedGasUsed,
      estimatedGasUsedUSD,
      estimatedGasUsedQuoteToken,
    } = getBestSwapRoute(
      amount,
      percents,
      routesWithQuotes,
      WETH9[1]!,
      TradeType.EXACT_INPUT,
      mockGasModel,
      { ...mockRoutingConfig, distributionPercent: 25 },
      mockPoolProvider
    )!;

    expect(quote.quotient.toString()).toBe('140');
    expect(quote.equalTo(quoteGasAdjusted)).toBeTruthy();
    expect(estimatedGasUsed.eq(BigNumber.from(40000))).toBeTruthy();
    expect(
      estimatedGasUsedUSD.equalTo(CurrencyAmount.fromRawAmount(USDC, 0))
    ).toBeTruthy();
    expect(
      estimatedGasUsedQuoteToken.equalTo(
        CurrencyAmount.fromRawAmount(WETH9[1], 0)
      )
    ).toBeTruthy();
    expect(routes).toHaveLength(4);
  });

  test('succeeds to find best route accounting for gas', async () => {
    // Set gas model so that each hop in route costs 10 gas.
    mockGasModel.estimateGasCost.callsFake((r) => {
      const hops = r.route.pools.length;
      return {
        gasEstimate: BigNumber.from(10000).mul(hops),
        gasCostInToken: CurrencyAmount.fromRawAmount(
          r.quoteToken,
          JSBI.multiply(JSBI.BigInt(10), JSBI.BigInt(hops))
        ),
        gasCostInUSD: CurrencyAmount.fromRawAmount(
          USDC,
          JSBI.multiply(JSBI.BigInt(10), JSBI.BigInt(hops))
        ),
      };
    });

    const amount = CurrencyAmount.fromRawAmount(USDC, 100000);
    const percents = [25, 50, 75, 100];
    // Route 1 has 3 hops. Cost 30 gas.
    // Route 2 has 1 hop. Cost 10 gas.
    // Ignoring gas, 50% Route 1, 50% Route 2 is best swap.
    // Expect algorithm to pick 100% Route 2 instead after considering gas.
    const routesWithQuotes: RouteWithQuotes[] = [
      [
        route1,
        [
          buildAmountQuote(USDC, 25000, 10),
          buildAmountQuote(USDC, 50000, 50),
          buildAmountQuote(USDC, 75000, 10),
          buildAmountQuote(USDC, 100000, 10),
        ],
      ],
      [
        route2,
        [
          buildAmountQuote(USDC, 25000, 10),
          buildAmountQuote(USDC, 50000, 50),
          buildAmountQuote(USDC, 75000, 10),
          buildAmountQuote(USDC, 100000, 85),
        ],
      ],
    ];

    const {
      quote,
      routes,
      quoteGasAdjusted,
      estimatedGasUsed,
      estimatedGasUsedUSD,
      estimatedGasUsedQuoteToken,
    } = getBestSwapRoute(
      amount,
      percents,
      routesWithQuotes,
      WETH9[1]!,
      TradeType.EXACT_INPUT,
      mockGasModel,
      { ...mockRoutingConfig, distributionPercent: 25 },
      mockPoolProvider
    )!;

    expect(quote.quotient.toString()).toBe('85');
    expect(quoteGasAdjusted.quotient.toString()).toBe('75');
    expect(estimatedGasUsed.eq(BigNumber.from(10000))).toBeTruthy();
    expect(
      estimatedGasUsedUSD.equalTo(CurrencyAmount.fromRawAmount(USDC, 10))
    ).toBeTruthy();
    expect(
      estimatedGasUsedQuoteToken.equalTo(
        CurrencyAmount.fromRawAmount(WETH9[1], 10)
      )
    ).toBeTruthy();
    expect(routes).toHaveLength(1);
  });
});
