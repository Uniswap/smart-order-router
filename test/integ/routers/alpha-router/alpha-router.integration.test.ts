/**
 * @jest-environment hardhat
 */

import {
  Currency,
  CurrencyAmount,
  Ether,
  Percent,
  TradeType,
} from '@uniswap/sdk-core';
import {
  AlphaRouter,
  AlphaRouterConfig,
  ChainId,
  DAI_MAINNET,
  ID_TO_NETWORK_NAME,
  parseAmount,
  UniswapMulticallProvider,
  UNI_MAINNET,
  USDC_MAINNET,
  USDT_MAINNET,
  WETH9,
} from '../../../../src';

import 'jest-environment-hardhat';

import { JsonRpcSigner } from '@ethersproject/providers';

import { Protocol } from '@uniswap/router-sdk';
import { MethodParameters } from '@uniswap/v3-sdk';
import { BigNumber } from 'ethers';
import { parseEther } from 'ethers/lib/utils';
import _ from 'lodash';
import { StaticGasPriceProvider } from '../../../../src/providers/static-gas-price-provider';
import { DEFAULT_ROUTING_CONFIG_BY_CHAIN } from '../../../../src/routers/alpha-router/config';
import { getBalanceAndApprove } from '../../../test-util/getBalanceAndApprove';

const SWAP_ROUTER_V2 = '0x68b3465833fb72A70ecDF485E0e4C7bD8665Fc45';
const SLIPPAGE = new Percent(5, 100); // 5% or 10_000?

function checkQuoteToken(
  before: CurrencyAmount<Currency>,
  after: CurrencyAmount<Currency>,
  tokensQuoted: CurrencyAmount<Currency>
) {
  // Check which is bigger to support exactIn and exactOut
  const tokensSwapped = after.greaterThan(before)
    ? after.subtract(before)
    : before.subtract(after);
  const tokensDiff = tokensQuoted.greaterThan(tokensSwapped)
    ? tokensQuoted.subtract(tokensSwapped)
    : tokensSwapped.subtract(tokensQuoted);
  const percentDiff = tokensDiff.asFraction.divide(tokensQuoted.asFraction);
  expect(percentDiff.lessThan(SLIPPAGE)).toBe(true);
}

function getQuoteToken(
  tokenIn: Currency,
  tokenOut: Currency,
  tradeType: TradeType
): Currency {
  return tradeType == TradeType.EXACT_INPUT ? tokenOut : tokenIn;
}

function parseDeadline(deadline: number): number {
  return Math.floor(Date.now() / 1000) + deadline;
}

function expandDecimals(currency: Currency, amount: number): number {
  return amount * 10 ** currency.decimals;
}

describe('alpha router', () => {
  let alice: JsonRpcSigner;
  jest.setTimeout(500 * 1000); // 500s

  let multicall2Provider: UniswapMulticallProvider
  let alphaRouter: AlphaRouter;

  const ROUTING_CONFIG: AlphaRouterConfig = {
    // @ts-ignore[TS7053] - complaining about switch being non exhaustive
    ...DEFAULT_ROUTING_CONFIG_BY_CHAIN[ChainId.MAINNET],
    protocols: [Protocol.V3, Protocol.V2],
  };

  async function executeSwap(
    methodParameters: MethodParameters,
    tokenIn: Currency,
    tokenOut: Currency
  ): Promise<{
    tokenInAfter: CurrencyAmount<Currency>;
    tokenInBefore: CurrencyAmount<Currency>;
    tokenOutAfter: CurrencyAmount<Currency>;
    tokenOutBefore: CurrencyAmount<Currency>;
  }> {
    expect(tokenIn.symbol).not.toBe(tokenOut.symbol);
    // We use this helper function for approving rather than hardhat.provider.approve
    // because there is custom logic built in for handling USDT and other checks
    const tokenInBefore = await getBalanceAndApprove(alice, SWAP_ROUTER_V2, tokenIn);
    const tokenOutBefore = await hardhat.getBalance(alice._address, tokenOut);

    const transaction = {
      data: methodParameters.calldata,
      to: SWAP_ROUTER_V2,
      value: BigNumber.from(methodParameters.value),
      from: alice._address,
      gasPrice: BigNumber.from(2000000000000),
      type: 1,
    };

    const transactionResponse = await alice.sendTransaction(transaction);
    const receipt = await transactionResponse.wait();
    expect(receipt.status == 1).toBe(true); // Check for txn success

    const tokenInAfter = await hardhat.getBalance(alice._address, tokenIn);
    const tokenOutAfter = await hardhat.getBalance(alice._address, tokenOut);

    return {
      tokenInAfter,
      tokenInBefore,
      tokenOutAfter,
      tokenOutBefore,
    };
  }

  /**
   * Validates swapRoute data.
   * @param targetQuoteDecimalsAmount if defined, checks that the quoteDecimals is within the range of this +/- acceptableDifference (non inclusive bounds)
   * @param acceptableDifference see above
   */
  async function validateSwapRoute(
    quote: CurrencyAmount<Currency>,
    quoteGasAdjusted: CurrencyAmount<Currency>,
    tradeType: TradeType,
    targetQuoteDecimalsAmount?: number,
    acceptableDifference?: number
  ) {
    // strict undefined checks here to avoid confusion with 0 being a falsy value
    if (targetQuoteDecimalsAmount !== undefined) {
      acceptableDifference =
        acceptableDifference !== undefined ? acceptableDifference : 0;
      expect(
        quote.greaterThan(
          CurrencyAmount.fromRawAmount(
            quote.currency,
            expandDecimals(
              quote.currency,
              targetQuoteDecimalsAmount - acceptableDifference
            )
          )
        )
      ).toBe(true);
      expect(
        quote.lessThan(
          CurrencyAmount.fromRawAmount(
            quote.currency,
            expandDecimals(
              quote.currency,
              targetQuoteDecimalsAmount + acceptableDifference
            )
          )
        )
      ).toBe(true);
    }

    if (tradeType == TradeType.EXACT_INPUT) {
      // == lessThanOrEqualTo
      expect(!quoteGasAdjusted.greaterThan(quote)).toBe(true);
    } else {
      // == greaterThanOrEqual
      expect(!quoteGasAdjusted.lessThan(quote)).toBe(true);
    }
  }

  /**
   * Performs a call to executeSwap and validates the response.
   * @param checkTokenInAmount if defined, check that the tokenInBefore - tokenInAfter = checkTokenInAmount
   * @param checkTokenOutAmount if defined, check that the tokenOutBefore - tokenOutAfter = checkTokenOutAmount
   */
  async function validateExecuteSwap(
    quote: CurrencyAmount<Currency>,
    tokenIn: Currency,
    tokenOut: Currency,
    methodParameters: MethodParameters | undefined,
    tradeType: TradeType,
    checkTokenInAmount?: number,
    checkTokenOutAmount?: number
  ) {
    expect(methodParameters).not.toBeUndefined();
    const { tokenInBefore, tokenInAfter, tokenOutBefore, tokenOutAfter } =
      await executeSwap(methodParameters!, tokenIn, tokenOut!);

    if (tradeType == TradeType.EXACT_INPUT) {
      if (checkTokenInAmount) {
        expect(
          tokenInBefore.subtract(tokenInAfter).equalTo(
            CurrencyAmount.fromRawAmount(
              tokenIn,
              /// @dev since we are passing in numbers, we need to expand to the correct decimal scale
              expandDecimals(tokenIn, checkTokenInAmount)
            )
          )
        );
      }
      checkQuoteToken(
        tokenOutBefore,
        tokenOutAfter,
        /// @dev we need to recreate the CurrencyAmount object here because tokenOut can be different from quote.currency (in the case of ETH vs. WETH)
        CurrencyAmount.fromRawAmount(tokenOut, quote.quotient)
      );
    } else {
      if (checkTokenOutAmount) {
        expect(
          tokenOutAfter
            .subtract(tokenOutBefore)
            .equalTo(
              CurrencyAmount.fromRawAmount(
                tokenOut,
                expandDecimals(tokenOut, checkTokenOutAmount)
              )
            )
        );
      }
      checkQuoteToken(
        tokenInBefore,
        tokenInAfter,
        CurrencyAmount.fromRawAmount(tokenIn, quote.quotient)
      );
    }
  }

  beforeAll(async () => {
    alice = hardhat.providers[0]!.getSigner();
    const aliceAddress = await alice.getAddress();
    expect(aliceAddress).toBe(alice._address);

    // Fund alice's account
    await Promise.all([
    hardhat.fund(
      alice._address,
      [
        parseAmount('8000000', USDC_MAINNET),
        parseAmount('5000000', USDT_MAINNET),
        parseAmount('1000', UNI_MAINNET),
        parseAmount('5000000', DAI_MAINNET),
      ],
      [
        '0x47ac0fb4f2d84898e4d9e7b4dab3c24507a6d503', // Binance peg tokens
      ]
    ), hardhat.fund(
      alice._address,
      [parseAmount('4000', WETH9[1])],
      [
        '0x6555e1CC97d3cbA6eAddebBCD7Ca51d75771e0B8', // WETH token
      ]
    )]);

    // Validate alice's balances
    const [eth, usdc, usdt, weth9, dai, uni] = await Promise.all([
      hardhat.provider.getBalance(alice._address),
      hardhat.getBalance(alice._address, USDC_MAINNET),
      hardhat.getBalance(alice._address, USDT_MAINNET),
      hardhat.getBalance(alice._address, WETH9[1]),
      hardhat.getBalance(alice._address, DAI_MAINNET),
      hardhat.getBalance(alice._address, UNI_MAINNET),
    ])
    expect(eth).toEqual(parseEther('10000')); // alice should always have 10000 ETH
    expect(usdc).toEqual(parseAmount('8000000', USDC_MAINNET));
    expect(usdt).toEqual(parseAmount('5000000', USDT_MAINNET));
    expect(weth9).toEqual(parseAmount('4000', WETH9[1]));
    expect(dai).toEqual(parseAmount('5000000', DAI_MAINNET));
    expect(uni).toEqual(parseAmount('1000', UNI_MAINNET));

    multicall2Provider = new UniswapMulticallProvider(
      ChainId.MAINNET,
      hardhat.provider,
    );
    alphaRouter = new AlphaRouter({
      chainId: ChainId.MAINNET,
      provider: hardhat.providers[0]!,
      multicall2Provider,
    });
  });

  /**
   *  tests are 1:1 with routing api integ tests
   */
  for (const tradeType of [TradeType.EXACT_INPUT, TradeType.EXACT_OUTPUT]) {
    describe(`${ID_TO_NETWORK_NAME(1)} alpha - ${TradeType[tradeType]}`, () => {
      describe(`+ simulate swap`, () => {
        it.only('erc20 -> erc20', async () => {
          // declaring these to reduce confusion
          const tokenIn = USDC_MAINNET;
          const tokenOut = USDT_MAINNET;
          const amount =
            tradeType == TradeType.EXACT_INPUT
              ? parseAmount('100', tokenIn)
              : parseAmount('100', tokenOut);

          console.log('zzmp:SWAP')
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
            }
          );

          expect(swap).toBeDefined();
          expect(swap).not.toBeNull();

          const { quote, quoteGasAdjusted, methodParameters } = swap!;

          console.log('zzmp:VALIDATE_ROUTE')
          await validateSwapRoute(quote, quoteGasAdjusted, tradeType, 100, 10);

          console.log('zzmp:VALIDATE_EXECUTE')
          await validateExecuteSwap(
            quote,
            tokenIn,
            tokenOut,
            methodParameters,
            tradeType,
            100,
            100
          );
        });

        it(`erc20 -> eth`, async () => {
          const tokenIn = USDC_MAINNET;
          const tokenOut = Ether.onChain(1) as Currency;
          const amount =
            tradeType == TradeType.EXACT_INPUT
              ? parseAmount('1000000', tokenIn)
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
              ...ROUTING_CONFIG,
            }
          );
          expect(swap).toBeDefined();
          expect(swap).not.toBeNull();

          const { quote, quoteGasAdjusted, methodParameters } = swap!;

          await validateSwapRoute(quote, quoteGasAdjusted, tradeType);

          await validateExecuteSwap(
            quote,
            tokenIn,
            tokenOut,
            methodParameters,
            tradeType,
            1000000
          );
        });

        it(`erc20 -> eth large trade`, async () => {
          // Trade of this size almost always results in splits.
          const tokenIn = USDC_MAINNET;
          const tokenOut = Ether.onChain(1) as Currency;
          const amount =
            tradeType == TradeType.EXACT_INPUT
              ? parseAmount('1000000', tokenIn)
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
            }
          );
          expect(swap).toBeDefined();
          expect(swap).not.toBeNull();

          const { quote, methodParameters } = swap!;

          const { route } = swap!;

          expect(route).not.toBeUndefined;

          const amountInEdgesTotal = _(route)
            // Defineness check first
            .filter((routeWithValidQuote) =>
              tradeType == TradeType.EXACT_INPUT
                ? !!routeWithValidQuote.amount.quotient
                : !!routeWithValidQuote.quote.quotient
            )
            .map((routeWithValidQuote) =>
              tradeType == TradeType.EXACT_INPUT
                ? BigNumber.from(routeWithValidQuote.amount.quotient.toString())
                : BigNumber.from(routeWithValidQuote.quote.quotient.toString())
            )
            .reduce((cur, total) => total.add(cur), BigNumber.from(0));
          /**
           * @dev for exactIn, make sure the sum of the amountIn to every split = total amountIn for the route
           * @dev for exactOut, make sure the sum of the quote of every split = total quote for the route
           */
          const amountIn =
            tradeType == TradeType.EXACT_INPUT
              ? BigNumber.from(amount.quotient.toString())
              : BigNumber.from(quote.quotient.toString());
          expect(amountIn).toEqual(amountInEdgesTotal);

          const amountOutEdgesTotal = _(route)
            .filter((routeWithValidQuote) =>
              tradeType == TradeType.EXACT_INPUT
                ? !!routeWithValidQuote.quote.quotient
                : !!routeWithValidQuote.amount.quotient
            )
            .map((routeWithValidQuote) =>
              tradeType == TradeType.EXACT_INPUT
                ? BigNumber.from(routeWithValidQuote.quote.quotient.toString())
                : BigNumber.from(routeWithValidQuote.amount.quotient.toString())
            )
            .reduce((cur, total) => total.add(cur), BigNumber.from(0));
          /**
           * @dev for exactIn, make sure the sum of the quote to every split = total quote for the route
           * @dev for exactOut, make sure the sum of the amountIn of every split = total amountIn for the route
           */
          const amountOut =
            tradeType == TradeType.EXACT_INPUT
              ? BigNumber.from(quote.quotient.toString())
              : BigNumber.from(amount.quotient.toString());
          expect(amountOut).toEqual(amountOutEdgesTotal);

          await validateExecuteSwap(
            quote,
            tokenIn,
            tokenOut,
            methodParameters,
            tradeType,
            1000000
          );
        });

        it(`eth -> erc20`, async () => {
          const tokenIn = Ether.onChain(1) as Currency;
          const tokenOut = UNI_MAINNET;
          const amount =
            tradeType == TradeType.EXACT_INPUT
              ? parseAmount('10', tokenIn)
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
              ...ROUTING_CONFIG,
              protocols: [Protocol.V2],
            }
          );
          expect(swap).toBeDefined();
          expect(swap).not.toBeNull();

          const { quote, methodParameters } = swap!;

          expect(methodParameters).not.toBeUndefined();

          const { tokenInBefore, tokenInAfter, tokenOutBefore, tokenOutAfter } =
            await executeSwap(methodParameters!, tokenIn, tokenOut);

          if (tradeType == TradeType.EXACT_INPUT) {
            // We've swapped 10 ETH + gas costs
            expect(
              tokenInBefore
                .subtract(tokenInAfter)
                .greaterThan(parseAmount('10', tokenIn))
            ).toBe(true);
            checkQuoteToken(
              tokenOutBefore,
              tokenOutAfter,
              CurrencyAmount.fromRawAmount(tokenOut, quote.quotient)
            );
          } else {
            /**
             * @dev it is possible for an exactOut to generate more tokens on V2 due to precision errors
             */
            expect(
              !tokenOutAfter
                .subtract(tokenOutBefore)
                // == .greaterThanOrEqualTo
                .lessThan(
                  CurrencyAmount.fromRawAmount(
                    tokenOut,
                    expandDecimals(tokenOut, 10000)
                  )
                )
            ).toBe(true);
            // Can't easily check slippage for ETH due to gas costs effecting ETH balance.
          }
        });

        it(`weth -> erc20`, async () => {
          const tokenIn = WETH9[1];
          const tokenOut = DAI_MAINNET;
          const amount =
            tradeType == TradeType.EXACT_INPUT
              ? parseAmount('100', tokenIn)
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
            }
          );
          expect(swap).toBeDefined();
          expect(swap).not.toBeNull();

          const { quote, methodParameters } = swap!;

          await validateExecuteSwap(
            quote,
            tokenIn,
            tokenOut,
            methodParameters,
            tradeType,
            100,
            100
          );
        });

        it(`erc20 -> weth`, async () => {
          const tokenIn = USDC_MAINNET;
          const tokenOut = WETH9[1];
          const amount =
            tradeType == TradeType.EXACT_INPUT
              ? parseAmount('100', tokenIn)
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
            }
          );
          expect(swap).toBeDefined();
          expect(swap).not.toBeNull();

          const { quote, methodParameters } = swap!;

          await validateExecuteSwap(
            quote,
            tokenIn,
            tokenOut,
            methodParameters,
            tradeType,
            100,
            100
          );
        });

        it('erc20 -> erc20 v3 only', async () => {
          const tokenIn = USDC_MAINNET;
          const tokenOut = USDT_MAINNET;
          const amount =
            tradeType == TradeType.EXACT_INPUT
              ? parseAmount('100', tokenIn)
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

          const { quote, quoteGasAdjusted, methodParameters } = swap!;

          const { route } = swap!;

          for (const r of route) {
            expect(r.protocol).toEqual('V3');
          }

          await validateSwapRoute(quote, quoteGasAdjusted, tradeType, 100, 10);

          await validateExecuteSwap(
            quote,
            tokenIn,
            tokenOut,
            methodParameters,
            tradeType,
            100,
            100
          );
        });

        it('erc20 -> erc20 v2 only', async () => {
          const tokenIn = USDC_MAINNET;
          const tokenOut = USDT_MAINNET;
          const amount =
            tradeType == TradeType.EXACT_INPUT
              ? parseAmount('100', tokenIn)
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
              protocols: [Protocol.V2],
            }
          );
          expect(swap).toBeDefined();
          expect(swap).not.toBeNull();

          const { quote, quoteGasAdjusted, methodParameters } = swap!;

          const { route } = swap!;

          for (const r of route) {
            expect(r.protocol).toEqual('V2');
          }

          await validateSwapRoute(quote, quoteGasAdjusted, tradeType, 100, 10);

          await validateExecuteSwap(
            quote,
            tokenIn,
            tokenOut,
            methodParameters,
            tradeType,
            100,
            100
          );
        });

        it('erc20 -> erc20 forceCrossProtocol', async () => {
          const tokenIn = USDC_MAINNET;
          const tokenOut = USDT_MAINNET;
          const amount =
            tradeType == TradeType.EXACT_INPUT
              ? parseAmount('100', tokenIn)
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
              forceCrossProtocol: true,
            }
          );
          expect(swap).toBeDefined();
          expect(swap).not.toBeNull();

          const { quote, quoteGasAdjusted, methodParameters } = swap!;

          const { route } = swap!;

          let hasV3Pool = false;
          let hasV2Pool = false;
          for (const r of route) {
            if (r.protocol == 'V3') {
              hasV3Pool = true;
            }
            if (r.protocol == 'V2') {
              hasV2Pool = true;
            }
          }

          expect(hasV3Pool && hasV2Pool).toBe(true);

          await validateSwapRoute(quote, quoteGasAdjusted, tradeType, 100, 10);

          await validateExecuteSwap(
            quote,
            tokenIn,
            tokenOut,
            methodParameters,
            tradeType,
            100,
            100
          );
        });
      });

      it(`erc20 -> erc20 no recipient/deadline/slippage`, async () => {
        const tokenIn = USDC_MAINNET;
        const tokenOut = USDT_MAINNET;
        const amount =
          tradeType == TradeType.EXACT_INPUT
            ? parseAmount('100', tokenIn)
            : parseAmount('100', tokenOut);

        const swap = await alphaRouter.route(
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

        const { quote, quoteGasAdjusted } = swap!;

        await validateSwapRoute(quote, quoteGasAdjusted, tradeType, 100, 10);
      });

      it(`erc20 -> erc20 gas price specified`, async () => {
        const tokenIn = USDC_MAINNET;
        const tokenOut = USDT_MAINNET;
        const amount =
          tradeType == TradeType.EXACT_INPUT
            ? parseAmount('100', tokenIn)
            : parseAmount('100', tokenOut);

        const gasPriceWeiBN = BigNumber.from(60000000000);
        const gasPriceProvider = new StaticGasPriceProvider(gasPriceWeiBN);
        // Create a new AlphaRouter with the new gas price provider
        const customAlphaRouter: AlphaRouter = new AlphaRouter({
          chainId: 1,
          provider: hardhat.providers[0]!,
          multicall2Provider,
          gasPriceProvider,
        });

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

        const { quote, quoteGasAdjusted, gasPriceWei } = swap!;

        expect(gasPriceWei.eq(BigNumber.from(60000000000))).toBe(true);

        await validateSwapRoute(quote, quoteGasAdjusted, tradeType, 100, 10);
      });
    });
  }
});
