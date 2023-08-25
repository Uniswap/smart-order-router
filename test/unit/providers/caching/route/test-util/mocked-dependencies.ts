import { BigNumber } from '@ethersproject/bignumber';
import { Protocol } from '@uniswap/router-sdk';
import { ChainId, TradeType } from '@uniswap/sdk-core';
import {
  DAI_MAINNET,
  USDC_MAINNET,
  V3Route,
  V3RouteWithValidQuote,
} from '../../../../../../build/main';
import {
  CachedRoutes,
  CurrencyAmount,
  DAI_MAINNET as DAI,
  MixedRoute,
  MixedRouteWithValidQuote,
  MixedRouteWithValidQuoteParams,
  USDC_MAINNET as USDC,
  V2Route,
  V2RouteWithValidQuote,
  V2RouteWithValidQuoteParams,
  V3RouteWithValidQuoteParams,
} from '../../../../../../src';
import {
  USDC_DAI,
  USDC_DAI_MEDIUM,
  USDC_WETH_MEDIUM,
  WETH_DAI,
} from '../../../../../test-util/mock-data';
import {
  getMockedMixedGasModel,
  getMockedV2GasModel,
  getMockedV2PoolProvider,
  getMockedV3GasModel,
  getMockedV3PoolProvider,
} from '../../../../routers/alpha-router/gas-models/test-util/mocked-dependencies';

export function getV2RouteWithValidQuoteStub(
  overrides?: Partial<V2RouteWithValidQuoteParams>
): V2RouteWithValidQuote {
  const route = new V2Route([USDC_DAI], USDC_MAINNET, DAI_MAINNET);

  return new V2RouteWithValidQuote({
    amount: CurrencyAmount.fromRawAmount(USDC, 100),
    rawQuote: BigNumber.from(100),
    percent: 100,
    route,
    gasModel: getMockedV2GasModel(),
    quoteToken: DAI,
    tradeType: TradeType.EXACT_INPUT,
    v2PoolProvider: getMockedV2PoolProvider(),
    ...overrides,
  });
}

export function getV3RouteWithValidQuoteStub(
  overrides?: Partial<V3RouteWithValidQuoteParams>
): V3RouteWithValidQuote {
  const route = new V3Route([USDC_DAI_MEDIUM], USDC_MAINNET, DAI_MAINNET);

  return new V3RouteWithValidQuote({
    amount: CurrencyAmount.fromRawAmount(USDC, 100),
    rawQuote: BigNumber.from(100),
    sqrtPriceX96AfterList: [BigNumber.from(1)],
    initializedTicksCrossedList: [1],
    quoterGasEstimate: BigNumber.from(100000), // unused
    percent: 100,
    route,
    gasModel: getMockedV3GasModel(),
    quoteToken: DAI,
    tradeType: TradeType.EXACT_INPUT,
    v3PoolProvider: getMockedV3PoolProvider(),
    ...overrides,
  });
}

export function getMixedRouteWithValidQuoteStub(
  overrides?: Partial<MixedRouteWithValidQuoteParams>
): MixedRouteWithValidQuote {
  const route = new MixedRoute(
    // v3 USDC -> WETH , v2 WETH -> DAI
    [USDC_WETH_MEDIUM, WETH_DAI],
    USDC_MAINNET,
    DAI_MAINNET
  );

  return new MixedRouteWithValidQuote({
    amount: CurrencyAmount.fromRawAmount(USDC, 100),
    rawQuote: BigNumber.from(100),
    sqrtPriceX96AfterList: [BigNumber.from(1)],
    initializedTicksCrossedList: [1],
    quoterGasEstimate: BigNumber.from(100000), // unused
    percent: 100,
    route,
    mixedRouteGasModel: getMockedMixedGasModel(),
    quoteToken: DAI,
    tradeType: TradeType.EXACT_INPUT,
    v3PoolProvider: getMockedV3PoolProvider(),
    v2PoolProvider: getMockedV2PoolProvider(),
    ...overrides,
  });
}

export function getCachedRoutesStub(
  blockNumber: number
): CachedRoutes | undefined {
  return CachedRoutes.fromRoutesWithValidQuotes(
    [getV3RouteWithValidQuoteStub()],
    ChainId.MAINNET,
    USDC,
    DAI,
    [Protocol.V2, Protocol.V3, Protocol.MIXED],
    blockNumber,
    TradeType.EXACT_INPUT,
    '1.1'
  );
}
