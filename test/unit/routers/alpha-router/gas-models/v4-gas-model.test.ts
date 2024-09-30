import { BigNumber } from 'ethers';
import {
  DAI_MAINNET,
  nativeOnChain,
  USDC_MAINNET, V4Route, WRAPPED_NATIVE_CURRENCY
} from '../../../../../src';
import sinon from 'sinon';
import { BaseProvider } from '@ethersproject/providers';
import { V4HeuristicGasModelFactory } from '../../../../../src/routers/alpha-router/gas-models/v4/v4-heuristic-gas-model';
import {
  getMockedV2PoolProvider,
  getMockedV3PoolProvider
} from './test-util/mocked-dependencies';
import { getPools } from './test-util/helpers';
import {
  getV4RouteWithValidQuoteStub
} from '../../../providers/caching/route/test-util/mocked-dependencies';
import { Currency, CurrencyAmount, Ether } from '@uniswap/sdk-core';
import {
  NATIVE_OVERHEAD
} from '../../../../../src/routers/alpha-router/gas-models/gas-costs';
import {
  USDC_WETH_V4_LOW
} from '../../../../test-util/mock-data';

describe('v3 gas model tests', () => {
  const gasPriceWei = BigNumber.from(1000000000);
  const chainId = 1;
  const v4GasModelFactory = new V4HeuristicGasModelFactory(sinon.createStubInstance(BaseProvider), nativeOnChain(chainId));

  const mockedV3PoolProvider = getMockedV3PoolProvider();
  const mockedV2PoolProvider = getMockedV2PoolProvider();

  it('returns correct gas estimate for a v4 route | hops: 1 | ticks 1', async () => {
    const amountToken = USDC_MAINNET;
    const quoteToken = DAI_MAINNET;

    const pools = await getPools(
      amountToken,
      quoteToken,
      mockedV3PoolProvider,
      {},
    );

    const v4GasModel = await v4GasModelFactory.buildGasModel({
      chainId: chainId,
      gasPriceWei,
      pools,
      amountToken,
      quoteToken,
      v2poolProvider: mockedV2PoolProvider,
      l2GasDataProvider: undefined,
      providerConfig: {},
    });

    const v4RouteWithQuote = getV4RouteWithValidQuoteStub({
      gasModel: v4GasModel,
      initializedTicksCrossedList: [1],
    });

    for (let i = 0; i < v4RouteWithQuote.initializedTicksCrossedList.length; i++) {
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      if (v4RouteWithQuote.initializedTicksCrossedList[i]! > 0) {
      }
    }

    const { gasEstimate } = v4GasModel.estimateGasCost(v4RouteWithQuote);

    const expectedGasCost = v4RouteWithQuote.quoterGasEstimate;

    expect(gasEstimate.toNumber()).toEqual(expectedGasCost.toNumber());
  });

  it('no need to apply overhead when token in is native eth for v4 routing', async () => {
    const amountToken = Ether.onChain(1) as Currency;
    const quoteToken = USDC_MAINNET;

    const pools = await getPools(
      amountToken.wrapped,
      quoteToken,
      mockedV3PoolProvider,
      {}
    );

    const v4GasModel = await v4GasModelFactory.buildGasModel({
      chainId: chainId,
      gasPriceWei,
      pools,
      amountToken: amountToken.wrapped,
      quoteToken,
      v2poolProvider: mockedV2PoolProvider,
      l2GasDataProvider: undefined,
      providerConfig: {
        additionalGasOverhead: NATIVE_OVERHEAD(
          chainId,
          amountToken,
          quoteToken
        ),
      },
    });

    const v4RouteWithQuote = getV4RouteWithValidQuoteStub({
      amount: CurrencyAmount.fromRawAmount(amountToken, 1),
      gasModel: v4GasModel,
      route: new V4Route(
        [USDC_WETH_V4_LOW],
        WRAPPED_NATIVE_CURRENCY[1],
        USDC_MAINNET
      ),
      quoteToken: USDC_MAINNET,
      initializedTicksCrossedList: [1],
    });

    const { gasEstimate } = v4GasModel.estimateGasCost(v4RouteWithQuote);

    const expectedGasCost = v4RouteWithQuote.quoterGasEstimate;

    expect(gasEstimate.toNumber()).toEqual(expectedGasCost.toNumber());
  });

  it('no need to apply overhead when token in is native eth for v4 routing', async () => {
    const amountToken = Ether.onChain(1) as Currency;
    const quoteToken = USDC_MAINNET;

    const pools = await getPools(
      amountToken.wrapped,
      quoteToken,
      mockedV3PoolProvider,
      {}
    );

    const v4GasModel = await v4GasModelFactory.buildGasModel({
      chainId: chainId,
      gasPriceWei,
      pools,
      amountToken: amountToken.wrapped,
      quoteToken,
      v2poolProvider: mockedV2PoolProvider,
      l2GasDataProvider: undefined,
      providerConfig: {
        additionalGasOverhead: NATIVE_OVERHEAD(
          chainId,
          amountToken,
          quoteToken
        ),
      },
    });

    const v4RouteWithQuote = getV4RouteWithValidQuoteStub({
      amount: CurrencyAmount.fromRawAmount(amountToken, 1),
      gasModel: v4GasModel,
      route: new V4Route(
        [USDC_WETH_V4_LOW],
        WRAPPED_NATIVE_CURRENCY[1],
        USDC_MAINNET
      ),
      quoteToken: USDC_MAINNET,
      initializedTicksCrossedList: [1],
    });

    const { gasEstimate } = v4GasModel.estimateGasCost(v4RouteWithQuote);

    const expectedGasCost = v4RouteWithQuote.quoterGasEstimate;

    expect(gasEstimate.toNumber()).toEqual(expectedGasCost.toNumber());
  });

  it('no need to apply overhead when token out is native eth', async () => {
    const amountToken = USDC_MAINNET;
    const quoteToken = Ether.onChain(1) as Currency;

    const pools = await getPools(
      amountToken,
      quoteToken.wrapped,
      mockedV3PoolProvider,
      {}
    );

    const v4GasModel = await v4GasModelFactory.buildGasModel({
      chainId: chainId,
      gasPriceWei,
      pools,
      amountToken,
      quoteToken: quoteToken.wrapped,
      v2poolProvider: mockedV2PoolProvider,
      l2GasDataProvider: undefined,
      providerConfig: {
        additionalGasOverhead: NATIVE_OVERHEAD(
          chainId,
          amountToken,
          quoteToken
        ),
      },
    });

    const v4RouteWithQuote = getV4RouteWithValidQuoteStub({
      amount: CurrencyAmount.fromRawAmount(amountToken, 100),
      gasModel: v4GasModel,
      route: new V4Route(
        [USDC_WETH_V4_LOW],
        USDC_MAINNET,
        WRAPPED_NATIVE_CURRENCY[1]
      ),
      quoteToken: WRAPPED_NATIVE_CURRENCY[1],
      initializedTicksCrossedList: [1],
    });

    const { gasEstimate } = v4GasModel.estimateGasCost(v4RouteWithQuote);

    const expectedGasCost = v4RouteWithQuote.quoterGasEstimate;

    expect(gasEstimate.toNumber()).toEqual(expectedGasCost.toNumber());
  });
});
