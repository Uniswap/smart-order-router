/**
 * @jest-environment @uniswap/jest-environment-hardhat
 */

import { Currency, CurrencyAmount, TradeType, Percent, Fraction } from '@uniswap/sdk-core';
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
} from '../../../../src';
// MARK: end SOR imports

import '@uniswap/jest-environment-hardhat';

import { JsonRpcSigner } from '@ethersproject/providers';

import { MethodParameters, Trade } from '@uniswap/v3-sdk';
import { getBalance, getBalanceAndApprove } from '../../../test-util/getBalanceAndApprove';
import { BigNumber, providers } from 'ethers';
import { Protocol } from '@uniswap/router-sdk';
import { DEFAULT_ROUTING_CONFIG_BY_CHAIN } from '../../../../src/routers/alpha-router/config';
import { QuoteResponse } from '../../../test-util/schema';

const SWAP_ROUTER_V2 = '0x68b3465833fb72A70ecDF485E0e4C7bD8665Fc45'
const SLIPPAGE = new Percent(5, 100) // 5%

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
  /**
   * was this before new Fraction(parseInt(SLIPPAGE), 100))
   */
  expect(percentDiff.lessThan(SLIPPAGE)).toBe(true)
}

const convertSwapDataToResponse = (amount: CurrencyAmount<Currency>, swap: any): QuoteResponse => {
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
    // routeString: routeAmountsToString(route),
  }
}

describe('alpha router integration', () => {

  let alice: JsonRpcSigner;
  jest.setTimeout(500 * 1000); // 500s

  let alphaRouter: AlphaRouter;

  const ROUTING_CONFIG: AlphaRouterConfig = {
    // @ts-ignore[TS7053] - complaining about switch being non exhaustive
    ...DEFAULT_ROUTING_CONFIG_BY_CHAIN[ChainId.MAINNET],
    protocols: [Protocol.V3, Protocol.V2]
  };

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
    // await hardhat.approve(alice, SWAP_ROUTER_V2, currencyIn);
    const tokenInBefore = await getBalanceAndApprove(alice, SWAP_ROUTER_V2, currencyIn)
    // const tokenInBefore = await hardhat.getBalance(alice._address, currencyIn);
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

    const tokenInAfter = await hardhat.getBalance(alice._address, currencyIn)
    const tokenOutAfter = await hardhat.getBalance(alice._address, currencyOut)

    console.log(
      {
        tokenInAfter: tokenInAfter.numerator,
        tokenInBefore: tokenInBefore.numerator,
        tokenOutAfter: tokenOutAfter.numerator,
        tokenOutBefore: tokenOutBefore.numerator,
      }
    )

    return {
      tokenInAfter,
      tokenInBefore,
      tokenOutAfter,
      tokenOutBefore,
    }
  }

  beforeAll(async () => {
    alice = hardhat.providers[0]!.getSigner()
    const aliceAddress = await alice.getAddress();

    await hardhat.forkAndFund(alice._address, [
      parseAmount('1000', USDC_MAINNET),
      /**
       * TODO: need to add custom whale token list to fund from
       */
      // parseAmount('5000000', USDT_MAINNET),
      // parseAmount('10', WBTC_MAINNET),
      // // parseAmount('1000', UNI_MAIN),
      // parseAmount('4000', WETH9[1]),
      // parseAmount('5000000', DAI_MAINNET),
    ])

    const aliceUSDCBalance = await hardhat.getBalance(alice._address, USDC_MAINNET);
    expect(aliceUSDCBalance).toEqual(parseAmount('1000', USDC_MAINNET));

    alphaRouter = new AlphaRouter({
      chainId: 1,
      provider: hardhat.providers[0]!
    })
  })

  /**
   *  tests are 1:1 with routing api integ tests
   */
  for (const tradeType of [TradeType.EXACT_INPUT, TradeType.EXACT_OUTPUT]) {
    describe(`${ID_TO_NETWORK_NAME(1)} alpha - ${tradeType}`, () => {
      describe(`+ simulate swap`, () => {
        it('erc20 -> erc20', async () => {
          const amount = parseAmount('100', USDC_MAINNET);

          const swap = await alphaRouter.route(
            amount, // currentIn is nested in this
            USDT_MAINNET,
            tradeType,
            {
              recipient: alice._address,
              slippageTolerance: SLIPPAGE,
              deadline: 360,
            },
            {
              ...ROUTING_CONFIG
            }
          );
          expect(swap).toBeDefined();
          expect(swap).not.toBeNull();

          // console.log(swap);
          if (!swap) {
            throw new Error("swap is null")
          }

          const {
            quote,
            amountDecimals,
            quoteDecimals,
            quoteGasAdjustedDecimals,
            methodParameters
          } = convertSwapDataToResponse(amount, swap)

          expect(parseFloat(quoteDecimals)).toBeGreaterThan(90)
          expect(parseFloat(quoteDecimals)).toBeLessThan(110)

          if (tradeType == TradeType.EXACT_INPUT) {
            expect(parseFloat(quoteGasAdjustedDecimals)).toBeLessThanOrEqual(parseFloat(quoteDecimals))
          } else {
            expect(parseFloat(quoteGasAdjustedDecimals)).toBeGreaterThanOrEqual(parseFloat(quoteDecimals))
          }

          expect(methodParameters).not.toBeUndefined();
          console.log(methodParameters)

          // TODO: the methodParameters are malformed, so swaps are not executing correctly

          const { tokenInBefore, tokenInAfter, tokenOutBefore, tokenOutAfter } = await executeSwap(
            methodParameters!,
            USDC_MAINNET,
            USDT_MAINNET
          )

          // if (tradeType == TradeType.EXACT_INPUT) {
          //   expect(tokenInBefore.subtract(tokenInAfter).toExact()).toEqual('100')
          //   checkQuoteToken(tokenOutBefore, tokenOutAfter, CurrencyAmount.fromRawAmount(USDT_MAINNET, quote))
          // } else {
          //   expect(tokenOutAfter.subtract(tokenOutBefore).toExact()).toEqual('100')
          //   checkQuoteToken(tokenInBefore, tokenInAfter, CurrencyAmount.fromRawAmount(USDC_MAINNET, quote))
          // }
        })

        it(`erc20 -> eth`, async () => {
          const amount = parseAmount(tradeType == TradeType.EXACT_INPUT ? '1000000' : '10', USDC_MAINNET);

          const swap = await alphaRouter.route(
            amount, // currentIn is nested in this
            WRAPPED_NATIVE_CURRENCY[1],
            tradeType,
            {
              recipient: alice._address,
              slippageTolerance: SLIPPAGE,
              deadline: 360,
            },
            {
              ...ROUTING_CONFIG
            }
          );
          expect(swap).toBeDefined();
          expect(swap).not.toBeNull();

          if (!swap) {
            throw new Error("swap is null")
          }

          const {
            quote,
            amountDecimals,
            quoteDecimals,
            quoteGasAdjustedDecimals,
            methodParameters
          } = convertSwapDataToResponse(amount, swap)

          expect(methodParameters).not.toBeUndefined;

          if (tradeType == TradeType.EXACT_INPUT) {
            expect(parseFloat(quoteGasAdjustedDecimals)).toBeLessThanOrEqual(parseFloat(quoteDecimals))
          } else {
            expect(parseFloat(quoteGasAdjustedDecimals)).toBeGreaterThanOrEqual(parseFloat(quoteDecimals))
          }

        })

        it(`erc20 -> eth large trade`, async () => {
          // Trade of this size almost always results in splits.
          const amount = parseAmount(tradeType == TradeType.EXACT_INPUT ? '1000000' : '100', USDC_MAINNET);

          const swap = await alphaRouter.route(
            amount, // currentIn is nested in this
            WRAPPED_NATIVE_CURRENCY[1],
            tradeType,
            {
              recipient: alice._address,
              slippageTolerance: SLIPPAGE,
              deadline: 360,
            },
            {
              ...ROUTING_CONFIG
            }
          );
          expect(swap).toBeDefined();
          expect(swap).not.toBeNull();

          if (!swap) {
            throw new Error("swap is null")
          }

          const {
            quote,
            amountDecimals,
            quoteDecimals,
            quoteGasAdjustedDecimals,
            methodParameters
          } = convertSwapDataToResponse(amount, swap)

          expect(methodParameters).not.toBeUndefined;
        })
      })
    })
  }
})
