import { Fraction, Percent } from '@uniswap/sdk-core';
import { Pool, Position } from '@uniswap/v3-sdk';
import { BigNumber, providers } from 'ethers';
import _ from 'lodash';
import sinon from 'sinon';
import {
  AlphaRouter,
  AlphaRouterConfig,
  AmountQuote,
  CurrencyAmount,
  DAI_MAINNET as DAI,
  ETHGasStationInfoProvider,
  HeuristicGasModelFactory,
  parseAmount,
  UniswapMulticallProvider,
  PoolProvider,
  QuoteProvider,
  RouteSOR,
  RouteWithQuotes,
  RouteWithValidQuote,
  SubgraphPool,
  SubgraphProvider,
  CachingTokenListProvider,
  TokenProvider,
  USDC_MAINNET as USDC,
  USDT_MAINNET as USDT,
  WETH9,
} from '../../../../src';
import { ProviderConfig } from '../../../../src/providers/provider';
import {
  buildMockPoolAccessor,
  buildMockTokenAccessor,
  DAI_USDT_LOW,
  DAI_USDT_MEDIUM,
  mockBlock,
  mockBlockBN,
  mockGasPriceWeiBN,
  poolToSubgraphPool,
  USDC_DAI_LOW,
  USDC_DAI_MEDIUM,
  USDC_USDT_MEDIUM,
  USDC_WETH_LOW,
  WETH9_USDT_LOW,
} from '../../test-util/mock-data';

describe('alpha router', () => {
  let mockProvider: sinon.SinonStubbedInstance<providers.BaseProvider>;
  let mockMulticallProvider: sinon.SinonStubbedInstance<UniswapMulticallProvider>;
  let mockPoolProvider: sinon.SinonStubbedInstance<PoolProvider>;
  let mockTokenProvider: sinon.SinonStubbedInstance<TokenProvider>;
  let mockSubgraphProvider: sinon.SinonStubbedInstance<SubgraphProvider>;
  let mockQuoteProvider: sinon.SinonStubbedInstance<QuoteProvider>;
  let mockGasPriceProvider: sinon.SinonStubbedInstance<ETHGasStationInfoProvider>;
  let mockGasModelFactory: sinon.SinonStubbedInstance<HeuristicGasModelFactory>;
  let mockBlockTokenListProvider: sinon.SinonStubbedInstance<CachingTokenListProvider>;

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
    minSplits: 1,
    maxSplits: 3,
    distributionPercent: 25,
  };

  beforeEach(() => {
    mockProvider = sinon.createStubInstance(providers.BaseProvider);
    mockProvider.getBlockNumber.resolves(mockBlock);

    mockMulticallProvider = sinon.createStubInstance(UniswapMulticallProvider);

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
      USDC_USDT_MEDIUM,
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
          const amountQuotes = _.map(amountIns, (amountIn) => {
            return {
              amount: amountIn,
              quote: BigNumber.from(
                amountIn.quotient.toString()
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
          const amountQuotes = _.map(amountOuts, (amountOut) => {
            return {
              amount: amountOut,
              quote: BigNumber.from(
                amountOut.quotient.toString()
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

    mockBlockTokenListProvider = sinon.createStubInstance(CachingTokenListProvider);

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

  describe('to ratio', () => {
    describe('when token0Balance has excess tokens', () => {
      test('calls routeExactIn with correct parameters', async () => {
        const token0Balance = parseAmount('20', USDT);
        const token1Balance = parseAmount('5', USDC);

        const position = new Position({
          pool: USDC_USDT_MEDIUM,
          tickUpper: 120,
          tickLower: -120,
          liquidity: 1,
        });

        const spy = sinon.spy(alphaRouter, 'routeExactIn')

        await alphaRouter.routeToRatio(
          token0Balance,
          token1Balance,
          position,
          undefined,
          ROUTING_CONFIG
        );

        const exactAmountInBalance = parseAmount('7.5', USDT)

        const exactInputParameters = spy.firstCall.args
        expect(exactInputParameters[0]).toEqual(token0Balance.currency)
        expect(exactInputParameters[1]).toEqual(token1Balance.currency)
        expect(exactInputParameters[2]).toEqual(exactAmountInBalance)
      })
    })

    describe('when token1Balance has excess tokens', () => {
      test('calls routeExactIn with correct parameters', async () => {
        const token0Balance = parseAmount('5', USDT);
        const token1Balance = parseAmount('20', USDC);

        const position = new Position({
          pool: USDC_USDT_MEDIUM,
          tickUpper: 120,
          tickLower: -120,
          liquidity: 1,
        });

        const spy = sinon.spy(alphaRouter, 'routeExactIn')

        await alphaRouter.routeToRatio(
          token0Balance,
          token1Balance,
          position,
          undefined,
          ROUTING_CONFIG
        );

        const exactAmountInBalance = parseAmount('7.5', USDC)

        const exactInputParameters = spy.firstCall.args
        expect(exactInputParameters[0]).toEqual(token1Balance.currency)
        expect(exactInputParameters[1]).toEqual(token0Balance.currency)
        expect(exactInputParameters[2]).toEqual(exactAmountInBalance)
      })
    })

    describe('when token0 has more decimal places than token1', () => {
      test('calls routeExactIn with correct parameters', async () => {
        const token0Balance = parseAmount('20', DAI);
        const token1Balance = parseAmount('5' + '0'.repeat(12), USDT);

        const position = new Position({
          pool: DAI_USDT_MEDIUM,
          tickUpper: 120,
          tickLower: -120,
          liquidity: 1,
        });

        const spy = sinon.spy(alphaRouter, 'routeExactIn')

        await alphaRouter.routeToRatio(
          token0Balance,
          token1Balance,
          position,
          undefined,
          ROUTING_CONFIG
        );

        const exactAmountInBalance = parseAmount('7.5', DAI)

        const exactInputParameters = spy.firstCall.args
        expect(exactInputParameters[0]).toEqual(token0Balance.currency)
        expect(exactInputParameters[1]).toEqual(token1Balance.currency)
        expect(exactInputParameters[2]).toEqual(exactAmountInBalance)
      })
    })

    describe('when token1 has more decimal places than token0', () => {
      test('calls routeExactIn with correct parameters', async () => {
        const token0Balance = parseAmount('20' + '0'.repeat(12), USDC);
        const token1Balance = parseAmount('5', WETH9[1]);

        const position = new Position({
          pool: USDC_WETH_LOW,
          tickUpper: 120,
          tickLower: -120,
          liquidity: 1,
        });

        const spy = sinon.spy(alphaRouter, 'routeExactIn')

        await alphaRouter.routeToRatio(
          token0Balance,
          token1Balance,
          position,
          undefined,
          ROUTING_CONFIG
        );

        const exactAmountInBalance = parseAmount('7500000000000', USDC)

        const exactInputParameters = spy.firstCall.args
        expect(exactInputParameters[0]).toEqual(token0Balance.currency)
        expect(exactInputParameters[1]).toEqual(token1Balance.currency)
        expect(exactInputParameters[2]).toEqual(exactAmountInBalance)
      })
    })
  })
});
