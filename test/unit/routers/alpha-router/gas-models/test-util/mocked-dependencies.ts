import { BigNumber } from '@ethersproject/bignumber';
import { Pair } from '@uniswap/v2-sdk';
import { Pool } from '@uniswap/v3-sdk';
import sinon from 'sinon';
import { V3RouteWithValidQuote } from '../../../../../../build/main';
import {
  CurrencyAmount,
  IGasModel,
  MixedRouteWithValidQuote,
  USDC_MAINNET as USDC,
  V2PoolProvider,
  V2RouteWithValidQuote,
  V3PoolProvider,
} from '../../../../../../src';
import {
  buildMockV2PoolAccessor,
  buildMockV3PoolAccessor,
  DAI_USDT,
  DAI_USDT_LOW,
  USDC_DAI,
  USDC_DAI_LOW,
  USDC_DAI_MEDIUM,
  USDC_USDT_MEDIUM,
  USDC_WETH,
  USDC_WETH_LOW,
  WBTC_WETH,
  WETH9_USDT_LOW,
  WETH_USDT,
} from '../../../../../test-util/mock-data';

export function getMockedMixedGasModel(): IGasModel<MixedRouteWithValidQuote> {
  const mockMixedGasModel = {
    estimateGasCost: sinon.stub(),
  };

  mockMixedGasModel.estimateGasCost.callsFake((r) => {
    return {
      gasEstimate: BigNumber.from(10000),
      gasCostInToken: CurrencyAmount.fromRawAmount(r.quoteToken, 0),
      gasCostInUSD: CurrencyAmount.fromRawAmount(USDC, 0),
    };
  });

  return mockMixedGasModel;
}

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
    USDC_USDT_MEDIUM,
  ];

  mockV3PoolProvider.getPools.resolves(buildMockV3PoolAccessor(v3MockPools));
  mockV3PoolProvider.getPoolAddress.callsFake((tA, tB, fee) => ({
    poolAddress: Pool.getAddress(tA, tB, fee),
    token0: tA,
    token1: tB,
  }));

  return mockV3PoolProvider;
}

export function getMockedV2GasModel(): IGasModel<V2RouteWithValidQuote> {
  const mockV2GasModel = {
    estimateGasCost: sinon.stub(),
  };

  mockV2GasModel.estimateGasCost.callsFake((r) => {
    return {
      gasEstimate: BigNumber.from(10000),
      gasCostInToken: CurrencyAmount.fromRawAmount(r.quoteToken, 0),
      gasCostInUSD: CurrencyAmount.fromRawAmount(USDC, 0),
    };
  });

  return mockV2GasModel;
}

export function getMockedV2PoolProvider(): V2PoolProvider {
  const mockV2PoolProvider = sinon.createStubInstance(V2PoolProvider);
  const v2MockPools = [DAI_USDT, USDC_WETH, WETH_USDT, USDC_DAI, WBTC_WETH];
  mockV2PoolProvider.getPools.resolves(buildMockV2PoolAccessor(v2MockPools));
  mockV2PoolProvider.getPoolAddress.callsFake((tA, tB) => ({
    poolAddress: Pair.getAddress(tA, tB),
    token0: tA,
    token1: tB,
  }));
  return mockV2PoolProvider;
}
