import { Currency, CurrencyAmount, Ether } from '@uniswap/sdk-core';
import { BigNumber } from 'ethers';
import _ from 'lodash';
import {
  DAI_MAINNET,
  UNI_MAINNET,
  USDC_MAINNET,
  V3HeuristicGasModelFactory,
  V3Route,
  WRAPPED_NATIVE_CURRENCY,
} from '../../../../../src';
import {
  BASE_SWAP_COST,
  COST_PER_HOP,
  COST_PER_INIT_TICK,
  NATIVE_OVERHEAD,
  NATIVE_UNWRAP_OVERHEAD,
  NATIVE_WRAP_OVERHEAD,
  SINGLE_HOP_OVERHEAD,
} from '../../../../../src/routers/alpha-router/gas-models/v3/gas-costs';
import {
  DAI_USDT_LOW,
  DAI_WETH_MEDIUM,
  UNI_WETH_MEDIUM,
  USDC_USDT_MEDIUM,
  USDC_WETH_MEDIUM,
} from '../../../../test-util/mock-data';
import { getV3RouteWithValidQuoteStub } from '../../../providers/caching/route/test-util/mocked-dependencies';
import {
  getMockedV2PoolProvider,
  getMockedV3PoolProvider,
} from './test-util/mocked-dependencies';
import { getPools } from './test-util/helpers';

describe('v3 gas model tests', () => {
  const gasPriceWei = BigNumber.from(1000000000);
  const chainId = 1;
  const v3GasModelFactory = new V3HeuristicGasModelFactory();

  const mockedV3PoolProvider = getMockedV3PoolProvider();
  const mockedV2PoolProvider = getMockedV2PoolProvider();

  it('returns correct gas estimate for a v3 route | hops: 1 | ticks 1', async () => {
    const amountToken = USDC_MAINNET;
    const quoteToken = DAI_MAINNET;

    const pools = await getPools(
      amountToken,
      quoteToken,
      mockedV3PoolProvider,
      {},
    );

    const v3GasModel = await v3GasModelFactory.buildGasModel({
      chainId: chainId,
      gasPriceWei,
      pools,
      amountToken,
      quoteToken,
      v2poolProvider: mockedV2PoolProvider,
      l2GasDataProvider: undefined,
      providerConfig: {},
    });

    const v3RouteWithQuote = getV3RouteWithValidQuoteStub({
      gasModel: v3GasModel,
      initializedTicksCrossedList: [1],
    });

    const totalInitializedTicksCrossed = BigNumber.from(
      Math.max(1, _.sum(v3RouteWithQuote.initializedTicksCrossedList))
    );

    const gasOverheadFromTicks = COST_PER_INIT_TICK(chainId).mul(
      totalInitializedTicksCrossed
    );

    const { gasEstimate } = v3GasModel.estimateGasCost(v3RouteWithQuote);

    const expectedGasCost = BASE_SWAP_COST(chainId)
      .add(COST_PER_HOP(chainId))
      .add(SINGLE_HOP_OVERHEAD(chainId))
      .add(gasOverheadFromTicks);

    expect(gasEstimate.toNumber()).toEqual(expectedGasCost.toNumber());
  });

  it('returns correct gas estimate for a v3 route | hops: 2 | ticks 1', async () => {
    const amountToken = USDC_MAINNET;
    const quoteToken = DAI_MAINNET;

    const pools = await getPools(
      amountToken,
      quoteToken,
      mockedV3PoolProvider,
      {}
    );

    const v3GasModel = await v3GasModelFactory.buildGasModel({
      chainId: chainId,
      gasPriceWei,
      pools,
      amountToken,
      quoteToken,
      v2poolProvider: mockedV2PoolProvider,
      l2GasDataProvider: undefined,
      providerConfig: {},
    });

    const v3RouteWithQuote = getV3RouteWithValidQuoteStub({
      gasModel: v3GasModel,
      route: new V3Route(
        [USDC_USDT_MEDIUM, DAI_USDT_LOW],
        USDC_MAINNET,
        DAI_MAINNET
      ),
      sqrtPriceX96AfterList: [BigNumber.from(100), BigNumber.from(100)],
      initializedTicksCrossedList: [0, 1],
    });

    const totalInitializedTicksCrossed = BigNumber.from(
      Math.max(1, _.sum(v3RouteWithQuote.initializedTicksCrossedList))
    );

    const gasOverheadFromHops = COST_PER_HOP(chainId).mul(
      v3RouteWithQuote.route.pools.length
    );
    const gasOverheadFromTicks = COST_PER_INIT_TICK(chainId).mul(
      totalInitializedTicksCrossed
    );

    const { gasEstimate } = v3GasModel.estimateGasCost(v3RouteWithQuote);

    const expectedGasCost = BASE_SWAP_COST(chainId)
      .add(gasOverheadFromHops)
      .add(gasOverheadFromTicks);

    expect(gasEstimate.toNumber()).toEqual(expectedGasCost.toNumber());
  });

  it('applies overhead when token in is native eth', async () => {
    const amountToken = Ether.onChain(1) as Currency;
    const quoteToken = USDC_MAINNET;

    const pools = await getPools(
      amountToken.wrapped,
      quoteToken,
      mockedV3PoolProvider,
      {}
    );

    const v3GasModel = await v3GasModelFactory.buildGasModel({
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

    const v3RouteWithQuote = getV3RouteWithValidQuoteStub({
      amount: CurrencyAmount.fromRawAmount(amountToken, 1),
      gasModel: v3GasModel,
      route: new V3Route(
        [USDC_WETH_MEDIUM],
        WRAPPED_NATIVE_CURRENCY[1],
        USDC_MAINNET
      ),
      quoteToken: USDC_MAINNET,
      initializedTicksCrossedList: [1],
    });

    const totalInitializedTicksCrossed = BigNumber.from(
      Math.max(1, _.sum(v3RouteWithQuote.initializedTicksCrossedList))
    );

    const gasOverheadFromHops = COST_PER_HOP(chainId).mul(
      v3RouteWithQuote.route.pools.length
    );
    const gasOverheadFromTicks = COST_PER_INIT_TICK(chainId).mul(
      totalInitializedTicksCrossed
    );

    const { gasEstimate } = v3GasModel.estimateGasCost(v3RouteWithQuote);

    const expectedGasCost = BASE_SWAP_COST(chainId)
      .add(gasOverheadFromHops)
      .add(gasOverheadFromTicks)
      .add(SINGLE_HOP_OVERHEAD(chainId))
      .add(NATIVE_WRAP_OVERHEAD(chainId));

    expect(gasEstimate.toNumber()).toEqual(expectedGasCost.toNumber());
  });

  it('applies overhead when token out is native eth', async () => {
    const amountToken = USDC_MAINNET;
    const quoteToken = Ether.onChain(1) as Currency;

    const pools = await getPools(
      amountToken,
      quoteToken.wrapped,
      mockedV3PoolProvider,
      {}
    );

    const v3GasModel = await v3GasModelFactory.buildGasModel({
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

    const v3RouteWithQuote = getV3RouteWithValidQuoteStub({
      amount: CurrencyAmount.fromRawAmount(amountToken, 100),
      gasModel: v3GasModel,
      route: new V3Route(
        [USDC_WETH_MEDIUM],
        USDC_MAINNET,
        WRAPPED_NATIVE_CURRENCY[1]
      ),
      quoteToken: WRAPPED_NATIVE_CURRENCY[1],
      initializedTicksCrossedList: [1],
    });

    const totalInitializedTicksCrossed = BigNumber.from(
      Math.max(1, _.sum(v3RouteWithQuote.initializedTicksCrossedList))
    );

    const gasOverheadFromHops = COST_PER_HOP(chainId).mul(
      v3RouteWithQuote.route.pools.length
    );
    const gasOverheadFromTicks = COST_PER_INIT_TICK(chainId).mul(
      totalInitializedTicksCrossed
    );

    const { gasEstimate } = v3GasModel.estimateGasCost(v3RouteWithQuote);

    const expectedGasCost = BASE_SWAP_COST(chainId)
      .add(gasOverheadFromHops)
      .add(gasOverheadFromTicks)
      .add(SINGLE_HOP_OVERHEAD(chainId))
      .add(NATIVE_UNWRAP_OVERHEAD(chainId));

    expect(gasEstimate.toNumber()).toEqual(expectedGasCost.toNumber());
  });

  it('returns gas estimate for specified gasToken', async () => {
    // copied from `returns correct gas estimate for a v3 route | hops: 1 | ticks 1` test above

    const amountToken = USDC_MAINNET;
    const quoteToken = DAI_MAINNET;
    const gasToken = UNI_MAINNET
    const providerConfig = {
      gasToken
    }

    const pools = await getPools(
      amountToken,
      quoteToken,
      mockedV3PoolProvider,
      providerConfig,
      gasToken
    );

    expect(pools.nativeAndSpecifiedGasTokenV3Pool).toStrictEqual(UNI_WETH_MEDIUM);

    const v3GasModel = await v3GasModelFactory.buildGasModel({
      chainId: chainId,
      gasPriceWei,
      pools,
      amountToken,
      quoteToken,
      v2poolProvider: mockedV2PoolProvider,
      l2GasDataProvider: undefined,
      providerConfig
    });

    const v3RouteWithQuote = getV3RouteWithValidQuoteStub({
      gasModel: v3GasModel,
      initializedTicksCrossedList: [1],
    });

    const totalInitializedTicksCrossed = BigNumber.from(
      Math.max(1, _.sum(v3RouteWithQuote.initializedTicksCrossedList))
    );

    const gasOverheadFromTicks = COST_PER_INIT_TICK(chainId).mul(
      totalInitializedTicksCrossed
    );

    const { gasEstimate, gasCostInToken, gasCostInUSD, gasCostInGasToken } = v3GasModel.estimateGasCost(v3RouteWithQuote);

    const expectedGasCost = BASE_SWAP_COST(chainId)
      .add(COST_PER_HOP(chainId))
      .add(SINGLE_HOP_OVERHEAD(chainId))
      .add(gasOverheadFromTicks);

    expect(gasEstimate.toNumber()).toEqual(expectedGasCost.toNumber());
    expect(gasCostInToken).toBeDefined();
    expect(gasCostInUSD).toBeDefined();
    expect(gasCostInGasToken).toBeDefined();
  })

  it('if gasToken == quoteToken returned values are equal', async () => {
    // copied from `returns correct gas estimate for a v3 route | hops: 1 | ticks 1` test above
    const amountToken = USDC_MAINNET;
    const quoteToken = DAI_MAINNET;
    const gasToken = DAI_MAINNET // same as quoteToken
    const providerConfig = {
      gasToken
    }

    const pools = await getPools(
      amountToken,
      quoteToken,
      mockedV3PoolProvider,
      providerConfig,
      gasToken
    );

    expect(pools.nativeAndSpecifiedGasTokenV3Pool).toStrictEqual(DAI_WETH_MEDIUM);

    const v3GasModel = await v3GasModelFactory.buildGasModel({
      chainId: chainId,
      gasPriceWei,
      pools,
      amountToken,
      quoteToken,
      v2poolProvider: mockedV2PoolProvider,
      l2GasDataProvider: undefined,
      providerConfig
    });

    const v3RouteWithQuote = getV3RouteWithValidQuoteStub({
      gasModel: v3GasModel,
      initializedTicksCrossedList: [1],
    });

    const totalInitializedTicksCrossed = BigNumber.from(
      Math.max(1, _.sum(v3RouteWithQuote.initializedTicksCrossedList))
    );

    const gasOverheadFromTicks = COST_PER_INIT_TICK(chainId).mul(
      totalInitializedTicksCrossed
    );

    const { gasEstimate, gasCostInToken, gasCostInUSD, gasCostInGasToken } = v3GasModel.estimateGasCost(v3RouteWithQuote);

    const expectedGasCost = BASE_SWAP_COST(chainId)
      .add(COST_PER_HOP(chainId))
      .add(SINGLE_HOP_OVERHEAD(chainId))
      .add(gasOverheadFromTicks);

    expect(gasEstimate.toNumber()).toEqual(expectedGasCost.toNumber());
    expect(gasCostInToken).toBeDefined();
    expect(gasCostInUSD).toBeDefined();
    expect(gasCostInGasToken).toBeDefined();
    expect(gasCostInToken.equalTo(gasCostInGasToken!)).toBeTruthy();
  })

  // TODO: splits, multiple hops, token overheads, gasCostInToken, gasCostInUSD
});
