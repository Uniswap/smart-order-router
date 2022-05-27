/**
 * @jest-environment @uniswap/jest-environment-hardhat
 */

import { Currency, CurrencyAmount, TradeType, Percent, Ether } from '@uniswap/sdk-core';
import _ from 'lodash';
import {
  AlphaRouter,
  AlphaRouterConfig,
  USDC_MAINNET,
  USDT_MAINNET,
  WBTC_MAINNET,
  DAI_MAINNET,
  WRAPPED_NATIVE_CURRENCY,
  WETH9,
  parseAmount,
  ChainId,
  ID_TO_NETWORK_NAME,
  NATIVE_CURRENCY,
  CachingV3PoolProvider,
  V3PoolProvider,
  NodeJSCache,
  UniswapMulticallProvider,
  SwapRoute,
  V2PoolProvider,
  routeAmountsToString,
  CachingGasStationProvider,
  OnChainGasPriceProvider,
  EIP1559GasPriceProvider,
  LegacyGasPriceProvider,
  GasPrice,
} from '../../../../src';
// MARK: end SOR imports

import '@uniswap/jest-environment-hardhat';

import { JsonRpcSigner } from '@ethersproject/providers';

import { MethodParameters, Trade } from '@uniswap/v3-sdk';
import { getBalance, getBalanceAndApprove } from '../../../test-util/getBalanceAndApprove';
import { BigNumber, providers } from 'ethers';
import { Protocol } from '@uniswap/router-sdk';
import { DEFAULT_ROUTING_CONFIG_BY_CHAIN } from '../../../../src/routers/alpha-router/config';
import { BasicPoolInRoute, QuoteResponse, V2PoolInRoute, V3PoolInRoute } from '../../../test-util/schema';
import NodeCache from 'node-cache';

const SWAP_ROUTER_V2 = '0x68b3465833fb72A70ecDF485E0e4C7bD8665Fc45'
const SLIPPAGE = new Percent(5, 10_000) // 5%

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
          }; // TODO: @eric there are weird undefined checks here that are not present in routing API

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
          }; // TODO: @eric there are weird undefined checks here that are not present in routing API

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
      gasUseEstimateQuote: estimatedGasUsedQuoteToken.quotient.toString(),
      gasUseEstimateQuoteDecimals: estimatedGasUsedQuoteToken.toExact(),
      gasUseEstimate: estimatedGasUsed.toString(),
      gasUseEstimateUSD: estimatedGasUsedUSD.toExact(),
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

    console.log(
      {
        tokenInAfter: tokenInAfter.currency.symbol,
        tokenInBefore: tokenInBefore.currency.symbol,
        tokenOutAfter: tokenOutAfter.currency.symbol,
        tokenOutBefore: tokenOutBefore.currency.symbol,
      }
    )

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

  beforeAll(async () => {
    alice = hardhat.providers[0]!.getSigner()
    const aliceAddress = await alice.getAddress();
    expect(aliceAddress).toBe(alice._address);

    await hardhat.fork();

    await hardhat.fund(alice._address, [
      parseAmount('8000000', USDC_MAINNET),
      parseAmount('5000000', USDT_MAINNET),
      // parseAmount('4000', WETH9[1]),
      parseAmount('5000000', DAI_MAINNET),
    ], [
      "0x47ac0fb4f2d84898e4d9e7b4dab3c24507a6d503", // Binance peg tokens
    ])

    const aliceUSDCBalance = await hardhat.getBalance(alice._address, USDC_MAINNET);
    expect(aliceUSDCBalance).toEqual(parseAmount('8000000', USDC_MAINNET));
    const aliceUSDTBalance = await hardhat.getBalance(alice._address, USDT_MAINNET);
    expect(aliceUSDTBalance).toEqual(parseAmount('5000000', USDT_MAINNET));
    // const aliceWETH9Balance = await hardhat.getBalance(alice._address, WETH9[1]);
    // expect(aliceWETH9Balance).toEqual(parseAmount('4000', WETH9[1]));
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
            amount, // currentIn is nested in this
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
            amountDecimals,
            quoteDecimals,
            quoteGasAdjustedDecimals,
            methodParameters
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
          // declaring these to reduce confusion
          const tokenIn = USDC_MAINNET;
          const tokenOut = WRAPPED_NATIVE_CURRENCY[1];
          const amount = tradeType == TradeType.EXACT_INPUT ?
            parseAmount('1000000', tokenIn)
            : parseAmount('10', tokenOut);

          const swap = await alphaRouter.route(
            amount, // currentIn is nested in this
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
            amountDecimals,
            quoteDecimals,
            quoteGasAdjustedDecimals,
            methodParameters
          } = convertSwapDataToResponse(amount, tradeType, swap!)

          expect(methodParameters).not.toBeUndefined;

          if (tradeType == TradeType.EXACT_INPUT) {
            expect(parseFloat(quoteGasAdjustedDecimals)).toBeLessThanOrEqual(parseFloat(quoteDecimals))
          } else {
            expect(parseFloat(quoteGasAdjustedDecimals)).toBeGreaterThanOrEqual(parseFloat(quoteDecimals))
          }

        })

        it(`erc20 -> eth large trade`, async () => {
          // Trade of this size almost always results in splits.
          const tokenIn = USDC_MAINNET;
          const tokenOut = WRAPPED_NATIVE_CURRENCY[1];
          const amount = tradeType == TradeType.EXACT_INPUT ?
            parseAmount('1000000', tokenIn)
            : parseAmount('100', tokenOut);

          const swap = await alphaRouter.route(
            amount, // currentIn is nested in this
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
            amountDecimals,
            quoteDecimals,
            quoteGasAdjustedDecimals,
            methodParameters,
            route,
            routeString
          } = convertSwapDataToResponse(amount, tradeType, swap!)

          expect(methodParameters).not.toBeUndefined;
          expect(route).not.toBeUndefined

          console.log("routeString", routeString)

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
      })
    })
  }
})
