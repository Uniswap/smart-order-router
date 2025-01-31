import { BigNumber } from '@ethersproject/bignumber';
import {
  ChainId,
  Ether,
  Fraction,
  TradeType
} from '@uniswap/sdk-core';
import { Pair } from '@uniswap/v2-sdk';
import { Pool } from '@uniswap/v3-sdk';
import { Pool as PoolV4 } from '@uniswap/v4-sdk';
import JSBI from 'jsbi';
import _ from 'lodash';
import sinon from 'sinon';
import {
  CurrencyAmount,
  DAI_MAINNET,
  USDT_MAINNET as USDT,
  IGasModel,
  RouteWithValidQuote,
  USDC_MAINNET as USDC,
  V2Route,
  V2RouteWithValidQuote,
  V3PoolProvider,
  V3Route,
  V3RouteWithValidQuote,
  WRAPPED_NATIVE_CURRENCY,
  V4Route,
  V4RouteWithValidQuote,
  MixedRoute,
  V4PoolProvider,
} from '../../../../../src';
import { MixedRouteWithValidQuote } from '../../../../../src';
import { IPortionProvider, PortionProvider } from '../../../../../src/providers/portion-provider';
import { V2PoolProvider } from '../../../../../src/providers/v2/pool-provider';
import { getBestSwapRoute, routeHasNativeTokenInputOrOutput, routeHasWrappedNativeTokenInputOrOutput } from '../../../../../src/routers/alpha-router/functions/best-swap-route';
import {
  buildMockV2PoolAccessor,
  buildMockV3PoolAccessor,
  buildMockV4PoolAccessor,
  DAI_USDT,
  DAI_USDT_LOW,
  DAI_USDT_MEDIUM,
  mockRoutingConfig,
  USDC_DAI,
  USDC_DAI_LOW,
  USDC_DAI_MEDIUM,
  USDC_WETH,
  USDC_WETH_LOW,
  USDC_WETH_MEDIUM,
  WBTC_USDT_MEDIUM,
  WBTC_WETH,
  WBTC_WETH_MEDIUM,
  WETH9_USDT_LOW,
  WETH_USDT,
  ETH_USDT_V4_LOW,
  USDC_DAI_V4_LOW,
  USDC_DAI_V4_MEDIUM,
  USDC_WETH_V4_LOW,
  USDC_ETH_V4_LOW,
  WETH9_USDT_V4_LOW,
  DAI_USDT_V4_LOW,
  USDC_USDT_V4_MEDIUM,
  UNI_WETH_V4_MEDIUM,
  UNI_ETH_V4_MEDIUM,
  DAI_WETH_V4_MEDIUM,
  DAI_ETH_V4_MEDIUM,
} from '../../../../test-util/mock-data';

const v3Route1 = new V3Route(
  [USDC_DAI_LOW, DAI_USDT_LOW, WETH9_USDT_LOW],
  USDC,
  WRAPPED_NATIVE_CURRENCY[1]
);
const v3Route2 = new V3Route([USDC_WETH_LOW], USDC, WRAPPED_NATIVE_CURRENCY[1]);
const v3Route3 = new V3Route(
  [USDC_DAI_MEDIUM, DAI_USDT_MEDIUM, WBTC_USDT_MEDIUM, WBTC_WETH_MEDIUM],
  USDC,
  WRAPPED_NATIVE_CURRENCY[1]
);
const v3Route4 = new V3Route(
  [USDC_WETH_MEDIUM],
  USDC,
  WRAPPED_NATIVE_CURRENCY[1]
);

const v2Route1 = new V2Route(
  [USDC_DAI, DAI_USDT, WETH_USDT],
  USDC,
  WRAPPED_NATIVE_CURRENCY[1]
);
const v2Route2 = new V2Route([USDC_WETH], USDC, WRAPPED_NATIVE_CURRENCY[1]);
const v2Route3 = new V2Route(
  [USDC_DAI, DAI_USDT, WETH_USDT, WBTC_WETH],
  USDC,
  WRAPPED_NATIVE_CURRENCY[1]!
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
  let mockPoolProvider: sinon.SinonStubbedInstance<V3PoolProvider>;
  let mockV3GasModel: sinon.SinonStubbedInstance<
    IGasModel<V3RouteWithValidQuote>
  >;
  let mockV4GasModel: sinon.SinonStubbedInstance<IGasModel<V4RouteWithValidQuote>>;
  let mockMixedGasModel: sinon.SinonStubbedInstance<IGasModel<MixedRouteWithValidQuote>>;
  let mockV3PoolProvider: sinon.SinonStubbedInstance<V3PoolProvider>;
  let mockV2PoolProvider: sinon.SinonStubbedInstance<V2PoolProvider>;
  let mockV2GasModel: sinon.SinonStubbedInstance<
    IGasModel<V2RouteWithValidQuote>
  >;
  let portionProvider: IPortionProvider;
  let mockV4PoolProvider: sinon.SinonStubbedInstance<V4PoolProvider>;

  beforeEach(() => {
    mockPoolProvider = sinon.createStubInstance(V3PoolProvider);
    mockPoolProvider.getPools.resolves(buildMockV3PoolAccessor(mockPools));
    mockPoolProvider.getPoolAddress.callsFake((tA, tB, fee) => ({
      poolAddress: Pool.getAddress(tA, tB, fee),
      token0: tA,
      token1: tB,
    }));

    mockV3GasModel = {
      estimateGasCost: sinon.stub(),
    };
    mockV3GasModel.estimateGasCost.callsFake((r) => {
      return {
        gasEstimate: BigNumber.from(10000),
        gasCostInToken: CurrencyAmount.fromRawAmount(r.quoteToken, 0),
        gasCostInUSD: CurrencyAmount.fromRawAmount(USDC, 0),
      };
    });

    mockV4GasModel = {
      estimateGasCost: sinon.stub(),
    };
    mockV4GasModel.estimateGasCost.callsFake((r) => {
      return {
        gasEstimate: BigNumber.from(10000),
        gasCostInToken: CurrencyAmount.fromRawAmount(r.quoteToken, 0),
        gasCostInUSD: CurrencyAmount.fromRawAmount(USDC, 0),
      };
    });

    mockMixedGasModel = {
      estimateGasCost: sinon.stub(),
    };
    mockMixedGasModel.estimateGasCost.callsFake((r) => {
      return {
        gasEstimate: BigNumber.from(10000),
        gasCostInToken: CurrencyAmount.fromRawAmount(r.quoteToken, 0),
        gasCostInUSD: CurrencyAmount.fromRawAmount(USDC, 0),
      };
    });

    mockV3PoolProvider = sinon.createStubInstance(V3PoolProvider);
    const v3MockPools = [
      USDC_DAI_LOW,
      USDC_DAI_MEDIUM,
      USDC_WETH_LOW,
      WETH9_USDT_LOW,
      DAI_USDT_LOW,
    ];
    mockV3PoolProvider.getPools.resolves(buildMockV3PoolAccessor(v3MockPools));
    mockV3PoolProvider.getPoolAddress.callsFake((tA, tB, fee) => ({
      poolAddress: Pool.getAddress(tA, tB, fee),
      token0: tA,
      token1: tB,
    }));

    const v2MockPools = [DAI_USDT, USDC_WETH, WETH_USDT, USDC_DAI, WBTC_WETH];
    mockV2PoolProvider = sinon.createStubInstance(V2PoolProvider);
    mockV2PoolProvider.getPools.resolves(buildMockV2PoolAccessor(v2MockPools));
    mockV2PoolProvider.getPoolAddress.callsFake((tA, tB) => ({
      poolAddress: Pair.getAddress(tA, tB),
      token0: tA,
      token1: tB,
    }));

    mockV2GasModel = {
      estimateGasCost: sinon.stub(),
    };
    mockV2GasModel.estimateGasCost.callsFake((r: V2RouteWithValidQuote) => {
      return {
        gasEstimate: BigNumber.from(10000),
        gasCostInToken: CurrencyAmount.fromRawAmount(r.quoteToken, 0),
        gasCostInUSD: CurrencyAmount.fromRawAmount(USDC, 0),
      };
    });
    portionProvider = new PortionProvider();

    const mockV4Pools = [
      USDC_DAI_V4_LOW,
      USDC_DAI_V4_MEDIUM,
      USDC_WETH_V4_LOW,
      USDC_ETH_V4_LOW,
      WETH9_USDT_V4_LOW,
      ETH_USDT_V4_LOW,
      DAI_USDT_V4_LOW,
      USDC_USDT_V4_MEDIUM,
      UNI_WETH_V4_MEDIUM,
      UNI_ETH_V4_MEDIUM,
      DAI_WETH_V4_MEDIUM,
      DAI_ETH_V4_MEDIUM,
    ];
    mockV4PoolProvider = sinon.createStubInstance(V4PoolProvider);
    mockV4PoolProvider.getPools.resolves(buildMockV4PoolAccessor(mockV4Pools));
    // Mock getPoolId to return a pool info object with the required properties
    mockV4PoolProvider.getPoolId.callsFake((currency0, currency1, fee, tickSpacing, hooks) => {
      return {
        poolId: PoolV4.getPoolId(currency0, currency1, fee, tickSpacing, hooks),
        currency0: currency0,
        currency1: currency1
      };
    });
  });

  const buildV3RouteWithValidQuote = (
    route: V3Route,
    tradeType: TradeType,
    amount: CurrencyAmount,
    quote: number,
    percent: number
  ): V3RouteWithValidQuote => {
    const quoteToken =
      tradeType == TradeType.EXACT_OUTPUT ? route.output : route.input;
    return new V3RouteWithValidQuote({
      amount,
      rawQuote: BigNumber.from(quote),
      sqrtPriceX96AfterList: [BigNumber.from(1)],
      initializedTicksCrossedList: [1],
      quoterGasEstimate: BigNumber.from(100000),
      percent,
      route,
      gasModel: mockV3GasModel,
      quoteToken,
      tradeType,
      v3PoolProvider: mockV3PoolProvider,
    });
  };

  const buildV3RouteWithValidQuotes = (
    route: V3Route,
    tradeType: TradeType,
    inputAmount: CurrencyAmount,
    quotes: number[],
    percents: number[]
  ) => {
    return _.map(percents, (p, i) =>
      buildV3RouteWithValidQuote(
        route,
        tradeType,
        inputAmount.multiply(new Fraction(p, 100)),
        quotes[i]!,
        p
      )
    );
  };

  const buildV2RouteWithValidQuote = (
    route: V2Route,
    tradeType: TradeType,
    amount: CurrencyAmount,
    quote: number,
    percent: number
  ): V2RouteWithValidQuote => {
    const quoteToken =
      tradeType == TradeType.EXACT_OUTPUT ? route.output : route.input;
    return new V2RouteWithValidQuote({
      amount,
      rawQuote: BigNumber.from(quote),
      percent,
      route,
      gasModel: mockV2GasModel,
      quoteToken,
      tradeType,
      v2PoolProvider: mockV2PoolProvider,
    });
  };

  const buildV2RouteWithValidQuotes = (
    route: V2Route,
    tradeType: TradeType,
    inputAmount: CurrencyAmount,
    quotes: number[],
    percents: number[]
  ) => {
    return _.map(percents, (p, i) =>
      buildV2RouteWithValidQuote(
        route,
        tradeType,
        inputAmount.multiply(new Fraction(p, 100)),
        quotes[i]!,
        p
      )
    );
  };

  const buildV4RouteWithValidQuote = (
    route: V4Route,
    tradeType: TradeType,
    amount: CurrencyAmount,
    quote: number,
    percent: number
  ): V4RouteWithValidQuote => {
    const quoteToken =
      tradeType == TradeType.EXACT_OUTPUT ? route.output : route.input;
    // Ensure we use wrapped token if the quote token is native
    const quoteCurrency = quoteToken.isNative
      ? WRAPPED_NATIVE_CURRENCY[ChainId.MAINNET]!
      : quoteToken;
    return new V4RouteWithValidQuote({
      amount,
      rawQuote: BigNumber.from(quote),
      sqrtPriceX96AfterList: [BigNumber.from(1)],
      initializedTicksCrossedList: [1],
      quoterGasEstimate: BigNumber.from(100000),
      percent,
      route,
      gasModel: mockV4GasModel,
      quoteToken: quoteCurrency,
      tradeType,
      v4PoolProvider: mockV4PoolProvider,
    });
  };

  const buildMixedRouteWithValidQuote = (
    route: MixedRoute,
    tradeType: TradeType,
    amount: CurrencyAmount,
    quote: number,
    percent: number
  ): MixedRouteWithValidQuote => {
    const quoteToken =
      tradeType == TradeType.EXACT_OUTPUT ? route.output : route.input;
    // Ensure we use wrapped token if the quote token is native
    const quoteCurrency = quoteToken.isNative
      ? WRAPPED_NATIVE_CURRENCY[ChainId.MAINNET]!
      : quoteToken;
    return new MixedRouteWithValidQuote({
      amount,
      rawQuote: BigNumber.from(quote),
      sqrtPriceX96AfterList: [BigNumber.from(1)],
      initializedTicksCrossedList: [1],
      quoterGasEstimate: BigNumber.from(100000),
      percent,
      route,
      quoteToken: quoteCurrency,
      tradeType,
      v4PoolProvider: mockV4PoolProvider,
      v3PoolProvider: mockV3PoolProvider,
      v2PoolProvider: mockV2PoolProvider,
      mixedRouteGasModel: mockMixedGasModel,
    });
  };

  const buildMixedRouteWithValidQuotes = (
    route: MixedRoute,
    tradeType: TradeType,
    inputAmount: CurrencyAmount,
    quotes: number[],
    percents: number[]
  ) => {
    return _.map(percents, (p, i) =>
      buildMixedRouteWithValidQuote(
        route,
        tradeType,
        inputAmount.multiply(new Fraction(p, 100)),
        quotes[i]!,
        p
      )
    );
  };

  test('succeeds to find 1 split best route', async () => {
    const amount = CurrencyAmount.fromRawAmount(USDC, 100000);
    const percents = [25, 50, 75, 100];
    const routesWithQuotes: RouteWithValidQuote[] = [
      ...buildV3RouteWithValidQuotes(
        v3Route1,
        TradeType.EXACT_INPUT,
        amount,
        [10, 20, 30, 40],
        percents
      ),
      ...buildV2RouteWithValidQuotes(
        v2Route2,
        TradeType.EXACT_INPUT,
        amount,
        [8, 19, 28, 38],
        percents
      ),
      ...buildV3RouteWithValidQuotes(
        v3Route3,
        TradeType.EXACT_INPUT,
        amount,
        [14, 19, 23, 60],
        percents
      ),
    ];

    const swapRouteType = await getBestSwapRoute(
      amount,
      percents,
      routesWithQuotes,
      TradeType.EXACT_INPUT,
      ChainId.MAINNET,
      { ...mockRoutingConfig, distributionPercent: 25 },
      portionProvider
    )!;

    const {
      quote,
      routes,
      quoteGasAdjusted,
      estimatedGasUsed,
      estimatedGasUsedUSD,
      estimatedGasUsedQuoteToken,
    } = swapRouteType!;

    expect(quote.quotient.toString()).toBe('60');
    expect(quote.equalTo(quoteGasAdjusted)).toBeTruthy();
    expect(estimatedGasUsed.eq(BigNumber.from(10000))).toBeTruthy();
    expect(
      estimatedGasUsedUSD.equalTo(CurrencyAmount.fromRawAmount(USDC, 0))
    ).toBeTruthy();
    expect(
      estimatedGasUsedQuoteToken.equalTo(
        CurrencyAmount.fromRawAmount(WRAPPED_NATIVE_CURRENCY[1]!, 0)
      )
    ).toBeTruthy();
    expect(routes).toHaveLength(1);
  });

  test('succeeds to find 2 split best route', async () => {
    const amount = CurrencyAmount.fromRawAmount(USDC, 100000);
    const percents = [25, 50, 75, 100];

    const routesWithQuotes: RouteWithValidQuote[] = [
      ...buildV3RouteWithValidQuotes(
        v3Route1,
        TradeType.EXACT_INPUT,
        amount,
        [10, 20, 30, 40],
        percents
      ),
      ...buildV3RouteWithValidQuotes(
        v3Route2,
        TradeType.EXACT_INPUT,
        amount,
        [8, 19, 28, 38],
        percents
      ),
      ...buildV2RouteWithValidQuotes(
        v2Route3,
        TradeType.EXACT_INPUT,
        amount,
        [14, 19, 23, 30],
        percents
      ),
    ];

    const swapRouteType = await getBestSwapRoute(
      amount,
      percents,
      routesWithQuotes,
      TradeType.EXACT_INPUT,
      ChainId.MAINNET,
      { ...mockRoutingConfig, distributionPercent: 25 },
      portionProvider
    )!;

    const {
      quote,
      routes,
      quoteGasAdjusted,
      estimatedGasUsed,
      estimatedGasUsedUSD,
      estimatedGasUsedQuoteToken,
    } = swapRouteType!;

    expect(quote.quotient.toString()).toBe('44');
    expect(quote.equalTo(quoteGasAdjusted)).toBeTruthy();
    expect(estimatedGasUsed.eq(BigNumber.from(20000))).toBeTruthy();
    expect(
      estimatedGasUsedUSD.equalTo(CurrencyAmount.fromRawAmount(USDC, 0))
    ).toBeTruthy();
    expect(
      estimatedGasUsedQuoteToken.equalTo(
        CurrencyAmount.fromRawAmount(WRAPPED_NATIVE_CURRENCY[1]!, 0)
      )
    ).toBeTruthy();
    expect(routes).toHaveLength(2);
  });

  test('succeeds to find 3 split best route', async () => {
    const amount = CurrencyAmount.fromRawAmount(USDC, 100000);
    const percents = [25, 50, 75, 100];

    const routesWithQuotes: RouteWithValidQuote[] = [
      ...buildV2RouteWithValidQuotes(
        v2Route1,
        TradeType.EXACT_INPUT,
        amount,
        [10, 50, 10, 10],
        percents
      ),
      ...buildV3RouteWithValidQuotes(
        v3Route2,
        TradeType.EXACT_INPUT,
        amount,
        [25, 10, 10, 10],
        percents
      ),
      ...buildV3RouteWithValidQuotes(
        v3Route3,
        TradeType.EXACT_INPUT,
        amount,
        [25, 10, 10, 10],
        percents
      ),
    ];

    const swapRouteType = await getBestSwapRoute(
      amount,
      percents,
      routesWithQuotes,
      TradeType.EXACT_INPUT,
      ChainId.MAINNET,
      { ...mockRoutingConfig, distributionPercent: 25 },
      portionProvider
    )!;

    const {
      quote,
      routes,
      quoteGasAdjusted,
      estimatedGasUsed,
      estimatedGasUsedUSD,
      estimatedGasUsedQuoteToken,
    } = swapRouteType!;

    expect(quote.quotient.toString()).toBe('100');
    expect(quote.equalTo(quoteGasAdjusted)).toBeTruthy();
    expect(estimatedGasUsed.eq(BigNumber.from(30000))).toBeTruthy();
    expect(
      estimatedGasUsedUSD.equalTo(CurrencyAmount.fromRawAmount(USDC, 0))
    ).toBeTruthy();
    expect(
      estimatedGasUsedQuoteToken.equalTo(
        CurrencyAmount.fromRawAmount(WRAPPED_NATIVE_CURRENCY[1]!, 0)
      )
    ).toBeTruthy();
    expect(routes).toHaveLength(3);
  });

  test('succeeds to find 4 split best route', async () => {
    const amount = CurrencyAmount.fromRawAmount(USDC, 100000);
    const percents = [25, 50, 75, 100];

    const routesWithQuotes: RouteWithValidQuote[] = [
      ...buildV2RouteWithValidQuotes(
        v2Route1,
        TradeType.EXACT_INPUT,
        amount,
        [30, 50, 52, 54],
        percents
      ),
      ...buildV3RouteWithValidQuotes(
        v3Route2,
        TradeType.EXACT_INPUT,
        amount,
        [35, 35, 34, 50],
        percents
      ),
      ...buildV3RouteWithValidQuotes(
        v3Route3,
        TradeType.EXACT_INPUT,
        amount,
        [35, 40, 42, 50],
        percents
      ),
      ...buildV3RouteWithValidQuotes(
        v3Route4,
        TradeType.EXACT_INPUT,
        amount,
        [40, 42, 44, 56],
        percents
      ),
    ];

    const swapRouteType = await getBestSwapRoute(
      amount,
      percents,
      routesWithQuotes,
      TradeType.EXACT_INPUT,
      ChainId.MAINNET,
      { ...mockRoutingConfig, distributionPercent: 25 },
      portionProvider
    )!;

    const {
      quote,
      routes,
      quoteGasAdjusted,
      estimatedGasUsed,
      estimatedGasUsedUSD,
      estimatedGasUsedQuoteToken,
    } = swapRouteType!;

    expect(quote.quotient.toString()).toBe('140');
    expect(quote.equalTo(quoteGasAdjusted)).toBeTruthy();
    expect(estimatedGasUsed.eq(BigNumber.from(40000))).toBeTruthy();
    expect(
      estimatedGasUsedUSD.equalTo(CurrencyAmount.fromRawAmount(USDC, 0))
    ).toBeTruthy();
    expect(
      estimatedGasUsedQuoteToken.equalTo(
        CurrencyAmount.fromRawAmount(WRAPPED_NATIVE_CURRENCY[1]!, 0)
      )
    ).toBeTruthy();
    expect(routes).toHaveLength(4);
  });

  test('succeeds to find best route when routes on different protocols use same pool pairs', async () => {
    const amount = CurrencyAmount.fromRawAmount(USDC, 100000);
    const percents = [25, 50, 75, 100];

    // Check that even though the pools in these routes use the same tokens,
    // since they are on different protocols we are fine to route in them.
    const v2Route = new V2Route([USDC_WETH], USDC, WRAPPED_NATIVE_CURRENCY[1]!);
    const v3Route = new V3Route(
      [USDC_WETH_LOW],
      USDC,
      WRAPPED_NATIVE_CURRENCY[1]!
    );

    const routesWithQuotes: RouteWithValidQuote[] = [
      ...buildV2RouteWithValidQuotes(
        v2Route,
        TradeType.EXACT_INPUT,
        amount,
        [10, 500, 10, 10],
        percents
      ),
      ...buildV3RouteWithValidQuotes(
        v3Route,
        TradeType.EXACT_INPUT,
        amount,
        [10, 500, 10, 10],
        percents
      ),
      ...buildV3RouteWithValidQuotes(
        v3Route3,
        TradeType.EXACT_INPUT,
        amount,
        [10, 10, 10, 900],
        percents
      ),
    ];

    const swapRouteType = await getBestSwapRoute(
      amount,
      percents,
      routesWithQuotes,
      TradeType.EXACT_INPUT,
      ChainId.MAINNET,
      { ...mockRoutingConfig, distributionPercent: 25 },
      portionProvider
    )!;

    const {
      quote,
      routes,
      quoteGasAdjusted,
      estimatedGasUsed,
      estimatedGasUsedUSD,
      estimatedGasUsedQuoteToken,
    } = swapRouteType!;

    expect(quote.quotient.toString()).toBe('1000');
    expect(quote.equalTo(quoteGasAdjusted)).toBeTruthy();
    expect(estimatedGasUsed.toString()).toEqual('20000');
    expect(
      estimatedGasUsedUSD.equalTo(CurrencyAmount.fromRawAmount(USDC, 0))
    ).toBeTruthy();
    expect(
      estimatedGasUsedQuoteToken.equalTo(
        CurrencyAmount.fromRawAmount(WRAPPED_NATIVE_CURRENCY[1]!, 0)
      )
    ).toBeTruthy();
    expect(routes).toHaveLength(2);
  });

  test('succeeds to find best split route with min splits', async () => {
    const amount = CurrencyAmount.fromRawAmount(USDC, 100000);
    const percents = [25, 50, 75, 100];

    // Should ignore the 50k 1 split route and find the 3 split route.
    const routesWithQuotes: V3RouteWithValidQuote[] = [
      ...buildV3RouteWithValidQuotes(
        v3Route1,
        TradeType.EXACT_INPUT,
        amount,
        [30, 1000, 52, 54],
        percents
      ),
      ...buildV3RouteWithValidQuotes(
        v3Route2,
        TradeType.EXACT_INPUT,
        amount,
        [1000, 42, 34, 50],
        percents
      ),
      ...buildV3RouteWithValidQuotes(
        v3Route3,
        TradeType.EXACT_INPUT,
        amount,
        [1000, 40, 42, 50],
        percents
      ),
      ...buildV3RouteWithValidQuotes(
        v3Route4,
        TradeType.EXACT_INPUT,
        amount,
        [40, 42, 44, 56],
        percents
      ),
    ];

    const swapRouteType = await getBestSwapRoute(
      amount,
      percents,
      routesWithQuotes,
      TradeType.EXACT_INPUT,
      ChainId.MAINNET,
      { ...mockRoutingConfig, distributionPercent: 25 },
      portionProvider
    )!;

    const {
      quote,
      routes,
      quoteGasAdjusted,
      estimatedGasUsed,
      estimatedGasUsedUSD,
      estimatedGasUsedQuoteToken,
    } = swapRouteType!;

    expect(quote.quotient.toString()).toBe('3000');
    expect(quote.equalTo(quoteGasAdjusted)).toBeTruthy();
    expect(estimatedGasUsed.toString()).toBe('30000');
    expect(
      estimatedGasUsedUSD.equalTo(CurrencyAmount.fromRawAmount(USDC, 0))
    ).toBeTruthy();
    expect(
      estimatedGasUsedQuoteToken.equalTo(
        CurrencyAmount.fromRawAmount(WRAPPED_NATIVE_CURRENCY[1]!, 0)
      )
    ).toBeTruthy();
    expect(routes).toHaveLength(3);
  });

  test('succeeds to find best split route with max splits', async () => {
    const amount = CurrencyAmount.fromRawAmount(USDC, 100000);
    const percents = [25, 50, 75, 100];

    // Should ignore the 4 split route that returns 200k
    const routesWithQuotes: V3RouteWithValidQuote[] = [
      ...buildV3RouteWithValidQuotes(
        v3Route1,
        TradeType.EXACT_INPUT,
        amount,
        [50000, 10000, 52, 54],
        percents
      ),
      ...buildV3RouteWithValidQuotes(
        v3Route2,
        TradeType.EXACT_INPUT,
        amount,
        [50000, 42, 34, 50],
        percents
      ),
      ...buildV3RouteWithValidQuotes(
        v3Route3,
        TradeType.EXACT_INPUT,
        amount,
        [50000, 40, 42, 50],
        percents
      ),
      ...buildV3RouteWithValidQuotes(
        v3Route4,
        TradeType.EXACT_INPUT,
        amount,
        [50000, 42, 44, 56],
        percents
      ),
    ];

    const swapRouteType = await getBestSwapRoute(
      amount,
      percents,
      routesWithQuotes,
      TradeType.EXACT_INPUT,
      ChainId.MAINNET,
      {
        ...mockRoutingConfig,
        distributionPercent: 25,
        minSplits: 2,
        maxSplits: 3,
      },
      portionProvider
    )!;

    const {
      quote,
      routes,
      quoteGasAdjusted,
      estimatedGasUsed,
      estimatedGasUsedUSD,
      estimatedGasUsedQuoteToken,
    } = swapRouteType!;

    expect(quote.quotient.toString()).toBe('110000');
    expect(quote.equalTo(quoteGasAdjusted)).toBeTruthy();
    expect(estimatedGasUsed.toString()).toBe('30000');
    expect(
      estimatedGasUsedUSD.equalTo(CurrencyAmount.fromRawAmount(USDC, 0))
    ).toBeTruthy();
    expect(
      estimatedGasUsedQuoteToken.equalTo(
        CurrencyAmount.fromRawAmount(WRAPPED_NATIVE_CURRENCY[1]!, 0)
      )
    ).toBeTruthy();
    expect(routes).toHaveLength(3);
  });

  test('succeeds to find best route accounting for gas with gas model giving usd estimate in USDC', async () => {
    // Set gas model so that each hop in route costs 10 gas.
    mockV3GasModel.estimateGasCost.callsFake((r) => {
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
    const routesWithQuotes: V3RouteWithValidQuote[] = [
      ...buildV3RouteWithValidQuotes(
        v3Route1,
        TradeType.EXACT_INPUT,
        amount,
        [10, 50, 10, 10],
        percents
      ),
      ...buildV3RouteWithValidQuotes(
        v3Route2,
        TradeType.EXACT_INPUT,
        amount,
        [10, 50, 10, 85],
        percents
      ),
    ];

    const swapRouteType = await getBestSwapRoute(
      amount,
      percents,
      routesWithQuotes,
      TradeType.EXACT_INPUT,
      ChainId.MAINNET,
      { ...mockRoutingConfig, distributionPercent: 25 },
      portionProvider
    )!;

    const {
      quote,
      routes,
      quoteGasAdjusted,
      estimatedGasUsed,
      estimatedGasUsedUSD,
      estimatedGasUsedQuoteToken,
    } = swapRouteType!;

    expect(quote.quotient.toString()).toBe('85');
    expect(quoteGasAdjusted.quotient.toString()).toBe('75');
    expect(estimatedGasUsed.eq(BigNumber.from(10000))).toBeTruthy();
    // Code will actually convert USDC gas estimates to DAI, hence an extra 12 decimals on the quotient.
    expect(estimatedGasUsedUSD.quotient.toString()).toEqual('10000000000000');
    expect(
      estimatedGasUsedQuoteToken.equalTo(
        CurrencyAmount.fromRawAmount(WRAPPED_NATIVE_CURRENCY[1]!, 10)
      )
    ).toBeTruthy();
    expect(routes).toHaveLength(1);
  });

  test('succeeds to find best route accounting for gas with gas model giving usd estimate in DAI', async () => {
    // Set gas model so that each hop in route costs 10 gas.
    mockV3GasModel.estimateGasCost.callsFake((r) => {
      const hops = r.route.pools.length;
      return {
        gasEstimate: BigNumber.from(10000).mul(hops),
        gasCostInToken: CurrencyAmount.fromRawAmount(
          r.quoteToken,
          JSBI.multiply(JSBI.BigInt(10), JSBI.BigInt(hops))
        ),
        gasCostInUSD: CurrencyAmount.fromRawAmount(
          DAI_MAINNET,
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
    const routesWithQuotes: V3RouteWithValidQuote[] = [
      ...buildV3RouteWithValidQuotes(
        v3Route1,
        TradeType.EXACT_INPUT,
        amount,
        [10, 50, 10, 10],
        percents
      ),
      ...buildV3RouteWithValidQuotes(
        v3Route2,
        TradeType.EXACT_INPUT,
        amount,
        [10, 50, 10, 85],
        percents
      ),
    ];

    const swapRouteType = await getBestSwapRoute(
      amount,
      percents,
      routesWithQuotes,
      TradeType.EXACT_INPUT,
      ChainId.MAINNET,
      { ...mockRoutingConfig, distributionPercent: 25 },
      portionProvider
    )!;

    const {
      quote,
      routes,
      quoteGasAdjusted,
      estimatedGasUsed,
      estimatedGasUsedUSD,
      estimatedGasUsedQuoteToken,
    } = swapRouteType!;

    expect(quote.quotient.toString()).toBe('85');
    expect(quoteGasAdjusted.quotient.toString()).toBe('75');
    expect(estimatedGasUsed.eq(BigNumber.from(10000))).toBeTruthy();
    // Code will actually convert USDC gas estimates to DAI, hence an extra 12 decimals on the quotient.
    expect(estimatedGasUsedUSD.quotient.toString()).toEqual('10');
    expect(
      estimatedGasUsedQuoteToken.equalTo(
        CurrencyAmount.fromRawAmount(WRAPPED_NATIVE_CURRENCY[1]!, 10)
      )
    ).toBeTruthy();
    expect(routes).toHaveLength(1);
  });

  describe('native/wrapped native token utils', () => {
    describe('routeHasNativeTokenInputOrOutput', () => {
      it('returns true when input is native', () => {
        const nativeRoute = new V4Route(
          [ETH_USDT_V4_LOW],
          Ether.onChain(ChainId.MAINNET),
          USDT
        );

        const routeWithQuote = buildV4RouteWithValidQuote(
          nativeRoute,
          TradeType.EXACT_INPUT,
          CurrencyAmount.fromRawAmount(Ether.onChain(ChainId.MAINNET), 100),
          100,
          100
        );

        expect(routeHasNativeTokenInputOrOutput(routeWithQuote)).toBe(true);
      });

      it('returns true when output is native', () => {
        const nativeRoute = new V4Route(
          [ETH_USDT_V4_LOW],
          USDT,
          Ether.onChain(ChainId.MAINNET)
        );

        const routeWithQuote = buildV4RouteWithValidQuote(
          nativeRoute,
          TradeType.EXACT_INPUT,
          CurrencyAmount.fromRawAmount(USDT, 100),
          100,
          100
        );

        expect(routeHasNativeTokenInputOrOutput(routeWithQuote)).toBe(true);
      });

      it('returns false when neither input nor output is native', () => {
        const nonNativeRoute = new MixedRoute(
          [USDC_WETH_LOW],
          USDC,
          WRAPPED_NATIVE_CURRENCY[1]!.wrapped
        );

        const routeWithQuote = buildMixedRouteWithValidQuote(
          nonNativeRoute,
          TradeType.EXACT_INPUT,
          CurrencyAmount.fromRawAmount(USDC, 100),
          100,
          100
        );

        expect(routeHasNativeTokenInputOrOutput(routeWithQuote)).toBe(false);
      });
    });

    describe('routeHasWrappedNativeTokenInputOrOutput', () => {
      it('returns true when input is wrapped native', () => {
        const wrappedRoute = new MixedRoute(
          [USDC_WETH_LOW],
          WRAPPED_NATIVE_CURRENCY[1]!.wrapped,
          USDC
        );

        const routeWithQuote = buildMixedRouteWithValidQuote(
          wrappedRoute,
          TradeType.EXACT_INPUT,
          CurrencyAmount.fromRawAmount(WRAPPED_NATIVE_CURRENCY[1]!, 100),
          100,
          100
        );

        expect(routeHasWrappedNativeTokenInputOrOutput(routeWithQuote)).toBe(true);
      });

      it('returns true when output is wrapped native', () => {
        const wrappedRoute = new MixedRoute(
          [USDC_WETH_LOW],
          USDC,
          WRAPPED_NATIVE_CURRENCY[1]!.wrapped
        );

        const routeWithQuote = buildMixedRouteWithValidQuote(
          wrappedRoute,
          TradeType.EXACT_INPUT,
          CurrencyAmount.fromRawAmount(USDC, 100),
          100,
          100
        );

        expect(routeHasWrappedNativeTokenInputOrOutput(routeWithQuote)).toBe(true);
      });

      it('returns false when neither input nor output is wrapped native', () => {
        const nonWrappedRoute = new MixedRoute([USDC_DAI_LOW], USDC, DAI_MAINNET);

        const routeWithQuote = buildMixedRouteWithValidQuote(
          nonWrappedRoute,
          TradeType.EXACT_INPUT,
          CurrencyAmount.fromRawAmount(USDC, 100),
          100,
          100
        );

        expect(routeHasWrappedNativeTokenInputOrOutput(routeWithQuote)).toBe(false);
      });
    });
  });

  describe('native/wrapped native mixing prevention', () => {
    it('prevents mixing native and wrapped native tokens in route splits', async () => {
      const amount = CurrencyAmount.fromRawAmount(USDC, 100000);
      const percents = [50, 100];

      // Use ETH_USDT_V4_LOW which has native ETH
      const nativeRoute = new MixedRoute(
        [ETH_USDT_V4_LOW],
        USDT,
        Ether.onChain(ChainId.MAINNET)
      );

      // Use WETH9_USDT_V4_LOW which has wrapped ETH (WETH)
      const wrappedRoute = new MixedRoute(
        [WETH9_USDT_V4_LOW],
        USDT,
        WRAPPED_NATIVE_CURRENCY[1]!.wrapped
      );

      const routesWithQuotes: RouteWithValidQuote[] = [
        ...buildMixedRouteWithValidQuotes(
          nativeRoute,
          TradeType.EXACT_INPUT,
          amount,
          [200, 210], // Native route: 200 at 50%, 210 at 100%
          percents
        ),
        ...buildMixedRouteWithValidQuotes(
          wrappedRoute,
          TradeType.EXACT_INPUT,
          amount,
          [200, 205], // Wrapped route: 200 at 50%, 300 at 100% (much better than native)
          percents
        ),
      ];

      const swapRouteType = await getBestSwapRoute(
        amount,
        percents,
        routesWithQuotes,
        TradeType.EXACT_INPUT,
        ChainId.MAINNET,
        { ...mockRoutingConfig, distributionPercent: 50 },
        portionProvider
      )!;

      // Even though mixing native and wrapped native would give better quotes
      // (50/50 split would give 200 + 200 = 400 tokens), we expect only the native
      // route to be chosen at 100% (210 tokens) to avoid mixing native and wrapped tokens
      expect(swapRouteType!.routes).toHaveLength(1);
      expect(swapRouteType!.routes[0]!.route.output.isNative).toBe(true);
      expect(swapRouteType!.quote.quotient.toString()).toBe('210');
    });

    it('allows splitting between multiple wrapped native token routes', async () => {
      const amount = CurrencyAmount.fromRawAmount(USDC, 100000);
      const percents = [50, 100];

      // Two different routes, both using WETH
      const wrappedRoute1 = new MixedRoute(
        [USDC_WETH_LOW],
        USDC,
        WRAPPED_NATIVE_CURRENCY[1]!.wrapped
      );

      const wrappedRoute2 = new MixedRoute(
        [USDC_WETH_MEDIUM],
        USDC,
        WRAPPED_NATIVE_CURRENCY[1]!.wrapped
      );

      const routesWithQuotes: RouteWithValidQuote[] = [
        ...buildMixedRouteWithValidQuotes(
          wrappedRoute1,
          TradeType.EXACT_INPUT,
          amount,
          [90, 150], // First route quotes - slightly worse
          percents
        ),
        ...buildMixedRouteWithValidQuotes(
          wrappedRoute2,
          TradeType.EXACT_INPUT,
          amount,
          [110, 170], // Second route quotes - slightly better
          percents
        ),
      ];

      const swapRouteType = await getBestSwapRoute(
        amount,
        percents,
        routesWithQuotes,
        TradeType.EXACT_INPUT,
        ChainId.MAINNET,
        { ...mockRoutingConfig, distributionPercent: 50 },
        portionProvider
      )!;

      // We expect the route to be split 50/50 between the two WETH routes
      // because splitting gives us 90 + 110 = 200 total tokens, which is better than
      // using either route alone at 100% (150 or 170)
      expect(swapRouteType!.routes).toHaveLength(2);
      expect(swapRouteType!.routes[0]!.route.output.isNative).toBe(false);
      expect(swapRouteType!.routes[1]!.route.output.isNative).toBe(false);
      expect(swapRouteType!.routes[0]!.percent).toBe(50);
      expect(swapRouteType!.routes[1]!.percent).toBe(50);
      expect(swapRouteType!.quote.quotient.toString()).toBe('200'); // 90 + 110 = 200 total from 50/50 split
    });
  });
});
