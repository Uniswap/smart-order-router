import { Fraction, Percent } from '@uniswap/sdk-core';
import { encodeSqrtRatioX96, Pool, Position } from '@uniswap/v3-sdk';
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
  SwapAndAddConfig,
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

const helper = require('../../../../src/routers/alpha-router/functions/calculate-ratio-amount-in')

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


  const SWAP_AND_ADD_CONFIG: SwapAndAddConfig = {
    errorTolerance: new Fraction(1, 100),
    maxIterations: 6,
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
      getQuotesManyExactInFn()
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
              sqrtPriceX96AfterList: [BigNumber.from(1), BigNumber.from(1), BigNumber.from(1)],
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
    describe('simple 1 swap scenario', () => {
      describe('when token0Balance has excess tokens', () => {
        test('with in range position calls routeExactIn with correct parameters', async () => {
          const token0Balance = parseAmount('20', USDC);
          const token1Balance = parseAmount('5', USDT);

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
            SWAP_AND_ADD_CONFIG,
            undefined,
            ROUTING_CONFIG
          );

          const exactAmountInBalance = parseAmount('7.5', USDC)

          const exactInputParameters = spy.firstCall.args
          expect(exactInputParameters[0]).toEqual(token0Balance.currency)
          expect(exactInputParameters[1]).toEqual(token1Balance.currency)
          expect(exactInputParameters[2]).toEqual(exactAmountInBalance)
        })

        test('with out of range position calls routeExactIn with correct parameters', async () => {
          const token0Balance = parseAmount('20', USDC);
          const token1Balance = parseAmount('5', USDT);

          const position = new Position({
            pool: USDC_USDT_MEDIUM,
            tickLower: -120,
            tickUpper: -60,
            liquidity: 1,
          });

          const spy = sinon.spy(alphaRouter, 'routeExactIn')

          await alphaRouter.routeToRatio(
            token0Balance,
            token1Balance,
            position,
            SWAP_AND_ADD_CONFIG,
            undefined,
            ROUTING_CONFIG
          );

          const exactAmountInBalance = parseAmount('20', USDC)

          const exactInputParameters = spy.firstCall.args
          expect(exactInputParameters[0]).toEqual(token0Balance.currency)
          expect(exactInputParameters[1]).toEqual(token1Balance.currency)
          expect(exactInputParameters[2]).toEqual(exactAmountInBalance)
        })
      })

      describe('when token1Balance has excess tokens', () => {
        test('with in range position calls routeExactIn with correct parameters', async () => {
          const token0Balance = parseAmount('5', USDC);
          const token1Balance = parseAmount('20', USDT);

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
            SWAP_AND_ADD_CONFIG,
            undefined,
            ROUTING_CONFIG
          );

          const exactAmountInBalance = parseAmount('7.5', USDT)

          const exactInputParameters = spy.firstCall.args
          expect(exactInputParameters[0]).toEqual(token1Balance.currency)
          expect(exactInputParameters[1]).toEqual(token0Balance.currency)
          expect(exactInputParameters[2]).toEqual(exactAmountInBalance)
        })

        test('with out of range position calls routeExactIn with correct parameters', async () => {
          const token0Balance = parseAmount('5', USDC);
          const token1Balance = parseAmount('20', USDT);

          const position = new Position({
            pool: USDC_USDT_MEDIUM,
            tickUpper: 120,
            tickLower: 60,
            liquidity: 1,
          });

          const spy = sinon.spy(alphaRouter, 'routeExactIn')

          await alphaRouter.routeToRatio(
            token0Balance,
            token1Balance,
            position,
            SWAP_AND_ADD_CONFIG,
            undefined,
            ROUTING_CONFIG
          );

          const exactAmountInBalance = parseAmount('20', USDT)

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
            SWAP_AND_ADD_CONFIG,
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
            SWAP_AND_ADD_CONFIG,
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

    describe('iterative scenario', () => {
      let spy: sinon.SinonSpy<any[], any>

      beforeEach(() => {
        spy = sinon.spy(helper, 'calculateRatioAmountIn')
      })

      afterEach(() => {
        spy.restore()
      })

      test('it returns null when maxIterations has been exceeded', async () => {
        // prompt many loops
        mockQuoteProvider.getQuotesManyExactIn.onCall(0).callsFake(getQuotesManyExactInFn({
          quoteMultiplier: new Fraction(1, 2)
        }))
        mockQuoteProvider.getQuotesManyExactIn.onCall(2).callsFake(getQuotesManyExactInFn({
          quoteMultiplier: new Fraction(1, 2)
        }))
        mockQuoteProvider.getQuotesManyExactIn.onCall(4).callsFake(getQuotesManyExactInFn({
          quoteMultiplier: new Fraction(1, 2)
        }))

        const token0Balance = parseAmount('20', USDC);
        const token1Balance = parseAmount('5', USDT);

        const position = new Position({
          pool: USDC_USDT_MEDIUM,
          tickUpper: 120,
          tickLower: -120,
          liquidity: 1,
        });

         const swap = await alphaRouter.routeToRatio(
          token0Balance,
          token1Balance,
          position,
          SWAP_AND_ADD_CONFIG,
          undefined,
          ROUTING_CONFIG
        )

        expect(swap).toEqual(null)
      })

      describe('when there is excess of token0', () => {
        test('when amountOut is less than expected it calls again with new exchangeRate', async () => {
          mockQuoteProvider.getQuotesManyExactIn.callsFake(getQuotesManyExactInFn({
            quoteMultiplier: new Fraction(1, 2)
          }))
          const token0Balance = parseAmount('20', USDC);
          const token1Balance = parseAmount('5', USDT);

          const position = new Position({
            pool: USDC_USDT_MEDIUM,
            tickUpper: 120,
            tickLower: -120,
            liquidity: 1,
          });

          await alphaRouter.routeToRatio(
            token0Balance,
            token1Balance,
            position,
            SWAP_AND_ADD_CONFIG,
            undefined,
            ROUTING_CONFIG
          );

          expect(spy.calledTwice).toEqual(true)

          const [
            optimalRatioFirst,
            exchangeRateFirst,
            inputBalanceFirst,
            outputBalanceFirst
          ] = spy.firstCall.args
          expect(exchangeRateFirst.asFraction.toFixed(6)).toEqual(new Fraction(1, 1).toFixed(6))
          expect(optimalRatioFirst.toFixed(6)).toEqual(new Fraction(1, 1).toFixed(6))
          expect(inputBalanceFirst).toEqual(token0Balance)
          expect(outputBalanceFirst).toEqual(token1Balance)

          const [
            optimalRatioSecond,
            exchangeRateSecond,
            inputBalanceSecond,
            outputBalanceSecond
          ] = spy.secondCall.args
          expect(exchangeRateSecond.asFraction.toFixed(6)).toEqual(new Fraction(1, 2).toFixed(6))
          // all other args remain equal
          expect(optimalRatioSecond.toFixed(6)).toEqual(new Fraction(1, 1).toFixed(6))
          expect(inputBalanceSecond).toEqual(token0Balance)
          expect(outputBalanceSecond).toEqual(token1Balance)
        })

        test('when trade moves sqrtPrice in target pool within range it calls again with new optimalRatio', async () => {
          const sqrtTwoX96 = BigNumber.from(encodeSqrtRatioX96(2, 1).toString())
          mockQuoteProvider.getQuotesManyExactIn.callsFake(getQuotesManyExactInFn({
            sqrtPriceX96AfterList: [sqrtTwoX96, sqrtTwoX96, sqrtTwoX96]
          }))

          const token0Balance = parseAmount('20', USDC);
          const token1Balance = parseAmount('5',USDT);

          const position = new Position({
            pool: USDC_USDT_MEDIUM,
            tickLower: -10020,
            tickUpper: 10020,
            liquidity: 1,
          });

          await alphaRouter.routeToRatio(
            token0Balance,
            token1Balance,
            position,
            SWAP_AND_ADD_CONFIG,
            undefined,
            ROUTING_CONFIG
          );

          expect(spy.calledTwice).toEqual(true)

          const [
            optimalRatioFirst,
            exchangeRateFirst,
            inputBalanceFirst,
            outputBalanceFirst
          ] = spy.firstCall.args
          expect(optimalRatioFirst.toFixed(6)).toEqual(new Fraction(1, 1).toFixed(6))
          expect(exchangeRateFirst.asFraction.toFixed(6)).toEqual(new Fraction(1, 1).toFixed(6))
          expect(inputBalanceFirst).toEqual(token0Balance)
          expect(outputBalanceFirst).toEqual(token1Balance)

          const [
            optimalRatioSecond,
            exchangeRateSecond,
            inputBalanceSecond,
            outputBalanceSecond
          ] = spy.secondCall.args
          expect(optimalRatioSecond.toFixed(2)).toEqual(new Fraction(1, 8).toFixed(2))
          // all other params remain the same
          expect(exchangeRateSecond.asFraction.toFixed(6)).toEqual(new Fraction(1, 1).toFixed(6))
          expect(inputBalanceSecond).toEqual(token0Balance)
          expect(outputBalanceSecond).toEqual(token1Balance)
        })

        test('when trade moves sqrtPrice in target pool out of range it calls again with new optimalRatio', async () => {
          const sqrtFourX96 = BigNumber.from(encodeSqrtRatioX96(4, 1).toString())
          mockQuoteProvider.getQuotesManyExactIn.onCall(0).callsFake(getQuotesManyExactInFn({
            sqrtPriceX96AfterList: [sqrtFourX96, sqrtFourX96, sqrtFourX96]
          }))
          mockQuoteProvider.getQuotesManyExactIn.onCall(1).callsFake(getQuotesManyExactInFn({
            sqrtPriceX96AfterList: [sqrtFourX96, sqrtFourX96, sqrtFourX96]
          }))
          const token0Balance = parseAmount('20', USDC);
          const token1Balance = parseAmount('5',USDT);

          const position = new Position({
            pool: USDC_USDT_MEDIUM,
            tickLower: -10020,
            tickUpper: 10020,
            liquidity: 1,
          });

          await alphaRouter.routeToRatio(
            token0Balance,
            token1Balance,
            position,
            SWAP_AND_ADD_CONFIG,
            undefined,
            ROUTING_CONFIG
          );

          expect(spy.calledTwice).toEqual(true)

          const [
            optimalRatioFirst,
            exchangeRateFirst,
            inputBalanceFirst,
            outputBalanceFirst
          ] = spy.firstCall.args
          expect(optimalRatioFirst.toFixed(6)).toEqual(new Fraction(1, 1).toFixed(6))
          expect(exchangeRateFirst.asFraction.toFixed(6)).toEqual(new Fraction(1, 1).toFixed(6))
          expect(inputBalanceFirst).toEqual(token0Balance)
          expect(outputBalanceFirst).toEqual(token1Balance)

          const [
            optimalRatioSecond,
            exchangeRateSecond,
            inputBalanceSecond,
            outputBalanceSecond
          ] = spy.secondCall.args
          expect(optimalRatioSecond).toEqual(new Fraction(0, 1))
          // all other params remain the same
          expect(exchangeRateSecond.asFraction.toFixed(6)).toEqual(new Fraction(1, 1).toFixed(6))
          expect(inputBalanceSecond).toEqual(token0Balance)
          expect(outputBalanceSecond).toEqual(token1Balance)
        })
      })

      describe('when there is excess of token1', () => {
        test('when amountOut is less than expected it calls again with new exchangeRate', async () => {
          mockQuoteProvider.getQuotesManyExactIn.callsFake(getQuotesManyExactInFn({
            quoteMultiplier: new Fraction(1, 2)
          }))
          const token0Balance = parseAmount('5', USDC);
          const token1Balance = parseAmount('20', USDT);

          const position = new Position({
            pool: USDC_USDT_MEDIUM,
            tickUpper: 120,
            tickLower: -120,
            liquidity: 1,
          });

          await alphaRouter.routeToRatio(
            token0Balance,
            token1Balance,
            position,
            SWAP_AND_ADD_CONFIG,
            undefined,
            ROUTING_CONFIG
          );

          expect(spy.calledTwice).toEqual(true)

          const [
            optimalRatioFirst,
            exchangeRateFirst,
            inputBalanceFirst,
            outputBalanceFirst
          ] = spy.firstCall.args
          expect(exchangeRateFirst.asFraction.toFixed(6)).toEqual(new Fraction(1, 1).toFixed(6))
          expect(optimalRatioFirst.toFixed(6)).toEqual(new Fraction(1, 1).toFixed(6))
          expect(inputBalanceFirst).toEqual(token1Balance)
          expect(outputBalanceFirst).toEqual(token0Balance)

          const [
            optimalRatioSecond,
            exchangeRateSecond,
            inputBalanceSecond,
            outputBalanceSecond
          ] = spy.secondCall.args
          expect(exchangeRateSecond.asFraction.toFixed(6)).toEqual(new Fraction(1, 2).toFixed(6))
          // all other args remain equal
          expect(optimalRatioSecond.toFixed(6)).toEqual(new Fraction(1, 1).toFixed(6))
          expect(inputBalanceSecond).toEqual(token1Balance)
          expect(outputBalanceSecond).toEqual(token0Balance)
        })

        test('when trade moves sqrtPrice in target pool within range it calls again with new optimalRatio', async () => {
          const oneHalfX96 = BigNumber.from(encodeSqrtRatioX96(1, 2).toString())
          mockQuoteProvider.getQuotesManyExactIn.callsFake(getQuotesManyExactInFn({
            sqrtPriceX96AfterList: [oneHalfX96, oneHalfX96, oneHalfX96]
          }))

          const token1Balance = parseAmount('20' + '0'.repeat(12), USDC);
          const token0Balance = parseAmount('5', DAI);

          const position = new Position({
            pool: USDC_DAI_LOW,
            tickLower: -100_000,
            tickUpper: 100_000,
            liquidity: 1,
          });

          await alphaRouter.routeToRatio(
            token0Balance,
            token1Balance,
            position,
            SWAP_AND_ADD_CONFIG,
            undefined,
            ROUTING_CONFIG
          );

          expect(spy.calledTwice).toEqual(true)

          const [
            optimalRatioFirst,
            exchangeRateFirst,
            inputBalanceFirst,
            outputBalanceFirst
          ] = spy.firstCall.args
          expect(optimalRatioFirst.toFixed(6)).toEqual(new Fraction(1, 1).toFixed(6))
          expect(exchangeRateFirst.asFraction.toFixed(6)).toEqual(new Fraction(1, 1).toFixed(6))
          expect(inputBalanceFirst).toEqual(token1Balance)
          expect(outputBalanceFirst).toEqual(token0Balance)

          const [
            optimalRatioSecond,
            exchangeRateSecond,
            inputBalanceSecond,
            outputBalanceSecond
          ] = spy.secondCall.args
          expect(optimalRatioSecond.toFixed(1)).toEqual(new Fraction(1, 2).toFixed(1))
          // all other params remain the same
          expect(exchangeRateSecond.asFraction.toFixed(6)).toEqual(new Fraction(1, 1).toFixed(6))
          expect(inputBalanceSecond).toEqual(token1Balance)
          expect(outputBalanceSecond).toEqual(token0Balance)
        })

        test('when trade moves sqrtPrice in target pool out of range it calls again with new optimalRatio of 0', async () => {
          const oneQuarterX96 = BigNumber.from(encodeSqrtRatioX96(1, 2).toString())
          mockQuoteProvider.getQuotesManyExactIn.callsFake(getQuotesManyExactInFn({
            sqrtPriceX96AfterList: [oneQuarterX96, oneQuarterX96, oneQuarterX96]
          }))

          const token1Balance = parseAmount('20' + '0'.repeat(12), USDC);
          const token0Balance = parseAmount('5', DAI);

          const position = new Position({
            pool: USDC_DAI_LOW,
            tickLower: -120,
            tickUpper: 120,
            liquidity: 1,
          });

          await alphaRouter.routeToRatio(
            token0Balance,
            token1Balance,
            position,
            SWAP_AND_ADD_CONFIG,
            undefined,
            ROUTING_CONFIG
          );

          expect(spy.calledTwice).toEqual(true)

          const [
            optimalRatioFirst,
            exchangeRateFirst,
            inputBalanceFirst,
            outputBalanceFirst
          ] = spy.firstCall.args
          expect(optimalRatioFirst.toFixed(6)).toEqual(new Fraction(1, 1).toFixed(6))
          expect(exchangeRateFirst.asFraction.toFixed(6)).toEqual(new Fraction(1, 1).toFixed(6))
          expect(inputBalanceFirst).toEqual(token1Balance)
          expect(outputBalanceFirst).toEqual(token0Balance)

          const [
            optimalRatioSecond,
            exchangeRateSecond,
            inputBalanceSecond,
            outputBalanceSecond
          ] = spy.secondCall.args
          expect(optimalRatioSecond).toEqual(new Fraction(0, 1))
          // all other params remain the same
          expect(exchangeRateSecond.asFraction.toFixed(6)).toEqual(new Fraction(1, 1).toFixed(6))
          expect(inputBalanceSecond).toEqual(token1Balance)
          expect(outputBalanceSecond).toEqual(token0Balance)
        })
      })
    })
  })
})

type GetQuotesManyExactInFn = (
  amountIns: CurrencyAmount[],
  routes: RouteSOR[],
  _providerConfig?: ProviderConfig | undefined
) => Promise<{ routesWithQuotes: RouteWithQuotes[]; blockNumber: BigNumber; }>

type GetQuotesManyExactInFnParams = {
  quoteMultiplier?: Fraction
  sqrtPriceX96AfterList?: BigNumber[]
}

function getQuotesManyExactInFn(options: GetQuotesManyExactInFnParams = {}): GetQuotesManyExactInFn {
  return async (
    amountIns: CurrencyAmount[],
    routes: RouteSOR[],
    _providerConfig?: ProviderConfig
  ) => {
    const oneX96 = BigNumber.from(encodeSqrtRatioX96(1, 1).toString())
    const multiplier = options.quoteMultiplier || new Fraction(1, 1)
    const routesWithQuotes = _.map(routes, (r) => {
      const amountQuotes = _.map(amountIns, (amountIn) => {
        return {
          amount: amountIn,
          quote: BigNumber.from(
            amountIn.multiply(multiplier).quotient.toString()
          ),
          sqrtPriceX96AfterList: options.sqrtPriceX96AfterList || [oneX96, oneX96, oneX96],
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
}
