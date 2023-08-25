import { partitionMixedRouteByProtocol } from '@uniswap/router-sdk';
import { Currency, CurrencyAmount, Ether, Token } from '@uniswap/sdk-core';
import { Pair } from '@uniswap/v2-sdk';
import { Pool } from '@uniswap/v3-sdk';
import { BigNumber } from 'ethers';
import _ from 'lodash';
import {
  DAI_MAINNET,
  LiquidityCalculationPools,
  MixedRoute,
  MixedRouteWithValidQuote,
  USDC_MAINNET,
  V3PoolProvider,
  WRAPPED_NATIVE_CURRENCY,
} from '../../../../../src';
import { ProviderConfig } from '../../../../../src/providers/provider';
import { MixedRouteHeuristicGasModelFactory } from '../../../../../src/routers/alpha-router/gas-models/mixedRoute/mixed-route-heuristic-gas-model';
import {
  BASE_SWAP_COST as BASE_SWAP_COST_V2,
  COST_PER_EXTRA_HOP as COST_PER_EXTRA_HOP_V2,
} from '../../../../../src/routers/alpha-router/gas-models/v2/v2-heuristic-gas-model';
import {
  BASE_SWAP_COST,
  COST_PER_HOP,
  COST_PER_INIT_TICK,
  COST_PER_UNINIT_TICK,
  NATIVE_OVERHEAD,
  NATIVE_UNWRAP_OVERHEAD,
  NATIVE_WRAP_OVERHEAD,
} from '../../../../../src/routers/alpha-router/gas-models/v3/gas-costs';
import {
  getHighestLiquidityV3NativePool,
  getHighestLiquidityV3USDPool,
} from '../../../../../src/util/gas-factory-helpers';
import {
  USDC_DAI,
  USDC_DAI_MEDIUM,
  USDC_WETH_MEDIUM,
  WETH_DAI,
} from '../../../../test-util/mock-data';
import { getMixedRouteWithValidQuoteStub } from '../../../providers/caching/route/test-util/mocked-dependencies';
import {
  getMockedV2PoolProvider,
  getMockedV3PoolProvider,
} from './test-util/mocked-dependencies';

describe('mixed route gas model tests', () => {
  const gasPriceWei = BigNumber.from(1000000000);
  const chainId = 1;
  const mixedGasModelFactory = new MixedRouteHeuristicGasModelFactory();

  const mockedV3PoolProvider = getMockedV3PoolProvider();
  const mockedV2PoolProvider = getMockedV2PoolProvider();

  // helper function to get pools for building gas model
  async function getPools(
    amountToken: Token,
    quoteToken: Token,
    v3PoolProvider: V3PoolProvider,
    providerConfig: ProviderConfig
  ): Promise<LiquidityCalculationPools> {
    const usdPoolPromise = getHighestLiquidityV3USDPool(
      chainId,
      v3PoolProvider,
      providerConfig
    );
    const nativeCurrency = WRAPPED_NATIVE_CURRENCY[chainId];
    const nativeQuoteTokenV3PoolPromise = !quoteToken.equals(nativeCurrency)
      ? getHighestLiquidityV3NativePool(
          quoteToken,
          v3PoolProvider,
          providerConfig
        )
      : Promise.resolve(null);
    const nativeAmountTokenV3PoolPromise = !amountToken.equals(nativeCurrency)
      ? getHighestLiquidityV3NativePool(
          amountToken,
          v3PoolProvider,
          providerConfig
        )
      : Promise.resolve(null);

    const [usdPool, nativeQuoteTokenV3Pool, nativeAmountTokenV3Pool] =
      await Promise.all([
        usdPoolPromise,
        nativeQuoteTokenV3PoolPromise,
        nativeAmountTokenV3PoolPromise,
      ]);

    const pools: LiquidityCalculationPools = {
      usdPool: usdPool,
      nativeQuoteTokenV3Pool: nativeQuoteTokenV3Pool,
      nativeAmountTokenV3Pool: nativeAmountTokenV3Pool,
    };
    return pools;
  }

  function calculateGasEstimate(routeWithValidQuote: MixedRouteWithValidQuote) {
    // copied from mixed route heuristic gas model
    let baseGasUse = BigNumber.from(0);

    const route = routeWithValidQuote.route;

    const res = partitionMixedRouteByProtocol(route);
    res.map((section: (Pair | Pool)[]) => {
      if (section.every((pool) => pool instanceof Pool)) {
        baseGasUse = baseGasUse.add(BASE_SWAP_COST(chainId));
        baseGasUse = baseGasUse.add(COST_PER_HOP(chainId).mul(section.length));
      } else if (section.every((pool) => pool instanceof Pair)) {
        baseGasUse = baseGasUse.add(BASE_SWAP_COST_V2);
        baseGasUse = baseGasUse.add(
          /// same behavior in v2 heuristic gas model factory
          COST_PER_EXTRA_HOP_V2.mul(section.length - 1)
        );
      }
    });

    const totalInitializedTicksCrossed = BigNumber.from(
      Math.max(1, _.sum(routeWithValidQuote.initializedTicksCrossedList))
    );

    const tickGasUse = COST_PER_INIT_TICK(chainId).mul(
      totalInitializedTicksCrossed
    );
    const uninitializedTickGasUse = COST_PER_UNINIT_TICK.mul(0);

    // base estimate gas used based on chainId estimates for hops and ticks gas useage
    baseGasUse = baseGasUse.add(tickGasUse).add(uninitializedTickGasUse);
    return baseGasUse;
  }

  it('returns correct gas estimate for a mixed route | hops: 2 | ticks 1', async () => {
    const amountToken = USDC_MAINNET;
    const quoteToken = DAI_MAINNET;

    const pools = await getPools(
      amountToken,
      quoteToken,
      mockedV3PoolProvider,
      {}
    );

    const mixedGasModel = await mixedGasModelFactory.buildGasModel({
      chainId: chainId,
      gasPriceWei,
      pools,
      amountToken,
      quoteToken,
      v2poolProvider: mockedV2PoolProvider,
      providerConfig: {},
    });

    const mixedRouteWithQuote = getMixedRouteWithValidQuoteStub({
      mixedRouteGasModel: mixedGasModel,
      initializedTicksCrossedList: [1],
    });

    const { gasEstimate } = mixedGasModel.estimateGasCost(mixedRouteWithQuote);
    const expectedGasCost = calculateGasEstimate(mixedRouteWithQuote);

    expect(gasEstimate.toNumber()).toEqual(expectedGasCost.toNumber());
  });

  it('applies overhead when token in is native eth', async () => {
    const amountToken = Ether.onChain(1) as Currency;
    const quoteToken = DAI_MAINNET;

    const pools = await getPools(
      amountToken.wrapped,
      quoteToken,
      mockedV3PoolProvider,
      {}
    );

    const mixedGasModel = await mixedGasModelFactory.buildGasModel({
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

    const mixedRouteWithQuote = getMixedRouteWithValidQuoteStub({
      amount: CurrencyAmount.fromRawAmount(amountToken, 1),
      mixedRouteGasModel: mixedGasModel,
      route: new MixedRoute(
        [USDC_WETH_MEDIUM, USDC_DAI],
        WRAPPED_NATIVE_CURRENCY[1],
        DAI_MAINNET
      ),
      quoteToken: DAI_MAINNET,
      initializedTicksCrossedList: [1],
    });

    const { gasEstimate } = mixedGasModel.estimateGasCost(mixedRouteWithQuote);
    const expectedGasCost = calculateGasEstimate(mixedRouteWithQuote).add(
      NATIVE_WRAP_OVERHEAD(chainId)
    );

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

    const mixedGasModel = await mixedGasModelFactory.buildGasModel({
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

    const mixedRouteWithQuote = getMixedRouteWithValidQuoteStub({
      amount: CurrencyAmount.fromRawAmount(amountToken, 100),
      mixedRouteGasModel: mixedGasModel,
      route: new MixedRoute(
        [USDC_DAI_MEDIUM, WETH_DAI],
        USDC_MAINNET,
        WRAPPED_NATIVE_CURRENCY[1]
      ),
      quoteToken: WRAPPED_NATIVE_CURRENCY[1],
      initializedTicksCrossedList: [1],
    });

    const { gasEstimate } = mixedGasModel.estimateGasCost(mixedRouteWithQuote);
    const expectedGasCost = calculateGasEstimate(mixedRouteWithQuote).add(
      NATIVE_UNWRAP_OVERHEAD(chainId)
    );

    expect(gasEstimate.toNumber()).toEqual(expectedGasCost.toNumber());
  });

  // TODO: splits, multiple hops, token overheads, gasCostInToken, gasCostInUSD
});
