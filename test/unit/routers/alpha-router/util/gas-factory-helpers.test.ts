import sinon from 'sinon';
import {
  CurrencyAmount,
  DAI_MAINNET,
  SimulationStatus,
  SwapRoute,
  USDC_MAINNET,
  V3HeuristicGasModelFactory,
  V3PoolProvider,
  V3Route,
  V3RouteWithValidQuote,
  WRAPPED_NATIVE_CURRENCY,
} from '../../../../../src';
import {
  calculateGasUsed,
  getHighestLiquidityV3NativePool,
  getHighestLiquidityV3USDPool,
} from '../../../../../src/util/gas-factory-helpers';
import {
  buildMockV3PoolAccessor,
  DAI_WETH_MEDIUM,
  USDC_DAI_LOW,
  USDC_WETH_HIGH_LIQ_HIGH,
  USDC_WETH_LOW_LIQ_LOW,
  USDC_WETH_MED_LIQ_MEDIUM,
} from '../../../../test-util/mock-data';
import { BigNumber } from 'ethers';
import { getMockedV2PoolProvider, getMockedV3PoolProvider } from '../gas-models/test-util/mocked-dependencies';
import { TradeType } from '@uniswap/sdk-core';
import { Trade } from '@uniswap/router-sdk';
import { Route } from '@uniswap/v3-sdk';
import { getPools } from '../gas-models/test-util/helpers';
import { ArbitrumGasData } from '../../../../../src/providers/v3/gas-data-provider';

const mockUSDCNativePools = [
  USDC_WETH_LOW_LIQ_LOW,
  USDC_WETH_MED_LIQ_MEDIUM,
  USDC_WETH_HIGH_LIQ_HIGH,
];

const mockGasTokenNativePools = [
  DAI_WETH_MEDIUM
]

describe('gas factory helpers tests', () => {
  const gasPriceWei = BigNumber.from(1000000000); // 1 gwei
  const chainId = 1;
  let mockPoolProvider: sinon.SinonStubbedInstance<V3PoolProvider>;

  beforeEach(() => {
    mockPoolProvider = sinon.createStubInstance(V3PoolProvider);
    mockPoolProvider.getPools.resolves(
      buildMockV3PoolAccessor([
        ...mockUSDCNativePools,
        ...mockGasTokenNativePools,
      ])
    );
  });

  describe('getHighestLiquidityV3NativePool', () => {
    it('should return the highest native liquidity pool', async () => {
      const nativeAmountPool = await getHighestLiquidityV3NativePool(
        USDC_MAINNET,
        mockPoolProvider as unknown as V3PoolProvider
      );
      expect(nativeAmountPool).toStrictEqual(USDC_WETH_HIGH_LIQ_HIGH);
    });

    it('should return null if there are no native pools with the specified token', async () => {
      const mockPoolProvider = sinon.createStubInstance(V3PoolProvider);
      mockPoolProvider.getPools.resolves(
        buildMockV3PoolAccessor([USDC_DAI_LOW])
      );
      const nativeAmountPool = await getHighestLiquidityV3NativePool(
        USDC_MAINNET,
        mockPoolProvider as unknown as V3PoolProvider
      );
      expect(nativeAmountPool).toBeNull();
    });
  });

  describe('getHighestLiquidityV3USDPool', () => {
    it('should return the highest usd liquidity pool', async () => {
      const usdPool = await getHighestLiquidityV3USDPool(
        1,
        mockPoolProvider as unknown as V3PoolProvider
      );
      expect(usdPool).toStrictEqual(USDC_WETH_HIGH_LIQ_HIGH);
    });

    it('should throw error if there are no usd native pools', async () => {
      const mockPoolProvider = sinon.createStubInstance(V3PoolProvider);
      mockPoolProvider.getPools.resolves(
        buildMockV3PoolAccessor([USDC_DAI_LOW])
      );
      await expect(
        getHighestLiquidityV3USDPool(
          1,
          mockPoolProvider as unknown as V3PoolProvider
        )
      ).rejects.toThrowError(
        `Could not find a USD/${WRAPPED_NATIVE_CURRENCY[1].symbol} pool for computing gas costs.`
      );
    });
  });

  describe('calculateGasUsed', () => {
    it('should return correct estimated gas values and quoteGasAdjusted', async () => {
      const mockPoolProvider = getMockedV3PoolProvider();

      const amountToken = WRAPPED_NATIVE_CURRENCY[1];
      const quoteToken = DAI_MAINNET;
      const gasToken = USDC_MAINNET;
      const providerConfig = {
        gasToken
      }

      const pools = await getPools(
        amountToken,
        quoteToken,
        mockPoolProvider,
        providerConfig,
        gasToken
      );

      const v3GasModel = await (new V3HeuristicGasModelFactory()).buildGasModel({
        chainId: chainId,
        gasPriceWei,
        pools,
        amountToken,
        quoteToken,
        v2poolProvider: getMockedV2PoolProvider(),
        l2GasDataProvider: undefined,
        providerConfig
      });

      const mockSwapRoute: SwapRoute = {
        quote: CurrencyAmount.fromRawAmount(quoteToken, 100),
        quoteGasAdjusted: CurrencyAmount.fromRawAmount(quoteToken, 100),
        // these are all 0 before the function is called
        estimatedGasUsed: BigNumber.from(0),
        estimatedGasUsedQuoteToken: CurrencyAmount.fromRawAmount(quoteToken, 0),
        estimatedGasUsedUSD: CurrencyAmount.fromRawAmount(quoteToken, 0),
        estimatedGasUsedGasToken: undefined,
        gasPriceWei,
        trade: new Trade({
          v3Routes: [{
            routev3: new Route([DAI_WETH_MEDIUM], amountToken, quoteToken),
            inputAmount: CurrencyAmount.fromRawAmount(amountToken, 1),
            outputAmount: CurrencyAmount.fromRawAmount(quoteToken, 100),
          }],
          v2Routes: [],
          mixedRoutes: [],
          tradeType: TradeType.EXACT_INPUT,
        }),
        route: [new V3RouteWithValidQuote({
          amount: CurrencyAmount.fromRawAmount(amountToken, 1),
          rawQuote: BigNumber.from('100'),
          quoteToken,
          sqrtPriceX96AfterList: [],
          initializedTicksCrossedList: [1],
          quoterGasEstimate: BigNumber.from(100000),
          percent: 100,
          route: new V3Route([DAI_WETH_MEDIUM], amountToken, quoteToken),
          tradeType: TradeType.EXACT_INPUT,
          v3PoolProvider: mockPoolProvider,
          gasModel: v3GasModel,
        })],
        blockNumber: BigNumber.from(123456),
        simulationStatus: SimulationStatus.Succeeded,
        methodParameters: {
          calldata: '0x0',
          value: '0x0',
          to: '0x0',
        },
      };

      const simulatedGasUsed = BigNumber.from(100_000);

      const {
        estimatedGasUsedQuoteToken,
        estimatedGasUsedUSD,
        estimatedGasUsedGasToken,
        quoteGasAdjusted
      } = await calculateGasUsed(chainId, mockSwapRoute, simulatedGasUsed, getMockedV2PoolProvider(), mockPoolProvider, undefined, providerConfig);

      expect(estimatedGasUsedQuoteToken.currency.equals(quoteToken)).toBe(true);
      expect(estimatedGasUsedQuoteToken.toExact()).not.toEqual('0');
      expect(estimatedGasUsedUSD.toExact()).not.toEqual('0');
      expect(estimatedGasUsedGasToken?.currency.equals(gasToken)).toBe(true);
      expect(estimatedGasUsedGasToken?.toExact()).not.toEqual('0');
      expect(quoteGasAdjusted.lessThan(mockSwapRoute.quote)).toBe(true);

      const arbGasData: ArbitrumGasData = {
        perL2TxFee: BigNumber.from(1_000_000),
        perL1CalldataFee: BigNumber.from(1_000),
        perArbGasTotal: BigNumber.from(1_000_000_000),
      }

      const {
        estimatedGasUsedQuoteToken: estimatedGasUsedQuoteTokenArb,
        estimatedGasUsedUSD: estimatedGasUsedUSDArb,
        estimatedGasUsedGasToken: estimatedGasUsedGasTokenArb,
        quoteGasAdjusted: quoteGasAdjustedArb
      } = await calculateGasUsed(chainId, mockSwapRoute, simulatedGasUsed, getMockedV2PoolProvider(), mockPoolProvider, arbGasData, providerConfig);

      // Arbitrum gas data should not affect the quote gas or USD amounts
      expect(estimatedGasUsedQuoteTokenArb.currency.equals(quoteToken)).toBe(true);
      expect(estimatedGasUsedUSDArb.equalTo(estimatedGasUsedUSD)).toBe(true);
      expect(estimatedGasUsedGasTokenArb?.currency.equals(gasToken)).toBe(true);
      expect(quoteGasAdjustedArb.equalTo(quoteGasAdjusted)).toBe(true);
    })
  })
});
