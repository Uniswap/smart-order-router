/**
 * @jest-environment hardhat
 */

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
  CachingV3PoolProvider,
  CEUR_CELO,
  CEUR_CELO_ALFAJORES,
  ChainId,
  CUSD_CELO,
  CUSD_CELO_ALFAJORES,
  DAI_MAINNET,
  DAI_ON,
  EthEstimateGasSimulator,
  FallbackTenderlySimulator,
  ID_TO_NETWORK_NAME,
  ID_TO_PROVIDER,
  MethodParameters,
  MixedRoute,
  nativeOnChain,
  NATIVE_CURRENCY,
  NodeJSCache,
  OnChainQuoteProvider,
  parseAmount,
  setGlobalLogger,
  SimulationStatus,
  StaticGasPriceProvider,
  SUPPORTED_CHAINS,
  // SUPPORTED_CHAINS,
  SwapOptions,
  SwapType,
  SWAP_ROUTER_02_ADDRESSES,
  TenderlySimulator,
  UniswapMulticallProvider,
  UNI_GÖRLI,
  UNI_MAINNET,
  USDC_BSC,
  USDC_ETHEREUM_GNOSIS,
  USDC_MAINNET,
  USDC_ON,
  USDT_BSC,
  USDT_MAINNET,
  V2PoolProvider,
  V2Route,
  V2_SUPPORTED,
  V3PoolProvider,
  V3Route,
  WBTC_GNOSIS,
  WBTC_MOONBEAM,
  WETH9,
  WNATIVE_ON,
} from '../../../../src';
import { WHALES } from '../../../test-util/whales';

import 'jest-environment-hardhat';

import { JsonRpcProvider, JsonRpcSigner } from '@ethersproject/providers';
import { AllowanceTransfer, PermitSingle } from '@uniswap/permit2-sdk';
import { Protocol } from '@uniswap/router-sdk';
import {
  PERMIT2_ADDRESS,
  UNIVERSAL_ROUTER_ADDRESS as UNIVERSAL_ROUTER_ADDRESS_BY_CHAIN,
} from '@uniswap/universal-router-sdk';
import { Permit2Permit } from '@uniswap/universal-router-sdk/dist/utils/permit2';
import { Pair } from '@uniswap/v2-sdk';
import { encodeSqrtRatioX96, FeeAmount, Pool } from '@uniswap/v3-sdk';
import bunyan from 'bunyan';
import { BigNumber, providers, Wallet } from 'ethers';
import { parseEther } from 'ethers/lib/utils';
import _ from 'lodash';
import NodeCache from 'node-cache';
import { DEFAULT_ROUTING_CONFIG_BY_CHAIN } from '../../../../src/routers/alpha-router/config';
import { Permit2__factory } from '../../../../src/types/other/factories/Permit2__factory';
import { getBalanceAndApprove } from '../../../test-util/getBalanceAndApprove';
const FORK_BLOCK = 16075500;
const UNIVERSAL_ROUTER_ADDRESS = UNIVERSAL_ROUTER_ADDRESS_BY_CHAIN(1);
const SLIPPAGE = new Percent(15, 100); // 5% or 10_000?

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
  expect(percentDiff.lessThan(SLIPPAGE.asFraction)).toBe(true);
};

const getQuoteToken = (
  tokenIn: Currency,
  tokenOut: Currency,
  tradeType: TradeType
): Currency => {
  return tradeType == TradeType.EXACT_INPUT ? tokenOut : tokenIn;
};

export function parseDeadline(deadlineOrPreviousBlockhash: number): number {
  return Math.floor(Date.now() / 1000) + deadlineOrPreviousBlockhash;
}

const expandDecimals = (currency: Currency, amount: number): number => {
  return amount * 10 ** currency.decimals;
};

let warnedTenderly = false;
const isTenderlyEnvironmentSet = (): boolean => {
  const isSet =
    !!process.env.TENDERLY_BASE_URL &&
    !!process.env.TENDERLY_USER &&
    !!process.env.TENDERLY_PROJECT &&
    !!process.env.TENDERLY_ACCESS_KEY;
  if (!isSet && !warnedTenderly) {
    console.log(
      'Skipping Tenderly Simulation Tests since env variables for TENDERLY_BASE_URL, TENDERLY_USER, TENDERLY_PROJECT and TENDERLY_ACCESS_KEY are not set.'
    );
    warnedTenderly = true;
  }
  return isSet;
};

let warnedTesterPK = false;
const isTesterPKEnvironmentSet = (): boolean => {
  const isSet = !!process.env.TESTER_PK;
  if (!isSet && !warnedTesterPK) {
    console.log(
      'Skipping Permit Tenderly Simulation Test since env variables for TESTER_PK is not set.'
    );
    warnedTesterPK = true;
  }
  return isSet;
};

// Flag for enabling logs for debugging integ tests
if (process.env.INTEG_TEST_DEBUG) {
  setGlobalLogger(
    bunyan.createLogger({
      name: 'Uniswap Smart Order Router',
      serializers: bunyan.stdSerializers,
      level: bunyan.DEBUG,
    })
  );
}

jest.retryTimes(0);

describe('alpha router integration', () => {
  let alice: JsonRpcSigner;
  jest.setTimeout(500 * 1000); // 500s

  let curNonce: number = 0;

  let nextPermitNonce: () => string = () => {
    const nonce = curNonce.toString();
    curNonce = curNonce + 1;
    return nonce;
  };

  let alphaRouter: AlphaRouter;
  let customAlphaRouter: AlphaRouter;
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
    swapType: SwapType,
    methodParameters: MethodParameters,
    tokenIn: Currency,
    tokenOut: Currency,
    gasLimit?: BigNumber,
    permit?: boolean
  ): Promise<{
    tokenInAfter: CurrencyAmount<Currency>;
    tokenInBefore: CurrencyAmount<Currency>;
    tokenOutAfter: CurrencyAmount<Currency>;
    tokenOutBefore: CurrencyAmount<Currency>;
  }> => {
    expect(tokenIn.symbol).not.toBe(tokenOut.symbol);
    let transactionResponse: providers.TransactionResponse;

    let tokenInBefore: CurrencyAmount<Currency>;
    let tokenOutBefore: CurrencyAmount<Currency>;
    if (swapType == SwapType.UNIVERSAL_ROUTER) {
      // Approve Permit2
      // We use this helper function for approving rather than hardhat.provider.approve
      // because there is custom logic built in for handling USDT and other checks
      tokenInBefore = await getBalanceAndApprove(
        alice,
        PERMIT2_ADDRESS,
        tokenIn
      );
      const MAX_UINT160 = '0xffffffffffffffffffffffffffffffffffffffff';

      // If not using permit do a regular approval allowing narwhal max balance.
      if (!permit) {
        const aliceP2 = Permit2__factory.connect(PERMIT2_ADDRESS, alice);
        const approveNarwhal = await aliceP2.approve(
          tokenIn.wrapped.address,
          UNIVERSAL_ROUTER_ADDRESS,
          MAX_UINT160,
          20_000_000_000_000
        );
        await approveNarwhal.wait();
      }

      tokenOutBefore = await hardhat.getBalance(alice._address, tokenOut);

      const transaction = {
        data: methodParameters.calldata,
        to: methodParameters.to,
        value: BigNumber.from(methodParameters.value),
        from: alice._address,
        gasPrice: BigNumber.from(2000000000000),
        type: 1,
      };

      if (gasLimit) {
        transactionResponse = await alice.sendTransaction({
          ...transaction,
          gasLimit: gasLimit,
        });
      } else {
        transactionResponse = await alice.sendTransaction(transaction);
      }
    } else {
      tokenInBefore = await getBalanceAndApprove(
        alice,
        SWAP_ROUTER_02_ADDRESSES(tokenIn.chainId),
        tokenIn
      );
      tokenOutBefore = await hardhat.getBalance(alice._address, tokenOut);

      const transaction = {
        data: methodParameters.calldata,
        to: methodParameters.to,
        value: BigNumber.from(methodParameters.value),
        from: alice._address,
        gasPrice: BigNumber.from(2000000000000),
        type: 1,
      };

      if (gasLimit) {
        transactionResponse = await alice.sendTransaction({
          ...transaction,
          gasLimit: gasLimit,
        });
      } else {
        transactionResponse = await alice.sendTransaction(transaction);
      }
    }

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
    swapType: SwapType,
    quote: CurrencyAmount<Currency>,
    tokenIn: Currency,
    tokenOut: Currency,
    methodParameters: MethodParameters | undefined,
    tradeType: TradeType,
    checkTokenInAmount?: number,
    checkTokenOutAmount?: number,
    estimatedGasUsed?: BigNumber,
    permit?: boolean
  ) => {
    expect(methodParameters).not.toBeUndefined();
    const { tokenInBefore, tokenInAfter, tokenOutBefore, tokenOutAfter } =
      await executeSwap(
        swapType,
        methodParameters!,
        tokenIn,
        tokenOut!,
        estimatedGasUsed,
        permit
      );

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
        ).toBe(true);
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
        ).toBe(true);
      }
      checkQuoteToken(
        tokenInBefore,
        tokenInAfter,
        CurrencyAmount.fromRawAmount(tokenIn, quote.quotient)
      );
    }
  };

  beforeAll(async () => {
    await hardhat.fork(FORK_BLOCK);

    alice = hardhat.providers[0]!.getSigner();
    const aliceAddress = await alice.getAddress();
    expect(aliceAddress).toBe(alice._address);

    await hardhat.fund(
      alice._address,
      [parseAmount('8000000', USDC_MAINNET)],
      ['0x8eb8a3b98659cce290402893d0123abb75e3ab28']
    );

    await hardhat.fund(
      alice._address,
      [parseAmount('5000000', USDT_MAINNET)],
      ['0x47ac0Fb4F2D84898e4D9E7b4DaB3C24507a6D503']
    );

    await hardhat.fund(
      alice._address,
      [parseAmount('1000', UNI_MAINNET)],
      ['0x47173b170c64d16393a52e6c480b3ad8c302ba1e']
    );

    await hardhat.fund(
      alice._address,
      [parseAmount('5000000', DAI_MAINNET)],
      ['0x8eb8a3b98659cce290402893d0123abb75e3ab28']
    );

    await hardhat.fund(
      alice._address,
      [parseAmount('4000', WETH9[1])],
      [
        '0x06920c9fc643de77b99cb7670a944ad31eaaa260', // WETH whale
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

    const v3PoolProvider = new CachingV3PoolProvider(
      ChainId.MAINNET,
      new V3PoolProvider(ChainId.MAINNET, multicall2Provider),
      new NodeJSCache(new NodeCache({ stdTTL: 360, useClones: false }))
    );
    const v2PoolProvider = new V2PoolProvider(
      ChainId.MAINNET,
      multicall2Provider
    );

    const ethEstimateGasSimulator = new EthEstimateGasSimulator(
      ChainId.MAINNET,
      hardhat.providers[0]!,
      v2PoolProvider,
      v3PoolProvider
    );

    const tenderlySimulator = new TenderlySimulator(
      ChainId.MAINNET,
      process.env.TENDERLY_BASE_URL!,
      process.env.TENDERLY_USER!,
      process.env.TENDERLY_PROJECT!,
      process.env.TENDERLY_ACCESS_KEY!,
      v2PoolProvider,
      v3PoolProvider,
      hardhat.providers[0]!
    );

    const simulator = new FallbackTenderlySimulator(
      ChainId.MAINNET,
      hardhat.providers[0]!,
      tenderlySimulator,
      ethEstimateGasSimulator
    );

    alphaRouter = new AlphaRouter({
      chainId: ChainId.MAINNET,
      provider: hardhat.providers[0]!,
      multicall2Provider,
      v2PoolProvider,
      v3PoolProvider,
      simulator,
    });

    // this will be used to test gas limit simulation for web flow
    // in the web flow, we won't simulate on tenderly, only through eth estimate gas
    customAlphaRouter = new AlphaRouter({
      chainId: ChainId.MAINNET,
      provider: hardhat.providers[0]!,
      multicall2Provider,
      v2PoolProvider,
      v3PoolProvider,
      simulator: ethEstimateGasSimulator,
    });
  });

  /**
   *  tests are 1:1 with routing api integ tests
   */
  for (const tradeType of [TradeType.EXACT_INPUT, TradeType.EXACT_OUTPUT]) {
    describe(`${ID_TO_NETWORK_NAME(1)} alpha - ${tradeType}`, () => {
      describe(`+ Execute on Hardhat Fork`, () => {
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
              type: SwapType.UNIVERSAL_ROUTER,
              recipient: alice._address,
              slippageTolerance: SLIPPAGE,
              deadlineOrPreviousBlockhash: parseDeadline(360),
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
            SwapType.UNIVERSAL_ROUTER,
            quote,
            tokenIn,
            tokenOut,
            methodParameters,
            tradeType,
            100,
            100
          );
        });

        it('erc20 -> erc20 swapRouter02', async () => {
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
              type: SwapType.SWAP_ROUTER_02,
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
            SwapType.SWAP_ROUTER_02,
            quote,
            tokenIn,
            tokenOut,
            methodParameters,
            tradeType,
            100,
            100
          );
        });

        it('erc20 -> erc20 with permit', async () => {
          // declaring these to reduce confusion
          const tokenIn = USDC_MAINNET;
          const tokenOut = USDT_MAINNET;
          const amount =
            tradeType == TradeType.EXACT_INPUT
              ? parseAmount('100', tokenIn)
              : parseAmount('100', tokenOut);

          const nonce = nextPermitNonce();

          const permit: PermitSingle = {
            details: {
              token: tokenIn.address,
              amount: amount.quotient.toString(),
              expiration: Math.floor(
                new Date().getTime() / 1000 + 100000
              ).toString(),
              nonce,
            },
            spender: UNIVERSAL_ROUTER_ADDRESS,
            sigDeadline: Math.floor(
              new Date().getTime() / 1000 + 100000
            ).toString(),
          };

          const { domain, types, values } = AllowanceTransfer.getPermitData(
            permit,
            PERMIT2_ADDRESS,
            1
          );

          const signature = await alice._signTypedData(domain, types, values);

          const permit2permit: Permit2Permit = {
            ...permit,
            signature,
          };

          const swap = await alphaRouter.route(
            amount,
            getQuoteToken(tokenIn, tokenOut, tradeType),
            tradeType,
            {
              type: SwapType.UNIVERSAL_ROUTER,
              recipient: alice._address,
              slippageTolerance: SLIPPAGE,
              deadlineOrPreviousBlockhash: parseDeadline(360),
              inputTokenPermit: permit2permit,
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
            SwapType.UNIVERSAL_ROUTER,
            quote,
            tokenIn,
            tokenOut,
            methodParameters,
            tradeType,
            100,
            100,
            undefined,
            true
          );
        });

        it('erc20 -> erc20 split trade with permit', async () => {
          // declaring these to reduce confusion
          const tokenIn = USDC_MAINNET;
          const tokenOut = USDT_MAINNET;
          const amount =
            tradeType == TradeType.EXACT_INPUT
              ? parseAmount('10000', tokenIn)
              : parseAmount('10000', tokenOut);

          const nonce = nextPermitNonce();

          const permit: PermitSingle = {
            details: {
              token: tokenIn.address,
              amount: amount.quotient.toString(),
              expiration: Math.floor(
                new Date().getTime() / 1000 + 1000
              ).toString(),
              nonce,
            },
            spender: UNIVERSAL_ROUTER_ADDRESS,
            sigDeadline: Math.floor(
              new Date().getTime() / 1000 + 1000
            ).toString(),
          };

          const { domain, types, values } = AllowanceTransfer.getPermitData(
            permit,
            PERMIT2_ADDRESS,
            1
          );

          const signature = await alice._signTypedData(domain, types, values);

          const permit2permit: Permit2Permit = {
            ...permit,
            signature,
          };

          const swap = await alphaRouter.route(
            amount,
            getQuoteToken(tokenIn, tokenOut, tradeType),
            tradeType,
            {
              type: SwapType.UNIVERSAL_ROUTER,
              recipient: alice._address,
              slippageTolerance: SLIPPAGE,
              deadlineOrPreviousBlockhash: parseDeadline(360),
              inputTokenPermit: permit2permit,
            },
            {
              ...ROUTING_CONFIG,
              minSplits: 3,
            }
          );

          expect(swap).toBeDefined();
          expect(swap).not.toBeNull();

          const { quote, quoteGasAdjusted, methodParameters } = swap!;

          await validateSwapRoute(
            quote,
            quoteGasAdjusted,
            tradeType,
            10000,
            100
          );

          await validateExecuteSwap(
            SwapType.UNIVERSAL_ROUTER,
            quote,
            tokenIn,
            tokenOut,
            methodParameters,
            tradeType,
            10000,
            10000,
            undefined,
            true
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
              type: SwapType.UNIVERSAL_ROUTER,
              recipient: alice._address,
              slippageTolerance: SLIPPAGE,
              deadlineOrPreviousBlockhash: parseDeadline(360),
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
            SwapType.UNIVERSAL_ROUTER,
            quote,
            tokenIn,
            tokenOut,
            methodParameters,
            tradeType,
            1000000
          );
        });

        it(`erc20 -> eth large trade`, async () => {
          const tokenIn = USDC_MAINNET;
          const tokenOut = Ether.onChain(1) as Currency;
          const amount =
            tradeType == TradeType.EXACT_INPUT
              ? parseAmount('10000', tokenIn)
              : parseAmount('10', tokenOut);

          const swap = await alphaRouter.route(
            amount,
            getQuoteToken(tokenIn, tokenOut, tradeType),
            tradeType,
            {
              type: SwapType.UNIVERSAL_ROUTER,
              recipient: alice._address,
              slippageTolerance: SLIPPAGE,
              deadlineOrPreviousBlockhash: parseDeadline(360),
            },
            {
              ...ROUTING_CONFIG,
              minSplits: 2,
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
            SwapType.UNIVERSAL_ROUTER,
            quote,
            tokenIn,
            tokenOut,
            methodParameters,
            tradeType,
            10000
          );
        });

        it(`erc20 -> eth split trade with permit`, async () => {
          const tokenIn = USDC_MAINNET;
          const tokenOut = Ether.onChain(1) as Currency;
          const amount =
            tradeType == TradeType.EXACT_INPUT
              ? parseAmount('1000000', tokenIn)
              : parseAmount('100', tokenOut);

          const nonce = nextPermitNonce();

          const permit: PermitSingle = {
            details: {
              token: tokenIn.address,
              amount: amount.quotient.toString(),
              expiration: Math.floor(
                new Date().getTime() / 1000 + 1000
              ).toString(),
              nonce,
            },
            spender: UNIVERSAL_ROUTER_ADDRESS,
            sigDeadline: Math.floor(
              new Date().getTime() / 1000 + 1000
            ).toString(),
          };

          const { domain, types, values } = AllowanceTransfer.getPermitData(
            permit,
            PERMIT2_ADDRESS,
            1
          );

          const signature = await alice._signTypedData(domain, types, values);

          const permit2permit: Permit2Permit = {
            ...permit,
            signature,
          };

          const swap = await alphaRouter.route(
            amount,
            getQuoteToken(tokenIn, tokenOut, tradeType),
            tradeType,
            {
              type: SwapType.UNIVERSAL_ROUTER,
              recipient: alice._address,
              slippageTolerance: SLIPPAGE.multiply(10),
              deadlineOrPreviousBlockhash: parseDeadline(360),
              inputTokenPermit: permit2permit,
            },
            {
              ...ROUTING_CONFIG,
              minSplits: 2,
            }
          );
          expect(swap).toBeDefined();
          expect(swap).not.toBeNull();

          const { quote, methodParameters } = swap!;

          const { route } = swap!;

          expect(route).not.toBeUndefined;

          await validateExecuteSwap(
            SwapType.UNIVERSAL_ROUTER,
            quote,
            tokenIn,
            tokenOut,
            methodParameters,
            tradeType,
            1000000,
            undefined,
            undefined,
            true
          );
        });

        it(`eth -> erc20`, async () => {
          /// Fails for v3 for some reason, ProviderGasError
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
              type: SwapType.UNIVERSAL_ROUTER,
              recipient: alice._address,
              slippageTolerance: SLIPPAGE,
              deadlineOrPreviousBlockhash: parseDeadline(360),
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
            await executeSwap(
              SwapType.UNIVERSAL_ROUTER,
              methodParameters!,
              tokenIn,
              tokenOut
            );

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

        it(`eth -> erc20 swaprouter02`, async () => {
          /// Fails for v3 for some reason, ProviderGasError
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
              type: SwapType.SWAP_ROUTER_02,
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
            await executeSwap(
              SwapType.SWAP_ROUTER_02,
              methodParameters!,
              tokenIn,
              tokenOut
            );

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
              type: SwapType.UNIVERSAL_ROUTER,
              recipient: alice._address,
              slippageTolerance: SLIPPAGE,
              deadlineOrPreviousBlockhash: parseDeadline(360),
            },
            {
              ...ROUTING_CONFIG,
            }
          );
          expect(swap).toBeDefined();
          expect(swap).not.toBeNull();

          const { quote, methodParameters } = swap!;

          await validateExecuteSwap(
            SwapType.UNIVERSAL_ROUTER,
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
              type: SwapType.UNIVERSAL_ROUTER,
              recipient: alice._address,
              slippageTolerance: SLIPPAGE,
              deadlineOrPreviousBlockhash: parseDeadline(360),
            },
            {
              ...ROUTING_CONFIG,
            }
          );
          expect(swap).toBeDefined();
          expect(swap).not.toBeNull();

          const { quote, methodParameters } = swap!;

          await validateExecuteSwap(
            SwapType.UNIVERSAL_ROUTER,
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
              type: SwapType.UNIVERSAL_ROUTER,
              recipient: alice._address,
              slippageTolerance: SLIPPAGE,
              deadlineOrPreviousBlockhash: parseDeadline(360),
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
            SwapType.UNIVERSAL_ROUTER,
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
              type: SwapType.UNIVERSAL_ROUTER,
              recipient: alice._address,
              slippageTolerance: SLIPPAGE,
              deadlineOrPreviousBlockhash: parseDeadline(360),
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
            SwapType.UNIVERSAL_ROUTER,
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
              type: SwapType.UNIVERSAL_ROUTER,
              recipient: alice._address,
              slippageTolerance: SLIPPAGE,
              deadlineOrPreviousBlockhash: parseDeadline(360),
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
            SwapType.UNIVERSAL_ROUTER,
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

      if (isTenderlyEnvironmentSet()) {
        describe(`+ Simulate on Tenderly + Execute on Hardhat fork`, () => {
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
                type: SwapType.UNIVERSAL_ROUTER,
                recipient: alice._address,
                slippageTolerance: SLIPPAGE,
                deadlineOrPreviousBlockhash: parseDeadline(360),
                simulate: { fromAddress: WHALES(tokenIn) },
              },
              {
                ...ROUTING_CONFIG,
              }
            );

            expect(swap).toBeDefined();
            expect(swap).not.toBeNull();

            // Expect tenderly simulation to be successful
            expect(swap!.simulationStatus).toEqual(SimulationStatus.Succeeded);
            expect(swap!.methodParameters).toBeDefined();
            expect(swap!.methodParameters!.to).toBeDefined();

            const { quote, quoteGasAdjusted, methodParameters } = swap!;

            await validateSwapRoute(
              quote,
              quoteGasAdjusted,
              tradeType,
              100,
              10
            );

            await validateExecuteSwap(
              SwapType.UNIVERSAL_ROUTER,
              quote,
              tokenIn,
              tokenOut,
              methodParameters,
              tradeType,
              100,
              100
            );
          });

          it('erc20 -> erc20 swaprouter02', async () => {
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
                type: SwapType.SWAP_ROUTER_02,
                recipient: alice._address,
                slippageTolerance: SLIPPAGE,
                deadline: parseDeadline(360),
                simulate: { fromAddress: WHALES(tokenIn) },
              },
              {
                ...ROUTING_CONFIG,
              }
            );

            expect(swap).toBeDefined();
            expect(swap).not.toBeNull();

            const {
              quote,
              quoteGasAdjusted,
              methodParameters,
              simulationStatus,
            } = swap!;

            await validateSwapRoute(
              quote,
              quoteGasAdjusted,
              tradeType,
              100,
              10
            );

            expect(simulationStatus).toBeDefined();
            expect(simulationStatus).toEqual(SimulationStatus.Succeeded);

            await validateExecuteSwap(
              SwapType.SWAP_ROUTER_02,
              quote,
              tokenIn,
              tokenOut,
              methodParameters,
              tradeType,
              100,
              100
            );
          });

          if (isTesterPKEnvironmentSet()) {
            it('erc20 -> erc20 with permit with tester pk', async () => {
              // This test requires a private key with at least 10 USDC
              // at FORK_BLOCK time.

              // declaring these to reduce confusion
              const tokenIn = USDC_MAINNET;
              const tokenOut = USDT_MAINNET;
              const amount =
                tradeType == TradeType.EXACT_INPUT
                  ? parseAmount('10', tokenIn)
                  : parseAmount('10', tokenOut);

              const nonce = '0';

              const permit: PermitSingle = {
                details: {
                  token: tokenIn.address,
                  amount: amount.quotient.toString(),
                  expiration: Math.floor(
                    new Date().getTime() / 1000 + 100000
                  ).toString(),
                  nonce,
                },
                spender: UNIVERSAL_ROUTER_ADDRESS,
                sigDeadline: Math.floor(
                  new Date().getTime() / 1000 + 100000
                ).toString(),
              };

              const { domain, types, values } = AllowanceTransfer.getPermitData(
                permit,
                PERMIT2_ADDRESS,
                1
              );

              const wallet = new Wallet(process.env.TESTER_PK!);

              const signature = await wallet._signTypedData(
                domain,
                types,
                values
              );

              const permit2permit: Permit2Permit = {
                ...permit,
                signature,
              };

              const swap = await alphaRouter.route(
                amount,
                getQuoteToken(tokenIn, tokenOut, tradeType),
                tradeType,
                {
                  type: SwapType.UNIVERSAL_ROUTER,
                  recipient: wallet.address,
                  slippageTolerance: SLIPPAGE,
                  deadlineOrPreviousBlockhash: parseDeadline(360),
                  simulate: { fromAddress: wallet.address },
                  inputTokenPermit: permit2permit,
                },
                {
                  ...ROUTING_CONFIG,
                }
              );

              expect(swap).toBeDefined();
              expect(swap).not.toBeNull();

              expect(swap!.simulationStatus).toEqual(
                SimulationStatus.Succeeded
              );
            });
          }

          it(`erc20 -> eth split trade`, async () => {
            const tokenIn = USDC_MAINNET;
            const tokenOut = Ether.onChain(1) as Currency;
            const amount =
              tradeType == TradeType.EXACT_INPUT
                ? parseAmount('10000', tokenIn)
                : parseAmount('1', tokenOut);

            const swap = await alphaRouter.route(
              amount,
              getQuoteToken(tokenIn, tokenOut, tradeType),
              tradeType,
              {
                type: SwapType.UNIVERSAL_ROUTER,
                recipient: alice._address,
                slippageTolerance: SLIPPAGE,
                deadlineOrPreviousBlockhash: parseDeadline(360),
                simulate: { fromAddress: WHALES(tokenIn) },
              },
              {
                ...ROUTING_CONFIG,
                minSplits: 2,
              }
            );
            expect(swap).toBeDefined();
            expect(swap).not.toBeNull();

            const {
              quote,
              quoteGasAdjusted,
              methodParameters,
              estimatedGasUsed,
              simulationStatus,
              estimatedGasUsedQuoteToken,
            } = swap!;

            expect(
              quoteGasAdjusted
                .subtract(quote)
                .equalTo(estimatedGasUsedQuoteToken)
            );

            expect(simulationStatus).toBeDefined();
            expect(simulationStatus).toEqual(SimulationStatus.Succeeded);

            await validateExecuteSwap(
              SwapType.UNIVERSAL_ROUTER,
              quote,
              tokenIn,
              tokenOut,
              methodParameters,
              tradeType,
              10000,
              undefined,
              estimatedGasUsed
            );
          });

          it(`eth -> erc20`, async () => {
            /// Fails for v3 for some reason, ProviderGasError
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
                type: SwapType.UNIVERSAL_ROUTER,
                recipient: alice._address,
                slippageTolerance: SLIPPAGE,
                deadlineOrPreviousBlockhash: parseDeadline(360),
                simulate: { fromAddress: WHALES(tokenIn) },
              },
              {
                ...ROUTING_CONFIG,
                protocols: [Protocol.V2],
              }
            );
            expect(swap).toBeDefined();
            expect(swap).not.toBeNull();

            const {
              quote,
              quoteGasAdjusted,
              simulationStatus,
              estimatedGasUsedQuoteToken,
            } = swap!;
            expect(
              quoteGasAdjusted
                .subtract(quote)
                .equalTo(estimatedGasUsedQuoteToken)
            );

            expect(simulationStatus).toBeDefined();
            expect(simulationStatus).toEqual(SimulationStatus.Succeeded);
          });

          it(`eth -> erc20 swaprouter02`, async () => {
            /// Fails for v3 for some reason, ProviderGasError
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
                type: SwapType.SWAP_ROUTER_02,
                recipient: alice._address,
                slippageTolerance: SLIPPAGE,
                deadline: parseDeadline(360),
                simulate: { fromAddress: WHALES(tokenIn) },
              },
              {
                ...ROUTING_CONFIG,
                protocols: [Protocol.V2],
              }
            );
            expect(swap).toBeDefined();
            expect(swap).not.toBeNull();

            const {
              quote,
              quoteGasAdjusted,
              simulationStatus,
              estimatedGasUsedQuoteToken,
            } = swap!;
            expect(
              quoteGasAdjusted
                .subtract(quote)
                .equalTo(estimatedGasUsedQuoteToken)
            );

            expect(simulationStatus).toEqual(SimulationStatus.Succeeded);
          });

          it(`weth -> erc20`, async () => {
            const tokenIn = WETH9[1];
            const tokenOut = DAI_MAINNET;
            const amount =
              tradeType == TradeType.EXACT_INPUT
                ? parseAmount('10', tokenIn)
                : parseAmount('10', tokenOut);

            const swap = await alphaRouter.route(
              amount,
              getQuoteToken(tokenIn, tokenOut, tradeType),
              tradeType,
              {
                type: SwapType.UNIVERSAL_ROUTER,
                recipient: alice._address,
                slippageTolerance: new Percent(50, 100),
                deadlineOrPreviousBlockhash: parseDeadline(360),
                simulate: { fromAddress: WHALES(tokenIn) },
              },
              {
                ...ROUTING_CONFIG,
              }
            );
            expect(swap).toBeDefined();
            expect(swap).not.toBeNull();

            const {
              quote,
              quoteGasAdjusted,
              methodParameters,
              estimatedGasUsed,
              simulationStatus,
              estimatedGasUsedQuoteToken,
            } = swap!;

            expect(
              quoteGasAdjusted
                .subtract(quote)
                .equalTo(estimatedGasUsedQuoteToken)
            );

            expect(simulationStatus).toBeDefined();
            expect(simulationStatus).toEqual(SimulationStatus.Succeeded);

            await validateExecuteSwap(
              SwapType.UNIVERSAL_ROUTER,
              quote,
              tokenIn,
              tokenOut,
              methodParameters,
              tradeType,
              10,
              10,
              estimatedGasUsed
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
                type: SwapType.UNIVERSAL_ROUTER,
                recipient: alice._address,
                slippageTolerance: SLIPPAGE,
                deadlineOrPreviousBlockhash: parseDeadline(360),
                simulate: { fromAddress: WHALES(tokenIn) },
              },
              {
                ...ROUTING_CONFIG,
              }
            );
            expect(swap).toBeDefined();
            expect(swap).not.toBeNull();

            const {
              quote,
              quoteGasAdjusted,
              methodParameters,
              estimatedGasUsed,
              simulationStatus,
              estimatedGasUsedQuoteToken,
            } = swap!;

            expect(
              quoteGasAdjusted
                .subtract(quote)
                .equalTo(estimatedGasUsedQuoteToken)
            );

            expect(simulationStatus).toBeDefined();
            expect(simulationStatus).toEqual(SimulationStatus.Succeeded);

            await validateExecuteSwap(
              SwapType.UNIVERSAL_ROUTER,
              quote,
              tokenIn,
              tokenOut,
              methodParameters,
              tradeType,
              100,
              100,
              estimatedGasUsed
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
                type: SwapType.UNIVERSAL_ROUTER,
                recipient: alice._address,
                slippageTolerance: SLIPPAGE,
                deadlineOrPreviousBlockhash: parseDeadline(360),
                simulate: { fromAddress: WHALES(tokenIn) },
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
              quoteGasAdjusted,
              methodParameters,
              estimatedGasUsed,
              simulationStatus,
              estimatedGasUsedQuoteToken,
            } = swap!;
            expect(
              quoteGasAdjusted
                .subtract(quote)
                .equalTo(estimatedGasUsedQuoteToken)
            );

            expect(simulationStatus).toBeDefined();
            expect(simulationStatus).toEqual(SimulationStatus.Succeeded);

            await validateExecuteSwap(
              SwapType.UNIVERSAL_ROUTER,
              quote,
              tokenIn,
              tokenOut,
              methodParameters,
              tradeType,
              100,
              100,
              estimatedGasUsed
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
                type: SwapType.UNIVERSAL_ROUTER,
                recipient: alice._address,
                slippageTolerance: SLIPPAGE,
                deadlineOrPreviousBlockhash: parseDeadline(360),
                simulate: { fromAddress: WHALES(tokenIn) },
              },
              {
                ...ROUTING_CONFIG,
                protocols: [Protocol.V2],
              }
            );
            expect(swap).toBeDefined();
            expect(swap).not.toBeNull();

            const {
              quote,
              quoteGasAdjusted,
              methodParameters,
              estimatedGasUsed,
              simulationStatus,
              estimatedGasUsedQuoteToken,
            } = swap!;

            expect(
              quoteGasAdjusted
                .subtract(quote)
                .equalTo(estimatedGasUsedQuoteToken)
            );

            expect(simulationStatus).toBeDefined();
            expect(simulationStatus).toEqual(SimulationStatus.Succeeded);

            await validateExecuteSwap(
              SwapType.UNIVERSAL_ROUTER,
              quote,
              tokenIn,
              tokenOut,
              methodParameters,
              tradeType,
              100,
              100,
              estimatedGasUsed
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
                type: SwapType.UNIVERSAL_ROUTER,
                recipient: alice._address,
                slippageTolerance: SLIPPAGE,
                deadlineOrPreviousBlockhash: parseDeadline(360),
                simulate: { fromAddress: WHALES(tokenIn) },
              },
              {
                ...ROUTING_CONFIG,
                forceCrossProtocol: true,
              }
            );
            expect(swap).toBeDefined();
            expect(swap).not.toBeNull();

            const {
              quote,
              quoteGasAdjusted,
              methodParameters,
              estimatedGasUsed,
              simulationStatus,
              estimatedGasUsedQuoteToken,
            } = swap!;

            expect(
              quoteGasAdjusted
                .subtract(quote)
                .equalTo(estimatedGasUsedQuoteToken)
            );

            expect(simulationStatus).toBeDefined();
            expect(simulationStatus).toEqual(SimulationStatus.Succeeded);

            await validateExecuteSwap(
              SwapType.UNIVERSAL_ROUTER,
              quote,
              tokenIn,
              tokenOut,
              methodParameters,
              tradeType,
              100,
              100,
              estimatedGasUsed
            );
          });

          it('erc20 -> erc20 without sufficient token balance', async () => {
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
                type: SwapType.UNIVERSAL_ROUTER,
                recipient: alice._address,
                slippageTolerance: SLIPPAGE,
                deadlineOrPreviousBlockhash: parseDeadline(360),
                simulate: {
                  fromAddress: '0xeaf1c41339f7D33A2c47f82F7b9309B5cBC83B5F',
                },
              },
              {
                ...ROUTING_CONFIG,
              }
            );

            expect(swap).toBeDefined();
            expect(swap).not.toBeNull();

            const {
              quote,
              quoteGasAdjusted,
              methodParameters,
              simulationStatus,
            } = swap!;

            expect(simulationStatus).toBeDefined();
            expect(simulationStatus).toEqual(
              SimulationStatus.InsufficientBalance
            );

            await validateSwapRoute(
              quote,
              quoteGasAdjusted,
              tradeType,
              100,
              10
            );

            await validateExecuteSwap(
              SwapType.UNIVERSAL_ROUTER,
              quote,
              tokenIn,
              tokenOut,
              methodParameters,
              tradeType,
              100,
              100
            );
          });

          it('eth -> erc20 without sufficient ETH balance', async () => {
            /// Fails for v3 for some reason, ProviderGasError
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
                type: SwapType.UNIVERSAL_ROUTER,
                recipient: alice._address,
                slippageTolerance: SLIPPAGE,
                deadlineOrPreviousBlockhash: parseDeadline(360),
                simulate: {
                  fromAddress: '0xeaf1c41339f7D33A2c47f82F7b9309B5cBC83B5F',
                },
              },
              {
                ...ROUTING_CONFIG,
                protocols: [Protocol.V2],
              }
            );
            expect(swap).toBeDefined();
            expect(swap).not.toBeNull();

            const {
              quote,
              quoteGasAdjusted,
              simulationStatus,
              estimatedGasUsedQuoteToken,
            } = swap!;
            expect(
              quoteGasAdjusted
                .subtract(quote)
                .equalTo(estimatedGasUsedQuoteToken)
            );

            expect(simulationStatus).toBeDefined();
            expect(simulationStatus).toEqual(
              SimulationStatus.InsufficientBalance
            );
          });

          it('erc20 -> erc20 with ethEstimateGasSimulator without token approval', async () => {
            // declaring these to reduce confusion
            const tokenIn = USDC_MAINNET;
            const tokenOut = USDT_MAINNET;
            const amount =
              tradeType == TradeType.EXACT_INPUT
                ? parseAmount('100', tokenIn)
                : parseAmount('100', tokenOut);

            // route using custom alpha router with ethEstimateGasSimulator
            const swap = await customAlphaRouter.route(
              amount,
              getQuoteToken(tokenIn, tokenOut, tradeType),
              tradeType,
              {
                type: SwapType.SWAP_ROUTER_02,
                recipient: alice._address,
                slippageTolerance: SLIPPAGE,
                deadline: parseDeadline(360),
                simulate: { fromAddress: WHALES(tokenIn) },
              },
              {
                ...ROUTING_CONFIG,
              }
            );

            expect(swap).toBeDefined();
            expect(swap).not.toBeNull();

            const {
              quote,
              quoteGasAdjusted,
              methodParameters,
              simulationStatus,
            } = swap!;

            await validateSwapRoute(
              quote,
              quoteGasAdjusted,
              tradeType,
              100,
              10
            );

            expect(simulationStatus).toBeDefined();
            expect(simulationStatus).toEqual(SimulationStatus.NotApproved);

            await validateExecuteSwap(
              SwapType.SWAP_ROUTER_02,
              quote,
              tokenIn,
              tokenOut,
              methodParameters,
              tradeType,
              100,
              100
            );
          });

          it(`eth -> erc20 with ethEstimateGasSimulator and Swap Router 02`, async () => {
            /// Fails for v3 for some reason, ProviderGasError
            const tokenIn = Ether.onChain(1) as Currency;
            const tokenOut = UNI_MAINNET;
            const amount =
              tradeType == TradeType.EXACT_INPUT
                ? parseAmount('10', tokenIn)
                : parseAmount('10000', tokenOut);

            // route using custom alpha router with ethEstimateGasSimulator
            const swap = await customAlphaRouter.route(
              amount,
              getQuoteToken(tokenIn, tokenOut, tradeType),
              tradeType,
              {
                type: SwapType.SWAP_ROUTER_02,
                recipient: alice._address,
                slippageTolerance: SLIPPAGE,
                deadline: parseDeadline(360),
                simulate: { fromAddress: WHALES(tokenIn) },
              },
              {
                ...ROUTING_CONFIG,
                protocols: [Protocol.V2],
              }
            );
            expect(swap).toBeDefined();
            expect(swap).not.toBeNull();

            const {
              quote,
              quoteGasAdjusted,
              simulationStatus,
              estimatedGasUsedQuoteToken,
            } = swap!;
            expect(
              quoteGasAdjusted
                .subtract(quote)
                .equalTo(estimatedGasUsedQuoteToken)
            );

            expect(simulationStatus).toEqual(SimulationStatus.Succeeded);
          });

          it('eth -> erc20 with ethEstimateGasSimulator and Universal Router', async () => {
            /// Fails for v3 for some reason, ProviderGasError
            const tokenIn = Ether.onChain(1) as Currency;
            const tokenOut = USDC_MAINNET;
            const amount =
              tradeType == TradeType.EXACT_INPUT
                ? parseAmount('1', tokenIn)
                : parseAmount('1000', tokenOut);

            const swap = await customAlphaRouter.route(
              amount,
              getQuoteToken(tokenIn, tokenOut, tradeType),
              tradeType,
              {
                type: SwapType.UNIVERSAL_ROUTER,
                recipient: alice._address,
                slippageTolerance: SLIPPAGE,
                deadlineOrPreviousBlockhash: parseDeadline(360),
                simulate: { fromAddress: WHALES(tokenIn) },
              }
            );
            expect(swap).toBeDefined();
            expect(swap).not.toBeNull();

            const { simulationStatus, methodParameters } = swap!;

            expect(methodParameters).not.toBeUndefined();

            expect(simulationStatus).toEqual(SimulationStatus.Succeeded);
          });
        });
      }

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

  describe('Mixed routes', () => {
    const tradeType = TradeType.EXACT_INPUT;

    const BOND_MAINNET = new Token(
      1,
      '0x0391D2021f89DC339F60Fff84546EA23E337750f',
      18,
      'BOND',
      'BOND'
    );

    const APE_MAINNET = new Token(
      1,
      '0x4d224452801aced8b2f0aebe155379bb5d594381',
      18,
      'APE',
      'APE'
    );

    beforeAll(async () => {
      await hardhat.fund(
        alice._address,
        [parseAmount('10000', BOND_MAINNET)],
        [
          '0xf510dde022a655e7e3189cdf67687e7ffcd80d91', // BOND token whale
        ]
      );
      const aliceBONDBalance = await hardhat.getBalance(
        alice._address,
        BOND_MAINNET
      );
      expect(aliceBONDBalance).toEqual(parseAmount('10000', BOND_MAINNET));
    });

    describe(`exactIn mixedPath routes`, () => {
      describe('+ simulate swap', () => {
        it('BOND -> APE', async () => {
          const tokenIn = BOND_MAINNET;
          const tokenOut = APE_MAINNET;

          const amount =
            tradeType == TradeType.EXACT_INPUT
              ? parseAmount('10000', tokenIn)
              : parseAmount('10000', tokenOut);

          const swap = await alphaRouter.route(
            amount,
            getQuoteToken(tokenIn, tokenOut, tradeType),
            tradeType,
            {
              type: SwapType.UNIVERSAL_ROUTER,
              recipient: alice._address,
              slippageTolerance: new Percent(50, 100),
              deadlineOrPreviousBlockhash: parseDeadline(360),
            },
            {
              ...ROUTING_CONFIG,
              protocols: [Protocol.V2, Protocol.V3, Protocol.MIXED],
              forceMixedRoutes: true,
            }
          );

          expect(swap).toBeDefined();
          expect(swap).not.toBeNull();

          const { quote, quoteGasAdjusted, methodParameters, route } = swap!;

          expect(route.length).toEqual(1);
          expect(route[0]!.protocol).toEqual(Protocol.MIXED);

          await validateSwapRoute(quote, quoteGasAdjusted, tradeType);

          await validateExecuteSwap(
            SwapType.UNIVERSAL_ROUTER,
            quote,
            tokenIn,
            tokenOut,
            methodParameters,
            tradeType,
            10000
          );
        });
      });
    });
  });
});

describe('external class tests', () => {
  const multicall2Provider = new UniswapMulticallProvider(
    ChainId.MAINNET,
    hardhat.provider
  );
  const onChainQuoteProvider = new OnChainQuoteProvider(
    1,
    hardhat.provider,
    multicall2Provider
  );

  const token0 = new Token(
    1,
    '0x0000000000000000000000000000000000000001',
    18,
    't0',
    'token0'
  );
  const token1 = new Token(
    1,
    '0x0000000000000000000000000000000000000002',
    18,
    't1',
    'token1'
  );
  const token2 = new Token(
    1,
    '0x0000000000000000000000000000000000000003',
    18,
    't2',
    'token2'
  );

  const pool_0_1 = new Pool(
    token0,
    token1,
    FeeAmount.MEDIUM,
    encodeSqrtRatioX96(1, 1),
    0,
    0,
    []
  );

  const pool_1_2 = new Pool(
    token1,
    token2,
    FeeAmount.MEDIUM,
    encodeSqrtRatioX96(1, 1),
    0,
    0,
    []
  );

  const pair_0_1 = new Pair(
    CurrencyAmount.fromRawAmount(token0, 100),
    CurrencyAmount.fromRawAmount(token1, 100)
  );

  it('Prevents incorrect routes array configurations', async () => {
    const amountIns = [
      CurrencyAmount.fromRawAmount(token0, 1),
      CurrencyAmount.fromRawAmount(token0, 2),
    ];
    const amountOuts = [
      CurrencyAmount.fromRawAmount(token1, 1),
      CurrencyAmount.fromRawAmount(token1, 2),
    ];
    const v3Route = new V3Route([pool_0_1], token0, token1);
    const v3Route_2 = new V3Route([pool_0_1, pool_1_2], token0, token2);
    const v2route = new V2Route([pair_0_1], token0, token1);
    const mixedRoute = new MixedRoute([pool_0_1], token0, token1);
    const routes_v3_mixed = [v3Route, mixedRoute];
    const routes_v2_mixed = [v2route, mixedRoute];
    const routes_v3_v2_mixed = [v3Route, v2route, mixedRoute];
    const routes_v3_v2 = [v3Route, v2route];
    const routes_v3 = [v3Route, v3Route_2];

    /// Should fail
    await expect(
      onChainQuoteProvider.getQuotesManyExactIn(amountIns, routes_v3_v2_mixed)
    ).rejects.toThrow();
    await expect(
      onChainQuoteProvider.getQuotesManyExactIn(amountIns, routes_v3_v2)
    ).rejects.toThrow();
    await expect(
      onChainQuoteProvider.getQuotesManyExactIn(amountIns, routes_v3_mixed)
    ).rejects.toThrow();

    await expect(
      /// @dev so since we type the input argument, we can't really call it with a wrong configuration of routes
      /// however, we expect this to fail in case it is called somehow w/o type checking
      onChainQuoteProvider.getQuotesManyExactOut(
        amountOuts,
        routes_v3_v2_mixed as unknown as V3Route[]
      )
    ).rejects.toThrow();

    await expect(
      onChainQuoteProvider.getQuotesManyExactOut(
        amountOuts,
        routes_v2_mixed as unknown as V3Route[]
      )
    ).rejects.toThrow();

    await expect(
      onChainQuoteProvider.getQuotesManyExactOut(amountOuts, [
        mixedRoute,
      ] as unknown as V3Route[])
    ).rejects.toThrow();

    await expect(
      onChainQuoteProvider.getQuotesManyExactOut(amountOuts, [
        v2route,
      ] as unknown as V3Route[])
    ).rejects.toThrow();

    /// ExactIn passing tests
    await onChainQuoteProvider.getQuotesManyExactIn(amountIns, routes_v2_mixed);
    await onChainQuoteProvider.getQuotesManyExactIn(amountIns, routes_v3);
    await onChainQuoteProvider.getQuotesManyExactIn(amountIns, [v2route]);
    await onChainQuoteProvider.getQuotesManyExactIn(amountIns, [mixedRoute]);
    await onChainQuoteProvider.getQuotesManyExactIn(amountIns, [v3Route]);
    /// ExactOut passing tests
    await onChainQuoteProvider.getQuotesManyExactOut(amountOuts, routes_v3);
    await onChainQuoteProvider.getQuotesManyExactOut(amountOuts, [v3Route]);
  });
});

describe('quote for other networks', () => {
  const TEST_ERC20_1: { [chainId in ChainId]: Token } = {
    [ChainId.MAINNET]: USDC_ON(1),
    [ChainId.ROPSTEN]: USDC_ON(ChainId.ROPSTEN),
    [ChainId.RINKEBY]: USDC_ON(ChainId.RINKEBY),
    [ChainId.GÖRLI]: UNI_GÖRLI,
    [ChainId.KOVAN]: USDC_ON(ChainId.KOVAN),
    [ChainId.OPTIMISM]: USDC_ON(ChainId.OPTIMISM),
    [ChainId.OPTIMISM_GOERLI]: USDC_ON(ChainId.OPTIMISM_GOERLI),
    [ChainId.OPTIMISTIC_KOVAN]: USDC_ON(ChainId.OPTIMISTIC_KOVAN),
    [ChainId.ARBITRUM_ONE]: USDC_ON(ChainId.ARBITRUM_ONE),
    [ChainId.ARBITRUM_RINKEBY]: USDC_ON(ChainId.ARBITRUM_RINKEBY),
    [ChainId.ARBITRUM_GOERLI]: USDC_ON(ChainId.ARBITRUM_GOERLI),
    [ChainId.POLYGON]: USDC_ON(ChainId.POLYGON),
    [ChainId.POLYGON_MUMBAI]: USDC_ON(ChainId.POLYGON_MUMBAI),
    [ChainId.CELO]: CUSD_CELO,
    [ChainId.CELO_ALFAJORES]: CUSD_CELO_ALFAJORES,
    [ChainId.GNOSIS]: WBTC_GNOSIS,
    [ChainId.MOONBEAM]: WBTC_MOONBEAM,
    [ChainId.BSC]: USDC_BSC,
  };
  const TEST_ERC20_2: { [chainId in ChainId]: Token } = {
    [ChainId.MAINNET]: DAI_ON(1),
    [ChainId.ROPSTEN]: DAI_ON(ChainId.ROPSTEN),
    [ChainId.RINKEBY]: DAI_ON(ChainId.RINKEBY),
    [ChainId.GÖRLI]: DAI_ON(ChainId.GÖRLI),
    [ChainId.KOVAN]: DAI_ON(ChainId.KOVAN),
    [ChainId.OPTIMISM]: DAI_ON(ChainId.OPTIMISM),
    [ChainId.OPTIMISM_GOERLI]: DAI_ON(ChainId.OPTIMISM_GOERLI),
    [ChainId.OPTIMISTIC_KOVAN]: DAI_ON(ChainId.OPTIMISTIC_KOVAN),
    [ChainId.ARBITRUM_ONE]: DAI_ON(ChainId.ARBITRUM_ONE),
    [ChainId.ARBITRUM_RINKEBY]: DAI_ON(ChainId.ARBITRUM_RINKEBY),
    [ChainId.ARBITRUM_GOERLI]: DAI_ON(ChainId.ARBITRUM_GOERLI),
    [ChainId.POLYGON]: DAI_ON(ChainId.POLYGON),
    [ChainId.POLYGON_MUMBAI]: DAI_ON(ChainId.POLYGON_MUMBAI),
    [ChainId.CELO]: CEUR_CELO,
    [ChainId.CELO_ALFAJORES]: CEUR_CELO_ALFAJORES,
    [ChainId.GNOSIS]: USDC_ETHEREUM_GNOSIS,
    [ChainId.MOONBEAM]: WBTC_MOONBEAM,
    [ChainId.BSC]: USDT_BSC,
  };

  // TODO: Find valid pools/tokens on optimistic kovan and polygon mumbai. We skip those tests for now.
  for (const chain of _.filter(
    SUPPORTED_CHAINS,
    (c) =>
      c != ChainId.RINKEBY &&
      c != ChainId.ROPSTEN &&
      c != ChainId.KOVAN &&
      c != ChainId.OPTIMISTIC_KOVAN &&
      c != ChainId.OPTIMISM_GOERLI &&
      c != ChainId.POLYGON_MUMBAI &&
      c != ChainId.ARBITRUM_RINKEBY &&
      c != ChainId.ARBITRUM_GOERLI &&
      c != ChainId.OPTIMISM && /// @dev infura has been having issues with optimism lately
      // Tests are failing https://github.com/Uniswap/smart-order-router/issues/104
      c != ChainId.CELO_ALFAJORES
  )) {
    for (const tradeType of [TradeType.EXACT_INPUT, TradeType.EXACT_OUTPUT]) {
      const erc1 = TEST_ERC20_1[chain];
      const erc2 = TEST_ERC20_2[chain];

      describe(`${ID_TO_NETWORK_NAME(chain)} ${tradeType} 2xx`, function () {
        const wrappedNative = WNATIVE_ON(chain);

        let alphaRouter: AlphaRouter;

        beforeAll(async () => {
          const chainProvider = ID_TO_PROVIDER(chain);
          const provider = new JsonRpcProvider(chainProvider, chain);

          const multicall2Provider = new UniswapMulticallProvider(
            chain,
            provider
          );

          const v3PoolProvider = new CachingV3PoolProvider(
            chain,
            new V3PoolProvider(chain, multicall2Provider),
            new NodeJSCache(new NodeCache({ stdTTL: 360, useClones: false }))
          );
          const v2PoolProvider = new V2PoolProvider(chain, multicall2Provider);

          const ethEstimateGasSimulator = new EthEstimateGasSimulator(
            chain,
            provider,
            v2PoolProvider,
            v3PoolProvider
          );

          const tenderlySimulator = new TenderlySimulator(
            chain,
            process.env.TENDERLY_BASE_URL!,
            process.env.TENDERLY_USER!,
            process.env.TENDERLY_PROJECT!,
            process.env.TENDERLY_ACCESS_KEY!,
            v2PoolProvider,
            v3PoolProvider,
            provider
          );

          const simulator = new FallbackTenderlySimulator(
            chain,
            provider,
            tenderlySimulator,
            ethEstimateGasSimulator
          );

          alphaRouter = new AlphaRouter({
            chainId: chain,
            provider,
            multicall2Provider,
            simulator,
          });
        });

        describe(`Swap`, function () {
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

          it(`does not error when protocols array is empty`, async () => {
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
                protocols: [],
              }
            );
            expect(swap).toBeDefined();
            expect(swap).not.toBeNull();
          });

          if (!V2_SUPPORTED.includes(chain)) {
            it(`is null when considering MIXED on non supported chains for exactInput & exactOutput`, async () => {
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
                  protocols: [Protocol.MIXED],
                }
              );
              expect(swap).toBeNull();
            });
          }
        });

        if (isTenderlyEnvironmentSet()) {
          describe(`Simulate + Swap`, function () {
            // Tenderly does not support Celo
            if ([ChainId.CELO, ChainId.CELO_ALFAJORES].includes(chain)) {
              return;
            }
            it(`${wrappedNative.symbol} -> erc20`, async () => {
              const tokenIn = wrappedNative;
              const tokenOut = erc1;
              const amount =
                tradeType == TradeType.EXACT_INPUT
                  ? parseAmount('10', tokenIn)
                  : parseAmount('10', tokenOut);

              // Universal Router is not deployed on Gorli.
              const swapOptions: SwapOptions =
                chain == ChainId.GÖRLI
                  ? {
                      type: SwapType.SWAP_ROUTER_02,
                      recipient: WHALES(tokenIn),
                      slippageTolerance: SLIPPAGE,
                      deadline: parseDeadline(360),
                      simulate: { fromAddress: WHALES(tokenIn) },
                    }
                  : {
                      type: SwapType.UNIVERSAL_ROUTER,
                      recipient: WHALES(tokenIn),
                      slippageTolerance: SLIPPAGE,
                      deadlineOrPreviousBlockhash: parseDeadline(360),
                      simulate: { fromAddress: WHALES(tokenIn) },
                    };

              const swap = await alphaRouter.route(
                amount,
                getQuoteToken(tokenIn, tokenOut, tradeType),
                tradeType,
                swapOptions,
                {
                  // @ts-ignore[TS7053] - complaining about switch being non exhaustive
                  ...DEFAULT_ROUTING_CONFIG_BY_CHAIN[chain],
                  protocols: [Protocol.V3, Protocol.V2],
                }
              );
              expect(swap).toBeDefined();
              expect(swap).not.toBeNull();
              if (swap) {
                expect(
                  swap.quoteGasAdjusted
                    .subtract(swap.quote)
                    .equalTo(swap.estimatedGasUsedQuoteToken)
                );

                // Expect tenderly simulation to be successful
                expect(swap.simulationStatus).toEqual(
                  SimulationStatus.Succeeded
                );
              }

              // Scope limited for non mainnet network tests to validating the swap
            });

            it(`erc20 -> erc20`, async () => {
              const tokenIn = erc1;
              const tokenOut = erc2;
              const amount =
                tradeType == TradeType.EXACT_INPUT
                  ? parseAmount('1', tokenIn)
                  : parseAmount('1', tokenOut);

              // Universal Router is not deployed on Gorli.
              const swapOptions: SwapOptions =
                chain == ChainId.GÖRLI
                  ? {
                      type: SwapType.SWAP_ROUTER_02,
                      recipient: WHALES(tokenIn),
                      slippageTolerance: SLIPPAGE,
                      deadline: parseDeadline(360),
                      simulate: { fromAddress: WHALES(tokenIn) },
                    }
                  : {
                      type: SwapType.UNIVERSAL_ROUTER,
                      recipient: WHALES(tokenIn),
                      slippageTolerance: SLIPPAGE,
                      deadlineOrPreviousBlockhash: parseDeadline(360),
                      simulate: { fromAddress: WHALES(tokenIn) },
                    };

              const swap = await alphaRouter.route(
                amount,
                getQuoteToken(tokenIn, tokenOut, tradeType),
                tradeType,
                swapOptions,
                {
                  // @ts-ignore[TS7053] - complaining about switch being non exhaustive
                  ...DEFAULT_ROUTING_CONFIG_BY_CHAIN[chain],
                  protocols: [Protocol.V3, Protocol.V2],
                }
              );
              expect(swap).toBeDefined();
              expect(swap).not.toBeNull();
              if (swap) {
                expect(
                  swap.quoteGasAdjusted
                    .subtract(swap.quote)
                    .equalTo(swap.estimatedGasUsedQuoteToken)
                );

                // Expect tenderly simulation to be successful
                expect(swap.simulationStatus).toEqual(
                  SimulationStatus.Succeeded
                );
              }
            });

            const native = NATIVE_CURRENCY[chain];

            it(`${native} -> erc20`, async () => {
              const tokenIn = nativeOnChain(chain);
              const tokenOut = erc2;
              const amount =
                tradeType == TradeType.EXACT_INPUT
                  ? parseAmount('1', tokenIn)
                  : parseAmount('1', tokenOut);

              // Universal Router is not deployed on Gorli.
              const swapOptions: SwapOptions =
                chain == ChainId.GÖRLI
                  ? {
                      type: SwapType.SWAP_ROUTER_02,
                      recipient: WHALES(tokenIn),
                      slippageTolerance: SLIPPAGE,
                      deadline: parseDeadline(360),
                      simulate: { fromAddress: WHALES(tokenIn) },
                    }
                  : {
                      type: SwapType.UNIVERSAL_ROUTER,
                      recipient: WHALES(tokenIn),
                      slippageTolerance: SLIPPAGE,
                      deadlineOrPreviousBlockhash: parseDeadline(360),
                      simulate: { fromAddress: WHALES(tokenIn) },
                    };

              const swap = await alphaRouter.route(
                amount,
                getQuoteToken(tokenIn, tokenOut, tradeType),
                tradeType,
                swapOptions,
                {
                  // @ts-ignore[TS7053] - complaining about switch being non exhaustive
                  ...DEFAULT_ROUTING_CONFIG_BY_CHAIN[chain],
                  protocols: [Protocol.V3, Protocol.V2],
                }
              );
              expect(swap).toBeDefined();
              expect(swap).not.toBeNull();
              if (swap) {
                expect(
                  swap.quoteGasAdjusted
                    .subtract(swap.quote)
                    .equalTo(swap.estimatedGasUsedQuoteToken)
                );

                // Expect Eth Estimate Gas to succeed
                expect(swap.simulationStatus).toEqual(
                  SimulationStatus.Succeeded
                );
              }
            });
          });
        }
      });
    }
  }
});
