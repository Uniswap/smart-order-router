import { Currency, Ether } from '@uniswap/sdk-core';
import { BigNumber } from 'ethers';
import { DAI_MAINNET, V2Route } from '../../../../../src';
import {
  BASE_SWAP_COST,
  COST_PER_EXTRA_HOP,
  V2HeuristicGasModelFactory,
} from '../../../../../src/routers/alpha-router/gas-models/v2/v2-heuristic-gas-model';
import {
  NATIVE_OVERHEAD,
  NATIVE_WRAP_OVERHEAD,
} from '../../../../../src/routers/alpha-router/gas-models/v3/gas-costs';
import { WETH_DAI } from '../../../../test-util/mock-data';
import { getV2RouteWithValidQuoteStub } from '../../../providers/caching/route/test-util/mocked-dependencies';
import { getMockedV2PoolProvider } from './test-util/mocked-dependencies';

describe('v2 gas model tests', () => {
  const gasPriceWei = BigNumber.from(1000000000);
  const chainId = 1;
  const v2GasModelFactory = new V2HeuristicGasModelFactory();

  const mockedV2PoolProvider = getMockedV2PoolProvider();

  it('returns correct gas estimate for a v2 route | hops: 1', async () => {
    const quoteToken = DAI_MAINNET;

    const v2GasModel = await v2GasModelFactory.buildGasModel({
      chainId: chainId,
      gasPriceWei,
      poolProvider: mockedV2PoolProvider,
      token: quoteToken,
      providerConfig: {},
    });

    const v2RouteWithQuote = getV2RouteWithValidQuoteStub({
      gasModel: v2GasModel,
    });

    const { gasEstimate } = v2GasModel.estimateGasCost(v2RouteWithQuote);

    const hops = v2RouteWithQuote.route.pairs.length;
    let expectedGasCost = BASE_SWAP_COST.add(COST_PER_EXTRA_HOP.mul(hops - 1));

    expect(gasEstimate.toNumber()).toEqual(expectedGasCost.toNumber());
  });

  it('applies overhead when token in is native eth', async () => {
    const amountToken = Ether.onChain(1) as Currency;
    const quoteToken = DAI_MAINNET;

    const v2GasModel = await v2GasModelFactory.buildGasModel({
      chainId: chainId,
      gasPriceWei,
      poolProvider: mockedV2PoolProvider,
      token: quoteToken,
      providerConfig: {
        additionalGasOverhead: NATIVE_OVERHEAD(
          chainId,
          amountToken,
          quoteToken
        ),
      },
    });

    expect(
      NATIVE_OVERHEAD(chainId, amountToken, quoteToken).eq(
        NATIVE_WRAP_OVERHEAD(chainId)
      )
    ).toBe(true);

    const v2RouteWithQuote = getV2RouteWithValidQuoteStub({
      route: new V2Route([WETH_DAI], amountToken.wrapped, quoteToken),
      gasModel: v2GasModel,
    });

    const { gasEstimate } = v2GasModel.estimateGasCost(v2RouteWithQuote);

    const hops = v2RouteWithQuote.route.pairs.length;
    let expectedGasCost = BASE_SWAP_COST.add(
      COST_PER_EXTRA_HOP.mul(hops - 1)
    ).add(NATIVE_WRAP_OVERHEAD(chainId));

    expect(gasEstimate.toNumber()).toEqual(expectedGasCost.toNumber());
  });

  // TODO: splits, multiple hops, token overheads, gasCostInToken, gasCostInUSD
});
