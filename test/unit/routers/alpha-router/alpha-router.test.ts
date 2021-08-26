import { Fraction, Percent } from '@uniswap/sdk-core';
import { Pool } from '@uniswap/v3-sdk';
import { BigNumber, providers } from 'ethers';
import _ from 'lodash';
import sinon from 'sinon';
import {
  AlphaRouter,
  AlphaRouterConfig,
  AmountQuote,
  CurrencyAmount,
  DAI,
  ETHGasStationInfoProvider,
  HeuristicGasModelFactory,
  Multicall2Provider,
  PoolProvider,
  QuoteProvider,
  RouteSOR,
  RouteWithQuotes,
  RouteWithValidQuote,
  SubgraphPool,
  SubgraphProvider,
  TokenListProvider,
  TokenProvider,
  USDC,
  USDT,
  WETH9,
} from '../../../../src';
import { ProviderConfig } from '../../../../src/providers/provider';
import {
  buildMockPoolAccessor,
  buildMockTokenAccessor,
  DAI_USDT_LOW,
  mockBlock,
  mockBlockBN,
  mockGasPriceWeiBN,
  poolToSubgraphPool,
  USDC_DAI_LOW,
  USDC_DAI_MEDIUM,
  USDC_WETH_LOW,
  WETH9_USDT_LOW,
} from '../../test-util/mock-data';

describe('alpha router', () => {
  let mockProvider: sinon.SinonStubbedInstance<providers.BaseProvider>;
  let mockMulticallProvider: sinon.SinonStubbedInstance<Multicall2Provider>;
  let mockPoolProvider: sinon.SinonStubbedInstance<PoolProvider>;
  let mockTokenProvider: sinon.SinonStubbedInstance<TokenProvider>;
  let mockSubgraphProvider: sinon.SinonStubbedInstance<SubgraphProvider>;
  let mockQuoteProvider: sinon.SinonStubbedInstance<QuoteProvider>;
  let mockGasPriceProvider: sinon.SinonStubbedInstance<ETHGasStationInfoProvider>;
  let mockGasModelFactory: sinon.SinonStubbedInstance<HeuristicGasModelFactory>;
  let mockBlockTokenListProvider: sinon.SinonStubbedInstance<TokenListProvider>;

  let alphaRouter: AlphaRouter;

  const ROUTING_CONFIG: AlphaRouterConfig = {
    topN: 0,
    topNDirectSwaps: 0,
    topNTokenInOut: 0,
    topNSecondHop: 0,
    topNWithEachBaseToken: 0,
    topNWithBaseToken: 0,
    topNWithBaseTokenInSet: false,
    maxSwapsPerPath: 3,
    maxSplits: 3,
    distributionPercent: 25,
  };

  beforeEach(() => {
    mockProvider = sinon.createStubInstance(providers.BaseProvider);
    mockProvider.getBlockNumber.resolves(mockBlock);

    mockMulticallProvider = sinon.createStubInstance(Multicall2Provider);

    mockTokenProvider = sinon.createStubInstance(TokenProvider);
    const mockTokens = [USDC, DAI, WETH9[1], USDT];
    mockTokenProvider.getTokens.resolves(buildMockTokenAccessor(mockTokens));

    mockPoolProvider = sinon.createStubInstance(PoolProvider);
    const mockPools = [
      USDC_DAI_LOW,
      USDC_DAI_MEDIUM,
      USDC_WETH_LOW,
      WETH9_USDT_LOW,
      DAI_USDT_LOW,
    ];
    mockPoolProvider.getPools.resolves(buildMockPoolAccessor(mockPools));
    mockPoolProvider.getPoolAddress.callsFake((tA, tB, fee) => ({
      poolAddress: Pool.getAddress(tA, tB, fee),
      token0: tA,
      token1: tB,
    }));

    mockSubgraphProvider = sinon.createStubInstance(SubgraphProvider);
    const mockSubgraphPools: SubgraphPool[] = _.map(
      mockPools,
      poolToSubgraphPool
    );
    mockSubgraphProvider.getPools.resolves(mockSubgraphPools);

    mockQuoteProvider = sinon.createStubInstance(QuoteProvider);
    mockQuoteProvider.getQuotesManyExactIn.callsFake(
      async (
        amountIns: CurrencyAmount[],
        routes: RouteSOR[],
        _providerConfig?: ProviderConfig
      ) => {
        const routesWithQuotes = _.map(routes, (r) => {
          const amountQuotes = _.map(amountIns, (amountIn, idx) => {
            return {
              amount: amountIn,
              quote: BigNumber.from(
                amountIn.multiply(idx + 1).quotient.toString()
              ),
              sqrtPriceX96AfterList: [BigNumber.from(1)],
              initializedTicksCrossedList: [1],
              gasEstimate: BigNumber.from(10000),
            } as AmountQuote;
          });
          return [r, amountQuotes];
        });

        return {
          routesWithQuotes: routesWithQuotes,
          blockNumber: mockBlockBN,
        } as { routesWithQuotes: RouteWithQuotes[]; blockNumber: BigNumber };
      }
    );
    mockQuoteProvider.getQuotesManyExactOut.callsFake(
      async (
        amountOuts: CurrencyAmount[],
        routes: RouteSOR[],
        _providerConfig?: ProviderConfig
      ) => {
        const routesWithQuotes = _.map(routes, (r) => {
          const amountQuotes = _.map(amountOuts, (amountIn, idx) => {
            return {
              amount: amountIn,
              quote: BigNumber.from(
                amountIn.multiply(idx + 1).quotient.toString()
              ),
              sqrtPriceX96AfterList: [BigNumber.from(1)],
              initializedTicksCrossedList: [1],
              gasEstimate: BigNumber.from(10000),
            } as AmountQuote;
          });
          return [r, amountQuotes];
        });

        return {
          routesWithQuotes: routesWithQuotes,
          blockNumber: mockBlockBN,
        } as { routesWithQuotes: RouteWithQuotes[]; blockNumber: BigNumber };
      }
    );

    mockGasPriceProvider = sinon.createStubInstance(ETHGasStationInfoProvider);
    mockGasPriceProvider.getGasPrice.resolves({
      gasPriceWei: mockGasPriceWeiBN,
      blockNumber: mockBlock,
    });

    mockGasModelFactory = sinon.createStubInstance(HeuristicGasModelFactory);
    const mockGasModel = {
      estimateGasCost: sinon.stub(),
    };
    mockGasModel.estimateGasCost.callsFake((r: RouteWithValidQuote) => {
      return {
        gasEstimate: BigNumber.from(10000),
        gasCostInToken: CurrencyAmount.fromRawAmount(
          r.quoteToken,
          r.quote.multiply(new Fraction(95, 100)).quotient
        ),
        gasCostInUSD: CurrencyAmount.fromRawAmount(
          USDC,
          r.quote.multiply(new Fraction(95, 100)).quotient
        ),
      };
    });
    mockGasModelFactory.buildGasModel.returns(mockGasModel);

    mockBlockTokenListProvider = sinon.createStubInstance(TokenListProvider);

    alphaRouter = new AlphaRouter({
      chainId: 1,
      provider: mockProvider,
      multicall2Provider: mockMulticallProvider as any,
      subgraphProvider: mockSubgraphProvider,
      poolProvider: mockPoolProvider,
      quoteProvider: mockQuoteProvider,
      tokenProvider: mockTokenProvider,
      gasPriceProvider: mockGasPriceProvider,
      gasModelFactory: mockGasModelFactory,
      blockedTokenListProvider: mockBlockTokenListProvider,
    });
  });

  describe('exact in', () => {
    test('succeeds to route', async () => {
      const swap = await alphaRouter.routeExactIn(
        USDC,
        WETH9[1]!,
        CurrencyAmount.fromRawAmount(USDC, 10000),
        undefined,
        ROUTING_CONFIG
      );
      expect(swap).toBeDefined();

      expect(mockProvider.getBlockNumber.called).toBeTruthy();
      expect(mockGasPriceProvider.getGasPrice.called).toBeTruthy();
      expect(
        mockGasModelFactory.buildGasModel.calledWith(
          1,
          mockGasPriceWeiBN,
          sinon.match.any,
          WETH9[1]!
        )
      ).toBeTruthy();

      sinon.assert.calledWith(
        mockQuoteProvider.getQuotesManyExactIn,
        sinon.match((value) => {
          return value instanceof Array && value.length == 4;
        }),
        sinon.match.array,
        sinon.match({ blockNumber: sinon.match.defined })
      );

      expect(swap!.quote.currency.equals(WETH9[1]!)).toBeTruthy();
      expect(swap!.quoteGasAdjusted.currency.equals(WETH9[1]!)).toBeTruthy();
      expect(swap!.quote.greaterThan(swap!.quoteGasAdjusted)).toBeTruthy();
      expect(swap!.estimatedGasUsed.toString()).toEqual('10000');
      expect(
        swap!.estimatedGasUsedQuoteToken.currency.equals(WETH9[1]!)
      ).toBeTruthy();
      expect(swap!.estimatedGasUsedUSD.currency.equals(USDC)).toBeTruthy();
      expect(swap!.gasPriceWei.toString()).toEqual(
        mockGasPriceWeiBN.toString()
      );
      expect(swap!.route).toHaveLength(1);
      expect(swap!.trade).toBeDefined();
      expect(swap!.methodParameters).not.toBeDefined();
      expect(swap!.blockNumber.toString()).toEqual(mockBlockBN.toString());
    });

    test('succeeds to route and generates calldata', async () => {
      const swapParams = {
        deadline: Math.floor(Date.now() / 1000) + 1000000,
        recipient: '0xAb5801a7D398351b8bE11C439e05C5B3259aeC9B',
        slippageTolerance: new Percent(500, 10_000),
      };

      const swap = await alphaRouter.routeExactIn(
        USDC,
        WETH9[1]!,
        CurrencyAmount.fromRawAmount(USDC, 10000),
        swapParams,
        ROUTING_CONFIG
      );
      expect(swap).toBeDefined();

      expect(mockProvider.getBlockNumber.called).toBeTruthy();
      expect(mockGasPriceProvider.getGasPrice.called).toBeTruthy();
      expect(
        mockGasModelFactory.buildGasModel.calledWith(
          1,
          mockGasPriceWeiBN,
          sinon.match.any,
          WETH9[1]!
        )
      ).toBeTruthy();

      sinon.assert.calledWith(
        mockQuoteProvider.getQuotesManyExactIn,
        sinon.match((value) => {
          return value instanceof Array && value.length == 4;
        }),
        sinon.match.array,
        sinon.match({ blockNumber: sinon.match.defined })
      );

      expect(swap!.quote.currency.equals(WETH9[1]!)).toBeTruthy();
      expect(swap!.quoteGasAdjusted.currency.equals(WETH9[1]!)).toBeTruthy();
      expect(swap!.quote.greaterThan(swap!.quoteGasAdjusted)).toBeTruthy();
      expect(swap!.estimatedGasUsed.toString()).toEqual('10000');
      expect(
        swap!.estimatedGasUsedQuoteToken.currency.equals(WETH9[1]!)
      ).toBeTruthy();
      expect(swap!.estimatedGasUsedUSD.currency.equals(USDC)).toBeTruthy();
      expect(swap!.gasPriceWei.toString()).toEqual(
        mockGasPriceWeiBN.toString()
      );
      expect(swap!.route).toHaveLength(1);
      expect(swap!.trade).toBeDefined();
      expect(swap!.methodParameters).toBeDefined();
      expect(swap!.blockNumber.eq(mockBlockBN)).toBeTruthy();
    });
  });

  describe('exact out', () => {
    test('succeeds to route', async () => {
      const swap = await alphaRouter.routeExactOut(
        USDC,
        WETH9[1]!,
        CurrencyAmount.fromRawAmount(USDC, 10000),
        undefined,
        ROUTING_CONFIG
      );
      expect(swap).toBeDefined();

      expect(mockProvider.getBlockNumber.called).toBeTruthy();
      expect(mockGasPriceProvider.getGasPrice.called).toBeTruthy();
      expect(
        mockGasModelFactory.buildGasModel.calledWith(
          1,
          mockGasPriceWeiBN,
          sinon.match.any,
          USDC
        )
      ).toBeTruthy();
      expect(
        mockQuoteProvider.getQuotesManyExactOut.calledWith(
          sinon.match((value) => {
            return value instanceof Array && value.length == 4;
          }),
          sinon.match.array,
          sinon.match({ blockNumber: sinon.match.defined })
        )
      ).toBeTruthy();

      expect(swap!.quote.currency.equals(USDC)).toBeTruthy();
      expect(swap!.quoteGasAdjusted.currency.equals(USDC)).toBeTruthy();
      expect(swap!.quote.lessThan(swap!.quoteGasAdjusted)).toBeTruthy();
      expect(swap!.estimatedGasUsed.toString()).toEqual('10000');
      expect(
        swap!.estimatedGasUsedQuoteToken.currency.equals(USDC!)
      ).toBeTruthy();
      expect(swap!.estimatedGasUsedUSD.currency.equals(USDC)).toBeTruthy();
      expect(swap!.gasPriceWei.toString()).toEqual(
        mockGasPriceWeiBN.toString()
      );
      expect(swap!.route).toHaveLength(1);
      expect(swap!.trade).toBeDefined();
      expect(swap!.methodParameters).not.toBeDefined();
      expect(swap!.blockNumber.eq(mockBlockBN)).toBeTruthy();
    });

    test('succeeds to route and generates calldata', async () => {
      const swapParams = {
        deadline: Math.floor(Date.now() / 1000) + 1000000,
        recipient: '0xAb5801a7D398351b8bE11C439e05C5B3259aeC9B',
        slippageTolerance: new Percent(500, 10_000),
      };

      const swap = await alphaRouter.routeExactOut(
        USDC,
        WETH9[1]!,
        CurrencyAmount.fromRawAmount(USDC, 10000),
        swapParams,
        ROUTING_CONFIG
      );

      expect(swap).toBeDefined();

      expect(mockProvider.getBlockNumber.called).toBeTruthy();
      expect(mockGasPriceProvider.getGasPrice.called).toBeTruthy();
      expect(
        mockGasModelFactory.buildGasModel.calledWith(
          1,
          mockGasPriceWeiBN,
          sinon.match.any,
          USDC
        )
      ).toBeTruthy();
      expect(
        mockQuoteProvider.getQuotesManyExactOut.calledWith(
          sinon.match((value) => {
            return value instanceof Array && value.length == 4;
          }),
          sinon.match.array,
          sinon.match({ blockNumber: sinon.match.defined })
        )
      ).toBeTruthy();

      expect(swap!.quote.currency.equals(USDC)).toBeTruthy();
      expect(swap!.quoteGasAdjusted.currency.equals(USDC)).toBeTruthy();
      expect(swap!.quote.lessThan(swap!.quoteGasAdjusted)).toBeTruthy();
      expect(swap!.estimatedGasUsed.toString()).toEqual('10000');
      expect(
        swap!.estimatedGasUsedQuoteToken.currency.equals(USDC!)
      ).toBeTruthy();
      expect(swap!.estimatedGasUsedUSD.currency.equals(USDC)).toBeTruthy();
      expect(swap!.gasPriceWei.toString()).toEqual(
        mockGasPriceWeiBN.toString()
      );
      expect(swap!.route).toHaveLength(1);
      expect(swap!.trade).toBeDefined();
      expect(swap!.methodParameters).toBeDefined();
      expect(swap!.blockNumber.eq(mockBlockBN)).toBeTruthy();
    });
  });
});
