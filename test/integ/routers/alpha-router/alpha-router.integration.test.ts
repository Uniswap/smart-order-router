/**
 * @jest-environment @uniswap/jest-environment-hardhat
 */

import { Currency, CurrencyAmount, TradeType, Percent, Ether } from '@uniswap/sdk-core';
import {
  AlphaRouter,
  AlphaRouterConfig,
  USDC_MAINNET,
  USDT_MAINNET,
  DAI_MAINNET,
  WETH9,
  parseAmount,
  ChainId,
  ID_TO_NETWORK_NAME,
  UniswapMulticallProvider,
  SwapRoute,
  routeAmountsToString,
  UNI_MAINNET,
  StaticGasPriceProvider,
} from '../../../../src';

import '@uniswap/jest-environment-hardhat';

import { JsonRpcSigner } from '@ethersproject/providers';

import { MethodParameters, Trade } from '@uniswap/v3-sdk';
import { getBalanceAndApprove } from '../../../test-util/getBalanceAndApprove';
import { BigNumber, providers } from 'ethers';
import { Protocol } from '@uniswap/router-sdk';
import { DEFAULT_ROUTING_CONFIG_BY_CHAIN } from '../../../../src/routers/alpha-router/config';
import { BasicPoolInRoute, QuoteResponse } from '../../../test-util/schema';
import { parseEther } from 'ethers/lib/utils';
import _ from 'lodash';

const SWAP_ROUTER_V2 = '0x68b3465833fb72A70ecDF485E0e4C7bD8665Fc45'
const SLIPPAGE = new Percent(5, 100) // 5% or 10_000?

const checkQuoteToken = (
  before: CurrencyAmount<Currency>,
  after: CurrencyAmount<Currency>,
  tokensQuoted: CurrencyAmount<Currency>
) => {
  // Check which is bigger to support exactIn and exactOut
  const tokensSwapped = after.greaterThan(before) ? after.subtract(before) : before.subtract(after)
  const tokensDiff = tokensQuoted.greaterThan(tokensSwapped)
    ? tokensQuoted.subtract(tokensSwapped)
    : tokensSwapped.subtract(tokensQuoted)
  const percentDiff = tokensDiff.asFraction.divide(tokensQuoted.asFraction)
  expect(percentDiff.lessThan(SLIPPAGE)).toBe(true)
}

export function parseDeadline(deadline: number): number {
  return Math.floor(Date.now() / 1000) + deadline
}

describe('alpha router integration', () => {

  let alice: JsonRpcSigner;
  jest.setTimeout(500 * 1000); // 500s

  let alphaRouter: AlphaRouter;
  const multicall2Provider = new UniswapMulticallProvider(ChainId.MAINNET, hardhat.provider);

  const ROUTING_CONFIG: AlphaRouterConfig = {
    // @ts-ignore[TS7053] - complaining about switch being non exhaustive
    ...DEFAULT_ROUTING_CONFIG_BY_CHAIN[ChainId.MAINNET],
    protocols: [Protocol.V3, Protocol.V2]
  };

  const convertSwapDataToResponse = (amount: CurrencyAmount<Currency>, type: TradeType, swap: SwapRoute): QuoteResponse => {
    const {
      quote,
      quoteGasAdjusted,
      route,
      estimatedGasUsed,
      estimatedGasUsedQuoteToken,
      estimatedGasUsedUSD,
      gasPriceWei,
      methodParameters,
      blockNumber,
    } = swap

    const routeResponse: Array<BasicPoolInRoute[]> = []

    for (const subRoute of route) {
      const { amount, quote, tokenPath } = subRoute

      if (subRoute.protocol == Protocol.V3) {
        const pools = subRoute.route.pools
        const curRoute: BasicPoolInRoute[] = []
        for (let i = 0; i < pools.length; i++) {
          const nextPool = pools[i]
          const tokenIn = tokenPath[i]
          const tokenOut = tokenPath[i + 1]
          if (!nextPool || !tokenIn || !tokenOut) {
            throw new Error(`subRoute ${i} undefined`)
          };

          let edgeAmountIn = undefined
          if (i == 0) {
            edgeAmountIn = type == TradeType.EXACT_INPUT ? amount.quotient.toString() : quote.quotient.toString()
          }

          let edgeAmountOut = undefined
          if (i == pools.length - 1) {
            edgeAmountOut = type == TradeType.EXACT_INPUT ? quote.quotient.toString() : amount.quotient.toString()
          }

          curRoute.push({
            type: 'v3-pool',
            amountIn: edgeAmountIn,
            amountOut: edgeAmountOut
          })
        }
        routeResponse.push(curRoute)
      } else if (subRoute.protocol == Protocol.V2) {
        const pools = subRoute.route.pairs
        const curRoute: BasicPoolInRoute[] = []
        for (let i = 0; i < pools.length; i++) {
          const nextPool = pools[i]
          const tokenIn = tokenPath[i]
          const tokenOut = tokenPath[i + 1]
          if (!nextPool || !tokenIn || !tokenOut) {
            throw new Error(`subRoute ${i} undefined`)
          };

          let edgeAmountIn = undefined
          if (i == 0) {
            edgeAmountIn = type == TradeType.EXACT_INPUT ? amount.quotient.toString() : quote.quotient.toString()
          }

          let edgeAmountOut = undefined
          if (i == pools.length - 1) {
            edgeAmountOut = type == TradeType.EXACT_INPUT ? quote.quotient.toString() : amount.quotient.toString()
          }

          curRoute.push({
            type: 'v2-pool',
            amountIn: edgeAmountIn,
            amountOut: edgeAmountOut,
          })
        }

        routeResponse.push(curRoute)
      }
    }

    return {
      methodParameters,
      blockNumber: blockNumber.toString(),
      amount: amount.quotient.toString(),
      amountDecimals: amount.toExact(),
      quote: quote.quotient.toString(),
      quoteDecimals: quote.toExact(),
      quoteGasAdjusted: quoteGasAdjusted.quotient.toString(),
      quoteGasAdjustedDecimals: quoteGasAdjusted.toExact(),
      // we dont use any of these
      gasUseEstimateQuote: estimatedGasUsedQuoteToken.quotient.toString(),
      gasUseEstimateQuoteDecimals: estimatedGasUsedQuoteToken.toExact(),
      gasUseEstimate: estimatedGasUsed.toString(),
      gasUseEstimateUSD: estimatedGasUsedUSD.toExact(),
      // until here
      gasPriceWei: gasPriceWei.toString(),
      route: routeResponse,
      routeString: routeAmountsToString(route),
    }
  }

  const executeSwap = async (
    methodParameters: MethodParameters,
    currencyIn: Currency,
    currencyOut: Currency
  ): Promise<{
    tokenInAfter: CurrencyAmount<Currency>
    tokenInBefore: CurrencyAmount<Currency>
    tokenOutAfter: CurrencyAmount<Currency>
    tokenOutBefore: CurrencyAmount<Currency>
  }> => {
    expect(currencyIn.symbol).not.toBe(currencyOut.symbol);
    // We use this helper function for approving rather than hardhat.provider.approve
    // because there is custom logic built in for handling USDT and other checks 
    const tokenInBefore = await getBalanceAndApprove(alice, SWAP_ROUTER_V2, currencyIn)
    const tokenOutBefore = await hardhat.getBalance(alice._address, currencyOut)

    const transaction = {
      data: methodParameters.calldata,
      to: SWAP_ROUTER_V2,
      value: BigNumber.from(methodParameters.value),
      from: alice._address,
      gasPrice: BigNumber.from(2000000000000),
      type: 1,
    }

    const transactionResponse: providers.TransactionResponse = await alice.sendTransaction(transaction)

    const receipt = await transactionResponse.wait()
    expect(receipt.status == 1).toBe(true) // Check for txn success

    const tokenInAfter = await hardhat.getBalance(alice._address, currencyIn)
    const tokenOutAfter = await hardhat.getBalance(alice._address, currencyOut)

    return {
      tokenInAfter,
      tokenInBefore,
      tokenOutAfter,
      tokenOutBefore,
    }
  }

  const getQuoteToken = (tokenIn: Currency, tokenOut: Currency, tradeType: TradeType): Currency => {
    return tradeType == TradeType.EXACT_INPUT ? tokenOut : tokenIn
  }

  /**
   * Function to validate "standard" swapRoute data. For now it is just used to simplify 
   * the tests that do USDC-USDT 100 and are testing other criteria.
   * 
   * 1. Optionally checks that the quote is within a certain range 90-110
   * 2. Checks that the quoteGasAdjustedDecimals is correct
   */
  const validateStandardSwapRoute = async (quoteDecimals: string, quoteGasAdjustedDecimals: string, tradeType: TradeType, checkQuoteDecimals: boolean = false) => {
    if (checkQuoteDecimals) {
      expect(parseFloat(quoteDecimals)).toBeGreaterThan(90)
      expect(parseFloat(quoteDecimals)).toBeLessThan(110)
    }

    if (tradeType == TradeType.EXACT_INPUT) {
      expect(parseFloat(quoteGasAdjustedDecimals)).toBeLessThanOrEqual(parseFloat(quoteDecimals))
    } else {
      expect(parseFloat(quoteGasAdjustedDecimals)).toBeGreaterThanOrEqual(parseFloat(quoteDecimals))
    }
  }

  /**
   * Function to validate a "standard" call to executeSwap
   * Only for tests that do USDC-USDT 100 and are testing other criteria.
   */
  const validateStandardExecuteSwap = async (quote: string, tokenIn: Currency, tokenOut: Currency, methodParameters: MethodParameters | undefined, tradeType: TradeType) => {
    expect(methodParameters).not.toBeUndefined();
    const { tokenInBefore, tokenInAfter, tokenOutBefore, tokenOutAfter } = await executeSwap(
      methodParameters!,
      tokenIn,
      tokenOut!
    )

    if (tradeType == TradeType.EXACT_INPUT) {
      expect(tokenInBefore.subtract(tokenInAfter).toExact()).toEqual('100')
      checkQuoteToken(tokenOutBefore, tokenOutAfter, CurrencyAmount.fromRawAmount(tokenOut, quote))
    } else {
      expect(tokenOutAfter.subtract(tokenOutBefore).toExact()).toEqual('100')
      checkQuoteToken(tokenInBefore, tokenInAfter, CurrencyAmount.fromRawAmount(tokenIn, quote))
    }
  }

  beforeAll(async () => {
    alice = hardhat.providers[0]!.getSigner()
    const aliceAddress = await alice.getAddress();
    expect(aliceAddress).toBe(alice._address);

    await hardhat.fork();

    await hardhat.fund(alice._address, [
      parseAmount('8000000', USDC_MAINNET),
      parseAmount('5000000', USDT_MAINNET),
      parseAmount('1000', UNI_MAINNET),
      parseAmount('5000000', DAI_MAINNET),
    ], [
      "0x47ac0fb4f2d84898e4d9e7b4dab3c24507a6d503", // Binance peg tokens
    ])

    await hardhat.fund(alice._address, [
      parseAmount('4000', WETH9[1]),
    ], [
      "0x6555e1CC97d3cbA6eAddebBCD7Ca51d75771e0B8", // WETH token
    ])

    // alice should always have 10000 ETH
    const aliceEthBalance = await hardhat.provider.getBalance(alice._address);
    expect(aliceEthBalance).toEqual(parseEther('10000'));
    const aliceUSDCBalance = await hardhat.getBalance(alice._address, USDC_MAINNET);
    expect(aliceUSDCBalance).toEqual(parseAmount('8000000', USDC_MAINNET));
    const aliceUSDTBalance = await hardhat.getBalance(alice._address, USDT_MAINNET);
    expect(aliceUSDTBalance).toEqual(parseAmount('5000000', USDT_MAINNET));
    const aliceWETH9Balance = await hardhat.getBalance(alice._address, WETH9[1]);
    expect(aliceWETH9Balance).toEqual(parseAmount('4000', WETH9[1]));
    const aliceDAIBalance = await hardhat.getBalance(alice._address, DAI_MAINNET);
    expect(aliceDAIBalance).toEqual(parseAmount('5000000', DAI_MAINNET));

    alphaRouter = new AlphaRouter({
      chainId: 1,
      provider: hardhat.providers[0]!,
      multicall2Provider
    })
  })

  /**
   *  tests are 1:1 with routing api integ tests
   */
  for (const tradeType of [TradeType.EXACT_INPUT, TradeType.EXACT_OUTPUT]) {
    describe(`${ID_TO_NETWORK_NAME(1)} alpha - ${tradeType}`, () => {
      describe(`+ simulate swap`, () => {
        it('erc20 -> erc20', async () => {
          // declaring these to reduce confusion
          const tokenIn = USDC_MAINNET;
          const tokenOut = USDT_MAINNET;
          const amount = tradeType == TradeType.EXACT_INPUT ?
            parseAmount('100', tokenIn)
            : parseAmount('100', tokenOut);

          const swap = await alphaRouter.route(
            amount,
            getQuoteToken(tokenIn, tokenOut, tradeType),
            tradeType,
            {
              recipient: alice._address,
              slippageTolerance: SLIPPAGE,
              deadline: parseDeadline(360),
            },
            {
              ...ROUTING_CONFIG
            }
          );

          expect(swap).toBeDefined();
          expect(swap).not.toBeNull();

          const {
            quote,
            routeString,
            quoteDecimals,
            quoteGasAdjustedDecimals,
            methodParameters,
          } = convertSwapDataToResponse(amount, tradeType, swap!)

          expect(parseFloat(quoteDecimals)).toBeGreaterThan(90)
          expect(parseFloat(quoteDecimals)).toBeLessThan(110)

          if (tradeType == TradeType.EXACT_INPUT) {
            expect(parseFloat(quoteGasAdjustedDecimals)).toBeLessThanOrEqual(parseFloat(quoteDecimals))
          } else {
            expect(parseFloat(quoteGasAdjustedDecimals)).toBeGreaterThanOrEqual(parseFloat(quoteDecimals))
          }

          expect(methodParameters).not.toBeUndefined();

          console.log(routeString);

          const { tokenInBefore, tokenInAfter, tokenOutBefore, tokenOutAfter } = await executeSwap(
            methodParameters!,
            tokenIn,
            tokenOut!
          )

          if (tradeType == TradeType.EXACT_INPUT) {
            expect(tokenInBefore.subtract(tokenInAfter).toExact()).toEqual('100')
            checkQuoteToken(tokenOutBefore, tokenOutAfter, CurrencyAmount.fromRawAmount(tokenOut, quote))
          } else {
            expect(tokenOutAfter.subtract(tokenOutBefore).toExact()).toEqual('100')
            checkQuoteToken(tokenInBefore, tokenInAfter, CurrencyAmount.fromRawAmount(tokenIn, quote))
          }
        })

        it(`erc20 -> eth`, async () => {
          const tokenIn = USDC_MAINNET;
          const tokenOut = Ether.onChain(1) as Currency;
          const amount = tradeType == TradeType.EXACT_INPUT ?
            parseAmount('1000000', tokenIn)
            : parseAmount('10', tokenOut);

          const swap = await alphaRouter.route(
            amount,
            getQuoteToken(tokenIn, tokenOut, tradeType),
            tradeType,
            {
              recipient: alice._address,
              slippageTolerance: SLIPPAGE,
              deadline: parseDeadline(360),
            },
            {
              ...ROUTING_CONFIG
            }
          );
          expect(swap).toBeDefined();
          expect(swap).not.toBeNull();

          const {
            quoteDecimals,
            quoteGasAdjustedDecimals,
            methodParameters
          } = convertSwapDataToResponse(amount, tradeType, swap!)

          await validateStandardSwapRoute(quoteDecimals, quoteGasAdjustedDecimals, tradeType, false);
          expect(methodParameters).not.toBeUndefined;
        })

        it(`erc20 -> eth large trade`, async () => {
          // Trade of this size almost always results in splits.
          const tokenIn = USDC_MAINNET;
          const tokenOut = Ether.onChain(1) as Currency;
          const amount = tradeType == TradeType.EXACT_INPUT ?
            parseAmount('1000000', tokenIn)
            : parseAmount('100', tokenOut);

          const swap = await alphaRouter.route(
            amount,
            getQuoteToken(tokenIn, tokenOut, tradeType),
            tradeType,
            {
              recipient: alice._address,
              slippageTolerance: SLIPPAGE,
              deadline: parseDeadline(360),
            },
            {
              ...ROUTING_CONFIG
            }
          );
          expect(swap).toBeDefined();
          expect(swap).not.toBeNull();

          const {
            quote,
            methodParameters,
            route,
            routeString
          } = convertSwapDataToResponse(amount, tradeType, swap!)

          expect(methodParameters).not.toBeUndefined;
          expect(route).not.toBeUndefined

          console.log(routeString)

          const amountInEdgesTotal = _(route)
            .flatMap((route) => route[0]!)
            .filter((pool) => !!pool.amountIn)
            .map((pool) => BigNumber.from(pool.amountIn))
            .reduce((cur, total) => total.add(cur), BigNumber.from(0))
          const amountIn = BigNumber.from(quote)
          expect(amountIn.eq(amountInEdgesTotal))

          const amountOutEdgesTotal = _(route)
            .flatMap((route) => route[0]!)
            .filter((pool) => !!pool.amountOut)
            .map((pool) => BigNumber.from(pool.amountOut))
            .reduce((cur, total) => total.add(cur), BigNumber.from(0))
          const amountOut = BigNumber.from(quote)
          expect(amountOut.eq(amountOutEdgesTotal))

          const { tokenInBefore, tokenInAfter, tokenOutBefore, tokenOutAfter } = await executeSwap(
            methodParameters!,
            tokenIn,
            tokenOut!
          )

          if (tradeType == TradeType.EXACT_INPUT) {
            expect(tokenInBefore.subtract(tokenInAfter).toExact()).toEqual('1000000')
            checkQuoteToken(tokenOutBefore, tokenOutAfter, CurrencyAmount.fromRawAmount(tokenOut, quote))
          } else {
            // Hard to test ETH balance due to gas costs for approval and swap. Just check tokenIn changes
            checkQuoteToken(tokenInBefore, tokenInAfter, CurrencyAmount.fromRawAmount(tokenIn, quote))
          }
        })

        xit(`eth -> erc20`, async () => {
          const tokenIn = Ether.onChain(1) as Currency;
          const tokenOut = UNI_MAINNET;
          const amount = tradeType == TradeType.EXACT_INPUT ?
            parseAmount('10', tokenIn)
            : parseAmount('10000', tokenOut);

          const swap = await alphaRouter.route(
            amount,
            getQuoteToken(tokenIn, tokenOut, tradeType),
            tradeType,
            {
              recipient: alice._address,
              slippageTolerance: SLIPPAGE,
              deadline: parseDeadline(360),
            },
            {
              ...ROUTING_CONFIG
            }
          );
          expect(swap).toBeDefined();
          expect(swap).not.toBeNull();

          const {
            quote,
            routeString,
            methodParameters
          } = convertSwapDataToResponse(amount, tradeType, swap!)

          console.log(routeString);

          expect(methodParameters).not.toBeUndefined;

          const { tokenInBefore, tokenInAfter, tokenOutBefore, tokenOutAfter } = await executeSwap(
            methodParameters!,
            tokenIn,
            tokenOut
          )

          if (tradeType == TradeType.EXACT_INPUT) {
            // We've swapped 10 ETH + gas costs
            expect(tokenInBefore.subtract(tokenInAfter).greaterThan(parseAmount('10', tokenIn))).toBe(true);
            checkQuoteToken(tokenOutBefore, tokenOutAfter, CurrencyAmount.fromRawAmount(tokenOut, quote))
          } else {
            console.log(tokenOutAfter.toExact(), tokenOutBefore.toExact())
            /** 
             * This test is failing here, as 14067.612284869857813592 - 4067.612284869857813375 is
             * not exactly 10_000, but like .0000000000217. The remainder is the same every time
             * so its not random.
             * */
            expect(tokenOutAfter.subtract(tokenOutBefore).toExact()).toEqual('10000')
            // Can't easily check slippage for ETH due to gas costs effecting ETH balance.
          }
        })

        it(`weth -> erc20`, async () => {
          const tokenIn = WETH9[1];
          const tokenOut = DAI_MAINNET;
          const amount = tradeType == TradeType.EXACT_INPUT ?
            parseAmount('100', tokenIn)
            : parseAmount('100', tokenOut);

          const swap = await alphaRouter.route(
            amount,
            getQuoteToken(tokenIn, tokenOut, tradeType),
            tradeType,
            {
              recipient: alice._address,
              slippageTolerance: SLIPPAGE,
              deadline: parseDeadline(360),
            },
            {
              ...ROUTING_CONFIG
            }
          );
          expect(swap).toBeDefined();
          expect(swap).not.toBeNull();

          const {
            quote,
            methodParameters,
            routeString
          } = convertSwapDataToResponse(amount, tradeType, swap!)

          console.log(routeString);

          expect(methodParameters).not.toBeUndefined;

          const { tokenInBefore, tokenInAfter, tokenOutBefore, tokenOutAfter } = await executeSwap(
            methodParameters!,
            tokenIn,
            tokenOut
          )

          if (tradeType == TradeType.EXACT_INPUT) {
            expect(tokenInBefore.subtract(tokenInAfter).toExact()).toEqual('100')
            checkQuoteToken(tokenOutBefore, tokenOutAfter, CurrencyAmount.fromRawAmount(tokenOut, quote))
          } else {
            expect(tokenOutAfter.subtract(tokenOutBefore).toExact()).toEqual('100')
            checkQuoteToken(tokenInBefore, tokenInAfter, CurrencyAmount.fromRawAmount(tokenIn, quote))
          }
        })

        it(`erc20 -> weth`, async () => {
          const tokenIn = USDC_MAINNET;
          const tokenOut = WETH9[1];
          const amount = tradeType == TradeType.EXACT_INPUT ?
            parseAmount('100', tokenIn)
            : parseAmount('100', tokenOut);

          const swap = await alphaRouter.route(
            amount,
            getQuoteToken(tokenIn, tokenOut, tradeType),
            tradeType,
            {
              recipient: alice._address,
              slippageTolerance: SLIPPAGE,
              deadline: parseDeadline(360),
            },
            {
              ...ROUTING_CONFIG
            }
          );
          expect(swap).toBeDefined();
          expect(swap).not.toBeNull();

          const {
            quote,
            methodParameters,
            routeString
          } = convertSwapDataToResponse(amount, tradeType, swap!)

          console.log(routeString);

          expect(methodParameters).not.toBeUndefined;

          const { tokenInBefore, tokenInAfter, tokenOutBefore, tokenOutAfter } = await executeSwap(
            methodParameters!,
            tokenIn,
            tokenOut
          )

          if (tradeType == TradeType.EXACT_INPUT) {
            expect(tokenInBefore.subtract(tokenInAfter).toExact()).toEqual('100')
            checkQuoteToken(tokenOutBefore, tokenOutAfter, CurrencyAmount.fromRawAmount(tokenOut, quote))
          } else {
            expect(tokenOutAfter.subtract(tokenOutBefore).toExact()).toEqual('100')
            checkQuoteToken(tokenInBefore, tokenInAfter, CurrencyAmount.fromRawAmount(tokenIn, quote))
          }
        })

        it('erc20 -> erc20 v3 only', async () => {
          const tokenIn = USDC_MAINNET;
          const tokenOut = USDT_MAINNET;
          const amount = tradeType == TradeType.EXACT_INPUT ?
            parseAmount('100', tokenIn)
            : parseAmount('100', tokenOut);

          const swap = await alphaRouter.route(
            amount,
            getQuoteToken(tokenIn, tokenOut, tradeType),
            tradeType,
            {
              recipient: alice._address,
              slippageTolerance: SLIPPAGE,
              deadline: parseDeadline(360),
            },
            {
              ...ROUTING_CONFIG,
              protocols: [Protocol.V3],
            }
          );
          expect(swap).toBeDefined();
          expect(swap).not.toBeNull();

          const {
            quote,
            route,
            quoteDecimals,
            quoteGasAdjustedDecimals,
            methodParameters
          } = convertSwapDataToResponse(amount, tradeType, swap!)

          for (const r of route) {
            for (const pool of r) {
              expect(pool.type).toEqual('v3-pool')
            }
          }

          await validateStandardSwapRoute(quoteDecimals, quoteGasAdjustedDecimals, tradeType, true);

          await validateStandardExecuteSwap(quote, tokenIn, tokenOut, methodParameters, tradeType);
        })

        it('erc20 -> erc20 v2 only', async () => {
          const tokenIn = USDC_MAINNET;
          const tokenOut = USDT_MAINNET;
          const amount = tradeType == TradeType.EXACT_INPUT ?
            parseAmount('100', tokenIn)
            : parseAmount('100', tokenOut);

          const swap = await alphaRouter.route(
            amount,
            getQuoteToken(tokenIn, tokenOut, tradeType),
            tradeType,
            {
              recipient: alice._address,
              slippageTolerance: SLIPPAGE,
              deadline: parseDeadline(360),
            },
            {
              ...ROUTING_CONFIG,
              protocols: [Protocol.V2]
            }
          );
          expect(swap).toBeDefined();
          expect(swap).not.toBeNull();

          const {
            quote,
            route,
            routeString,
            quoteDecimals,
            quoteGasAdjustedDecimals,
            methodParameters
          } = convertSwapDataToResponse(amount, tradeType, swap!)

          for (const r of route) {
            for (const pool of r) {
              expect(pool.type).toEqual('v2-pool')
            }
          }

          await validateStandardSwapRoute(quoteDecimals, quoteGasAdjustedDecimals, tradeType, true);

          await validateStandardExecuteSwap(quote, tokenIn, tokenOut, methodParameters, tradeType);
        })

        it('erc20 -> erc20 forceCrossProtocol', async () => {
          const tokenIn = USDC_MAINNET;
          const tokenOut = USDT_MAINNET;
          const amount = tradeType == TradeType.EXACT_INPUT ?
            parseAmount('100', tokenIn)
            : parseAmount('100', tokenOut);

          const swap = await alphaRouter.route(
            amount,
            getQuoteToken(tokenIn, tokenOut, tradeType),
            tradeType,
            {
              recipient: alice._address,
              slippageTolerance: SLIPPAGE,
              deadline: parseDeadline(360),
            },
            {
              ...ROUTING_CONFIG,
              forceCrossProtocol: true
            }
          );
          expect(swap).toBeDefined();
          expect(swap).not.toBeNull();

          const {
            quote,
            route,
            routeString,
            quoteDecimals,
            quoteGasAdjustedDecimals,
            methodParameters
          } = convertSwapDataToResponse(amount, tradeType, swap!)

          console.log(routeString);

          let hasV3Pool = false
          let hasV2Pool = false
          for (const r of route) {
            for (const pool of r) {
              if (pool.type == 'v3-pool') {
                hasV3Pool = true
              }
              if (pool.type == 'v2-pool') {
                hasV2Pool = true
              }
            }
          }

          expect(hasV3Pool && hasV2Pool).toBe(true);

          await validateStandardSwapRoute(quoteDecimals, quoteGasAdjustedDecimals, tradeType, true);

          await validateStandardExecuteSwap(quote, tokenIn, tokenOut, methodParameters, tradeType);
        })
      })

      it(`erc20 -> erc20 no recipient/deadline/slippage`, async () => {
        const tokenIn = USDC_MAINNET;
        const tokenOut = USDT_MAINNET;
        const amount = tradeType == TradeType.EXACT_INPUT ?
          parseAmount('100', tokenIn)
          : parseAmount('100', tokenOut);

        const swap = await alphaRouter.route(
          amount,
          getQuoteToken(tokenIn, tokenOut, tradeType),
          tradeType,
          undefined,
          {
            ...ROUTING_CONFIG
          }
        );
        expect(swap).toBeDefined();
        expect(swap).not.toBeNull();

        const {
          routeString,
          quoteDecimals,
          quoteGasAdjustedDecimals,
        } = convertSwapDataToResponse(amount, tradeType, swap!)

        console.log(routeString);

        await validateStandardSwapRoute(quoteDecimals, quoteGasAdjustedDecimals, tradeType, true);
      })

      it(`erc20 -> erc20 gas price specified`, async () => {
        const tokenIn = USDC_MAINNET;
        const tokenOut = USDT_MAINNET;
        const amount = tradeType == TradeType.EXACT_INPUT ?
          parseAmount('100', tokenIn)
          : parseAmount('100', tokenOut);

        const gasPriceWeiBN = BigNumber.from(60000000000);
        const gasPriceProvider = new StaticGasPriceProvider(gasPriceWeiBN);
        // Create a new AlphaRouter with the new gas price provider
        const customAlphaRouter: AlphaRouter = new AlphaRouter({
          chainId: 1,
          provider: hardhat.providers[0]!,
          multicall2Provider,
          gasPriceProvider
        })

        const swap = await customAlphaRouter.route(
          amount,
          getQuoteToken(tokenIn, tokenOut, tradeType),
          tradeType,
          undefined,
          {
            ...ROUTING_CONFIG,
          }
        );
        expect(swap).toBeDefined();
        expect(swap).not.toBeNull();

        const {
          routeString,
          quoteDecimals,
          quoteGasAdjustedDecimals,
          gasPriceWei
        } = convertSwapDataToResponse(amount, tradeType, swap!)

        console.log(routeString);

        expect(gasPriceWei).toEqual('60000000000');

        await validateStandardSwapRoute(quoteDecimals, quoteGasAdjustedDecimals, tradeType, true);
      });

      it(`erc20 -> erc20 by address - NOT IMPLEMENTING BC NOT SOR RELATED`, async () => {
      });

      it(`erc20 -> erc20 one by address one by symbol - NOT IMPLEMENTING BC NOT SOR RELATED`, async () => {
      });

      /**
       * Skipping all of the 4xx tests in routing-api since those test the API level
       * validation and not the SOR functionality
       */
    })
  }
})
