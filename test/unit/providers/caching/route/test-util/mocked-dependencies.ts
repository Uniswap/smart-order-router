import { BigNumber } from '@ethersproject/bignumber';
import { Protocol } from '@uniswap/router-sdk';
import { TradeType } from '@uniswap/sdk-core';
import { Pool } from '@uniswap/v3-sdk';
import sinon from 'sinon';
import { ChainId, DAI_MAINNET, USDC_MAINNET, V3Route, V3RouteWithValidQuote } from '../../../../../../build/main';
import {
  CachedRoutes,
  CurrencyAmount,
  DAI_MAINNET as DAI,
  IGasModel,
  USDC_MAINNET as USDC,
  V3PoolProvider
} from '../../../../../../src';
import {
  buildMockV3PoolAccessor,
  DAI_USDT_LOW,
  USDC_DAI_LOW,
  USDC_DAI_MEDIUM,
  USDC_WETH_LOW,
  WETH9_USDT_LOW
} from '../../../../../test-util/mock-data';

export function getMockedV3GasModel(): IGasModel<V3RouteWithValidQuote> {
  const mockV3GasModel = {
    estimateGasCost: sinon.stub(),
  };

  mockV3GasModel.estimateGasCost.callsFake((r) => {
    return {
      gasEstimate: BigNumber.from(10000),
      gasCostInToken: CurrencyAmount.fromRawAmount(r.quoteToken, 0),
      gasCostInUSD: CurrencyAmount.fromRawAmount(USDC, 0),
    };
  });

  return mockV3GasModel;
}

export function getMockedV3PoolProvider(): V3PoolProvider {
  const mockV3PoolProvider = sinon.createStubInstance(V3PoolProvider);

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

  return mockV3PoolProvider;
}

export function getV3RouteWithValidQuoteStub(): V3RouteWithValidQuote {
  const route = new V3Route([USDC_DAI_MEDIUM], USDC_MAINNET, DAI_MAINNET);

  return new V3RouteWithValidQuote({
    amount: CurrencyAmount.fromRawAmount(USDC, 100),
    rawQuote: BigNumber.from(100),
    sqrtPriceX96AfterList: [BigNumber.from(1)],
    initializedTicksCrossedList: [1],
    quoterGasEstimate: BigNumber.from(100000),
    percent: 100,
    route,
    gasModel: getMockedV3GasModel(),
    quoteToken: DAI,
    tradeType: TradeType.EXACT_INPUT,
    v3PoolProvider: getMockedV3PoolProvider(),
  });
}

export function getCachedRoutesStub(blockNumber: number): CachedRoutes | undefined {
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
