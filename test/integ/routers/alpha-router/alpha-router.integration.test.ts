/**
 * @jest-environment hardhat
 */
/// <reference types="../../../types/bunyan-debug-stream" />

import {
  Currency,
  CurrencyAmount,
  Ether,
  Percent,
  Token,
  TradeType,
} from '@uniswap/sdk-core';
import {
  AlphaRouter,
  AlphaRouterConfig,
  CEUR_CELO,
  CEUR_CELO_ALFAJORES,
  ChainId,
  CUSD_CELO,
  CUSD_CELO_ALFAJORES,
  DAI_MAINNET,
  DAI_ON,
  ID_TO_NETWORK_NAME,
  ID_TO_PROVIDER,
  MixedRouteQuoteProvider,
  nativeOnChain,
  NATIVE_CURRENCY,
  parseAmount,
  SUPPORTED_CHAINS,
  UniswapMulticallProvider,
  UNI_GÖRLI,
  UNI_MAINNET,
  USDC_ETHEREUM_GNOSIS,
  USDC_MAINNET,
  USDC_ON,
  USDT_MAINNET,
  V3_CORE_FACTORY_ADDRESSES,
  WBTC_GNOSIS,
  WBTC_MOONBEAM,
  WETH9,
  WNATIVE_ON,
  WRAPPED_NATIVE_CURRENCY,
} from '../../../../src';

import 'jest-environment-hardhat';

import { JsonRpcProvider, JsonRpcSigner } from '@ethersproject/providers';
import { Protocol } from '@uniswap/router-sdk';
import { MethodParameters } from '@uniswap/v3-sdk';
import { BigNumber, providers } from 'ethers';
import { parseEther } from 'ethers/lib/utils';
import _ from 'lodash';
import { StaticGasPriceProvider } from '../../../../src/providers/static-gas-price-provider';
import { DEFAULT_ROUTING_CONFIG_BY_CHAIN } from '../../../../src/routers/alpha-router/config';
import { getBalanceAndApprove } from '../../../test-util/getBalanceAndApprove';

import QuoterV3_ABI from '../../../../src/abis/QuoterV3.json';
const V2_FACTORY = '0x5C69bEe701ef814a2B6a3EDD4B1652CB9cc5aA6f';
const SWAP_ROUTER_V2 = '0x68b3465833fb72A70ecDF485E0e4C7bD8665Fc45';
const SLIPPAGE = new Percent(5, 100); // 5% or 10_000?

import bunyan from 'bunyan';
import bunyanDebugStream from 'bunyan-debug-stream';

const logLevel =
  process.env.DEBUG || process.env.DEBUG_JSON ? bunyan.DEBUG : bunyan.INFO;
// @ts-ignore[TS6133]
let logger = bunyan.createLogger({
  name: 'Uniswap Smart Order Router',
  serializers: bunyan.stdSerializers,
  level: logLevel,
  streams: process.env.DEBUG_JSON
    ? undefined
    : [
        {
          level: logLevel,
          type: 'stream',
          stream: bunyanDebugStream({
            basepath: __dirname,
            forceColor: false,
            showDate: false,
            showPid: false,
            showLoggerName: false,
            showLevel: !!process.env.DEBUG,
          }),
        },
      ],
});

// setGlobalLogger(logger);

const checkQuoteToken = (
  before: CurrencyAmount<Currency>,
  after: CurrencyAmount<Currency>,
  tokensQuoted: CurrencyAmount<Currency>
) => {
  // Check which is bigger to support exactIn and exactOut
  const tokensSwapped = after.greaterThan(before)
    ? after.subtract(before)
    : before.subtract(after);
  const tokensDiff = tokensQuoted.greaterThan(tokensSwapped)
    ? tokensQuoted.subtract(tokensSwapped)
    : tokensSwapped.subtract(tokensQuoted);
  const percentDiff = tokensDiff.asFraction.divide(tokensQuoted.asFraction);
  expect(percentDiff.lessThan(SLIPPAGE)).toBe(true);
};

const getQuoteToken = (
  tokenIn: Currency,
  tokenOut: Currency,
  tradeType: TradeType
): Currency => {
  return tradeType == TradeType.EXACT_INPUT ? tokenOut : tokenIn;
};

export function parseDeadline(deadline: number): number {
  return Math.floor(Date.now() / 1000) + deadline;
}

const expandDecimals = (currency: Currency, amount: number): number => {
  return amount * 10 ** currency.decimals;
};

describe('alpha router integration', () => {
  let alice: JsonRpcSigner;
  jest.setTimeout(500 * 1000); // 500s

  let alphaRouter: AlphaRouter;
  const multicall2Provider = new UniswapMulticallProvider(
    ChainId.MAINNET,
    hardhat.provider
  );

  const ROUTING_CONFIG: AlphaRouterConfig = {
    // @ts-ignore[TS7053] - complaining about switch being non exhaustive
    ...DEFAULT_ROUTING_CONFIG_BY_CHAIN[ChainId.MAINNET],
    protocols: [Protocol.V3, Protocol.V2],
  };

  const executeSwap = async (
    methodParameters: MethodParameters,
    tokenIn: Currency,
    tokenOut: Currency
  ): Promise<{
    tokenInAfter: CurrencyAmount<Currency>;
    tokenInBefore: CurrencyAmount<Currency>;
    tokenOutAfter: CurrencyAmount<Currency>;
    tokenOutBefore: CurrencyAmount<Currency>;
  }> => {
    expect(tokenIn.symbol).not.toBe(tokenOut.symbol);
    // We use this helper function for approving rather than hardhat.provider.approve
    // because there is custom logic built in for handling USDT and other checks
    const tokenInBefore = await getBalanceAndApprove(
      alice,
      SWAP_ROUTER_V2,
      tokenIn
    );
    const tokenOutBefore = await hardhat.getBalance(alice._address, tokenOut);

    console.log(methodParameters.calldata);

    const transaction = {
      data: methodParameters.calldata,
      to: SWAP_ROUTER_V2,
      value: BigNumber.from(methodParameters.value),
      from: alice._address,
      gasPrice: BigNumber.from(2000000000000),
      type: 1,
    };

    const transactionResponse: providers.TransactionResponse =
      await alice.sendTransaction(transaction);

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
  };

  /**
   * Function to validate swapRoute data.
   * @param quote: CurrencyAmount<Currency>
   * @param quoteGasAdjusted: CurrencyAmount<Currency>
   * @param tradeType: TradeType
   * @param targetQuoteDecimalsAmount?: number - if defined, checks that the quoteDecimals is within the range of this +/- acceptableDifference (non inclusive bounds)
   * @param acceptableDifference?: number - see above
   */
  const validateSwapRoute = async (
    quote: CurrencyAmount<Currency>,
    quoteGasAdjusted: CurrencyAmount<Currency>,
    tradeType: TradeType,
    targetQuoteDecimalsAmount?: number,
    acceptableDifference?: number
  ) => {
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
  };

  /**
   * Function to perform a call to executeSwap and validate the response
   * @param quote: CurrencyAmount<Currency>
   * @param tokenIn: Currency
   * @param tokenOut: Currency
   * @param methodParameters: MethodParameters
   * @param tradeType: TradeType
   * @param checkTokenInAmount?: number - if defined, check that the tokenInBefore - tokenInAfter = checkTokenInAmount
   * @param checkTokenOutAmount?: number - if defined, check that the tokenOutBefore - tokenOutAfter = checkTokenOutAmount
   */
  const validateExecuteSwap = async (
    quote: CurrencyAmount<Currency>,
    tokenIn: Currency,
    tokenOut: Currency,
    methodParameters: MethodParameters | undefined,
    tradeType: TradeType,
    checkTokenInAmount?: number,
    checkTokenOutAmount?: number
  ) => {
    expect(methodParameters).not.toBeUndefined();
    const { tokenInBefore, tokenInAfter, tokenOutBefore, tokenOutAfter } =
      await executeSwap(methodParameters!, tokenIn, tokenOut!);

    if (tradeType == TradeType.EXACT_INPUT) {
      if (checkTokenInAmount) {
        expect(
          tokenInBefore
            .subtract(tokenInAfter)
            .equalTo(
              CurrencyAmount.fromRawAmount(
                tokenIn,
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
  };

  beforeAll(async () => {
    alice = hardhat.providers[0]!.getSigner();
    const aliceAddress = await alice.getAddress();
    expect(aliceAddress).toBe(alice._address);

    const QuoterV3Factory =
      await hardhat.hre.ethers.getContractFactoryFromArtifact(
        QuoterV3_ABI,
        alice
      );
    const QuoterV3 = await QuoterV3Factory.deploy(
      V3_CORE_FACTORY_ADDRESSES[ChainId.MAINNET],
      V2_FACTORY,
      WRAPPED_NATIVE_CURRENCY[ChainId.MAINNET].address // TODO: change to be chain dependent
    );

    const QuoterV3Address = QuoterV3.address;

    await hardhat.fund(
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
    );

    await hardhat.fund(
      alice._address,
      [parseAmount('4000', WETH9[1])],
      [
        '0x6555e1CC97d3cbA6eAddebBCD7Ca51d75771e0B8', // WETH token
      ]
    );

    // alice should always have 10000 ETH
    const aliceEthBalance = await hardhat.provider.getBalance(alice._address);
    /// Since alice is deploying the QuoterV3 contract, expect to have slightly less than 10_000 ETH but not too little
    expect(aliceEthBalance.toBigInt()).toBeGreaterThanOrEqual(
      parseEther('9995').toBigInt()
    );
    const aliceUSDCBalance = await hardhat.getBalance(
      alice._address,
      USDC_MAINNET
    );
    expect(aliceUSDCBalance).toEqual(parseAmount('8000000', USDC_MAINNET));
    const aliceUSDTBalance = await hardhat.getBalance(
      alice._address,
      USDT_MAINNET
    );
    expect(aliceUSDTBalance).toEqual(parseAmount('5000000', USDT_MAINNET));
    const aliceWETH9Balance = await hardhat.getBalance(
      alice._address,
      WETH9[1]
    );
    expect(aliceWETH9Balance).toEqual(parseAmount('4000', WETH9[1]));
    const aliceDAIBalance = await hardhat.getBalance(
      alice._address,
      DAI_MAINNET
    );
    expect(aliceDAIBalance).toEqual(parseAmount('5000000', DAI_MAINNET));
    const aliceUNIBalance = await hardhat.getBalance(
      alice._address,
      UNI_MAINNET
    );
    expect(aliceUNIBalance).toEqual(parseAmount('1000', UNI_MAINNET));

    alphaRouter = new AlphaRouter({
      chainId: ChainId.MAINNET,
      provider: hardhat.providers[0]!,
      multicall2Provider,
      mixedRouteQuoteProvider: new MixedRouteQuoteProvider(
        ChainId.MAINNET,
        hardhat.provider,
        multicall2Provider,
        /// Same config as V3QuoteProvider
        {
          retries: 2,
          minTimeout: 100,
          maxTimeout: 1000,
        },
        {
          multicallChunk: 210,
          gasLimitPerCall: 705_000,
          quoteMinSuccessRate: 0.15,
        },
        {
          gasLimitOverride: 2_000_000,
          multicallChunk: 70,
        },
        undefined,
        undefined,
        QuoterV3Address
      ),
    });
  });

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

          const { quote, quoteGasAdjusted, methodParameters } = swap!;

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

  describe.only('QuoterV3', () => {
    const WISE_MAINNET = new Token(
      1,
      '0x66a0f676479Cee1d7373f3DC2e2952778BfF5bd6',
      18,
      'WISE',
      'WISE'
    );
    const tradeType = TradeType.EXACT_INPUT;

    beforeAll(async () => {
      await hardhat.fund(
        alice._address,
        [parseAmount('1000', WISE_MAINNET)],
        [
          '0xa66e19298a50d6e33fd6756af15d81dae39b47ee', // WISE token
        ]
      );
      const aliceWISEBalance = await hardhat.getBalance(
        alice._address,
        WISE_MAINNET
      );
      expect(aliceWISEBalance).toEqual(parseAmount('1000', WISE_MAINNET));
    });

    describe(`${
      tradeType === TradeType.EXACT_INPUT ? 'exactInput' : 'exactOutput'
    } mixedPath routes`, () => {
      describe('+ simulate swap', () => {
        it('WISE -> USDC', async () => {
          // WISE liq on v3 is 0 to none so we should expect WISE -[v2]> ETH -[v3]> USDC
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
              // recipient: alice._address,
              recipient: '0x47ac0fb4f2d84898e4d9e7b4dab3c24507a6d503', // binance whale
              slippageTolerance: SLIPPAGE,
              deadline: parseDeadline(10000), // parseDeadline(360),
            },
            {
              ...ROUTING_CONFIG,
              protocols: [Protocol.V2, Protocol.V3, Protocol.MIXED],
              // minSplits: 2,
              // maxSplits: 5,
            }
          );

          expect(swap).toBeDefined();
          expect(swap).not.toBeNull();

          const { quote, quoteGasAdjusted, methodParameters } = swap!;
          console.log(
            'swap.estimatedGasUsed',
            swap!.estimatedGasUsed.toNumber()
          );

          await validateSwapRoute(quote, quoteGasAdjusted, tradeType);

          await validateExecuteSwap(
            quote,
            tokenIn,
            tokenOut,
            methodParameters,
            tradeType,
            100
          );
        });
      });
    });
  });
});

xdescribe('quote for other networks', () => {
  const TEST_ERC20_1: { [chainId in ChainId]: Token } = {
    [ChainId.MAINNET]: USDC_ON(1),
    [ChainId.ROPSTEN]: USDC_ON(ChainId.ROPSTEN),
    [ChainId.RINKEBY]: USDC_ON(ChainId.RINKEBY),
    [ChainId.GÖRLI]: UNI_GÖRLI,
    [ChainId.KOVAN]: USDC_ON(ChainId.KOVAN),
    [ChainId.OPTIMISM]: USDC_ON(ChainId.OPTIMISM),
    [ChainId.OPTIMISTIC_KOVAN]: USDC_ON(ChainId.OPTIMISTIC_KOVAN),
    [ChainId.ARBITRUM_ONE]: USDC_ON(ChainId.ARBITRUM_ONE),
    [ChainId.ARBITRUM_RINKEBY]: USDC_ON(ChainId.ARBITRUM_RINKEBY),
    [ChainId.POLYGON]: USDC_ON(ChainId.POLYGON),
    [ChainId.POLYGON_MUMBAI]: USDC_ON(ChainId.POLYGON_MUMBAI),
    [ChainId.CELO]: CUSD_CELO,
    [ChainId.CELO_ALFAJORES]: CUSD_CELO_ALFAJORES,
    [ChainId.GNOSIS]: WBTC_GNOSIS,
    [ChainId.MOONBEAM]: WBTC_MOONBEAM,
  };
  const TEST_ERC20_2: { [chainId in ChainId]: Token } = {
    [ChainId.MAINNET]: DAI_ON(1),
    [ChainId.ROPSTEN]: DAI_ON(ChainId.ROPSTEN),
    [ChainId.RINKEBY]: DAI_ON(ChainId.RINKEBY),
    [ChainId.GÖRLI]: DAI_ON(ChainId.GÖRLI),
    [ChainId.KOVAN]: DAI_ON(ChainId.KOVAN),
    [ChainId.OPTIMISM]: DAI_ON(ChainId.OPTIMISM),
    [ChainId.OPTIMISTIC_KOVAN]: DAI_ON(ChainId.OPTIMISTIC_KOVAN),
    [ChainId.ARBITRUM_ONE]: DAI_ON(ChainId.ARBITRUM_ONE),
    [ChainId.ARBITRUM_RINKEBY]: DAI_ON(ChainId.ARBITRUM_RINKEBY),
    [ChainId.POLYGON]: DAI_ON(ChainId.POLYGON),
    [ChainId.POLYGON_MUMBAI]: DAI_ON(ChainId.POLYGON_MUMBAI),
    [ChainId.CELO]: CEUR_CELO,
    [ChainId.CELO_ALFAJORES]: CEUR_CELO_ALFAJORES,
    [ChainId.GNOSIS]: USDC_ETHEREUM_GNOSIS,
    [ChainId.MOONBEAM]: WBTC_MOONBEAM,
  };

  // TODO: Find valid pools/tokens on optimistic kovan and polygon mumbai. We skip those tests for now.
  for (const chain of _.filter(
    SUPPORTED_CHAINS,
    (c) =>
      c != ChainId.OPTIMISTIC_KOVAN &&
      c != ChainId.POLYGON_MUMBAI &&
      c != ChainId.ARBITRUM_RINKEBY &&
      c != ChainId.OPTIMISM && /// @dev infura has been having issues with optimism lately
      // Tests are failing https://github.com/Uniswap/smart-order-router/issues/104
      c != ChainId.CELO_ALFAJORES
  )) {
    for (const tradeType of [TradeType.EXACT_INPUT, TradeType.EXACT_OUTPUT]) {
      const erc1 = TEST_ERC20_1[chain];
      const erc2 = TEST_ERC20_2[chain];

      describe(`${ID_TO_NETWORK_NAME(chain)} ${tradeType} 2xx`, function () {
        // Help with test flakiness by retrying.
        jest.retryTimes(1);

        const wrappedNative = WNATIVE_ON(chain);

        let alphaRouter: AlphaRouter;

        const chainProvider = ID_TO_PROVIDER(chain);
        const provider = new JsonRpcProvider(chainProvider, chain);
        const multicall2Provider = new UniswapMulticallProvider(
          chain,
          provider
        );

        beforeAll(async () => {
          alphaRouter = new AlphaRouter({
            chainId: chain,
            provider,
            multicall2Provider,
          });
        });

        it(`${wrappedNative.symbol} -> erc20`, async () => {
          const tokenIn = wrappedNative;
          const tokenOut = erc1;
          const amount =
            tradeType == TradeType.EXACT_INPUT
              ? parseAmount('10', tokenIn)
              : parseAmount('10', tokenOut);

          const swap = await alphaRouter.route(
            amount,
            getQuoteToken(tokenIn, tokenOut, tradeType),
            tradeType,
            undefined,
            {
              // @ts-ignore[TS7053] - complaining about switch being non exhaustive
              ...DEFAULT_ROUTING_CONFIG_BY_CHAIN[chain],
              protocols: [Protocol.V3, Protocol.V2],
            }
          );
          expect(swap).toBeDefined();
          expect(swap).not.toBeNull();

          // Scope limited for non mainnet network tests to validating the swap
        });

        it(`erc20 -> erc20`, async () => {
          const tokenIn = erc1;
          const tokenOut = erc2;
          const amount =
            tradeType == TradeType.EXACT_INPUT
              ? parseAmount('1', tokenIn)
              : parseAmount('1', tokenOut);

          const swap = await alphaRouter.route(
            amount,
            getQuoteToken(tokenIn, tokenOut, tradeType),
            tradeType,
            undefined,
            {
              // @ts-ignore[TS7053] - complaining about switch being non exhaustive
              ...DEFAULT_ROUTING_CONFIG_BY_CHAIN[chain],
              protocols: [Protocol.V3, Protocol.V2],
            }
          );
          expect(swap).toBeDefined();
          expect(swap).not.toBeNull();
        });

        const native = NATIVE_CURRENCY[chain];

        it(`${native} -> erc20`, async () => {
          const tokenIn = nativeOnChain(chain);
          const tokenOut = erc2;

          // Celo currently has low liquidity and will not be able to find route for
          // large input amounts
          // TODO: Simplify this when Celo has more liquidity
          const amount =
            chain == ChainId.CELO || chain == ChainId.CELO_ALFAJORES
              ? tradeType == TradeType.EXACT_INPUT
                ? parseAmount('10', tokenIn)
                : parseAmount('10', tokenOut)
              : tradeType == TradeType.EXACT_INPUT
              ? parseAmount('100', tokenIn)
              : parseAmount('100', tokenOut);

          const swap = await alphaRouter.route(
            amount,
            getQuoteToken(tokenIn, tokenOut, tradeType),
            tradeType,
            undefined,
            {
              // @ts-ignore[TS7053] - complaining about switch being non exhaustive
              ...DEFAULT_ROUTING_CONFIG_BY_CHAIN[chain],
              protocols: [Protocol.V3, Protocol.V2],
            }
          );
          expect(swap).toBeDefined();
          expect(swap).not.toBeNull();
        });
        it(`has quoteGasAdjusted values`, async () => {
          const tokenIn = erc1;
          const tokenOut = erc2;
          const amount =
            tradeType == TradeType.EXACT_INPUT
              ? parseAmount('1', tokenIn)
              : parseAmount('1', tokenOut);

          const swap = await alphaRouter.route(
            amount,
            getQuoteToken(tokenIn, tokenOut, tradeType),
            tradeType,
            undefined,
            {
              // @ts-ignore[TS7053] - complaining about switch being non exhaustive
              ...DEFAULT_ROUTING_CONFIG_BY_CHAIN[chain],
              protocols: [Protocol.V3, Protocol.V2],
            }
          );
          expect(swap).toBeDefined();
          expect(swap).not.toBeNull();

          const { quote, quoteGasAdjusted } = swap!;

          if (tradeType == TradeType.EXACT_INPUT) {
            // === .lessThanOrEqualTo
            expect(!quoteGasAdjusted.greaterThan(quote)).toBe(true);
          } else {
            // === .greaterThanOrEqualTo
            expect(!quoteGasAdjusted.lessThan(quote)).toBe(true);
          }
        });
      });
    }
  }
});
