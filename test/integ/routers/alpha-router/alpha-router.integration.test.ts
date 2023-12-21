/**
 * @jest-environment hardhat
 */

import { JsonRpcProvider, JsonRpcSigner } from '@ethersproject/providers';
import { AllowanceTransfer, PermitSingle } from '@uniswap/permit2-sdk';
import { Protocol } from '@uniswap/router-sdk';
import {
  ChainId,
  Currency,
  CurrencyAmount,
  Ether,
  Fraction,
  Percent,
  Rounding,
  Token,
  TradeType
} from '@uniswap/sdk-core';
import {
  PERMIT2_ADDRESS,
  UNIVERSAL_ROUTER_ADDRESS as UNIVERSAL_ROUTER_ADDRESS_BY_CHAIN
} from '@uniswap/universal-router-sdk';
import { Permit2Permit } from '@uniswap/universal-router-sdk/dist/utils/inputTokens';
import { Pair } from '@uniswap/v2-sdk';
import { encodeSqrtRatioX96, FeeAmount, Pool } from '@uniswap/v3-sdk';
import bunyan from 'bunyan';
import { BigNumber, providers, Wallet } from 'ethers';
import { parseEther } from 'ethers/lib/utils';

import 'jest-environment-hardhat';
import _ from 'lodash';
import NodeCache from 'node-cache';
import {
  AlphaRouter,
  AlphaRouterConfig,
  CachingV2PoolProvider,
  CachingV3PoolProvider,
  CEUR_CELO,
  CEUR_CELO_ALFAJORES,
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
  NATIVE_CURRENCY,
  nativeOnChain,
  NodeJSCache,
  OnChainQuoteProvider,
  parseAmount,
  setGlobalLogger,
  SimulationStatus,
  StaticGasPriceProvider,
  SUPPORTED_CHAINS,
  SWAP_ROUTER_02_ADDRESSES,
  SwapOptions,
  SwapType,
  TenderlySimulator,
  TokenPropertiesProvider,
  UNI_GOERLI,
  UNI_MAINNET,
  UniswapMulticallProvider,
  USDC_BNB,
  USDC_ETHEREUM_GNOSIS,
  USDC_MAINNET,
  USDC_ON,
  USDT_BNB,
  USDT_MAINNET,
  V2_SUPPORTED,
  V2PoolProvider,
  V2Route,
  V3PoolProvider,
  V3Route,
  WBTC_GNOSIS,
  WBTC_MOONBEAM,
  WETH9,
  WNATIVE_ON,
  WRAPPED_NATIVE_CURRENCY
} from '../../../../src';
import { PortionProvider } from '../../../../src/providers/portion-provider';
import { OnChainTokenFeeFetcher } from '../../../../src/providers/token-fee-fetcher';
import { DEFAULT_ROUTING_CONFIG_BY_CHAIN } from '../../../../src/routers/alpha-router/config';
import { Permit2__factory } from '../../../../src/types/other/factories/Permit2__factory';
import { getBalanceAndApprove } from '../../../test-util/getBalanceAndApprove';
import { BULLET, BULLET_WITHOUT_TAX, FLAT_PORTION, GREENLIST_TOKEN_PAIRS, Portion } from '../../../test-util/mock-data';
import { WHALES } from '../../../test-util/whales';

// TODO: this should be at a later block that's aware of universal router v1.3 0x3F6328669a86bef431Dc6F9201A5B90F7975a023 deployed at block 18222746. We can use later block, e.g. at block 18318644
// TODO: permit-related tests will fail during hardfork swap execution when changing to later block. Investigate why.
const FORK_BLOCK = 18222746;
const UNIVERSAL_ROUTER_ADDRESS = UNIVERSAL_ROUTER_ADDRESS_BY_CHAIN(1);
const SLIPPAGE = new Percent(15, 100); // 5% or 10_000?
const LARGE_SLIPPAGE = new Percent(45, 100); // 5% or 10_000?

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

const checkPortionRecipientToken = (
  before: CurrencyAmount<Currency>,
  after: CurrencyAmount<Currency>,
  expectedPortionAmountReceived: CurrencyAmount<Currency>
) => {
  const actualPortionAmountReceived = after.subtract(before);

  const tokensDiff = expectedPortionAmountReceived.greaterThan(actualPortionAmountReceived)
    ? expectedPortionAmountReceived.subtract(actualPortionAmountReceived)
    : actualPortionAmountReceived.subtract(expectedPortionAmountReceived);
  // There will be a slight difference between expected and actual due to slippage during the hardhat fork swap.
  const percentDiff = tokensDiff.asFraction.divide(expectedPortionAmountReceived.asFraction);
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
  let feeOnTransferAlphaRouter: AlphaRouter;
  const multicall2Provider = new UniswapMulticallProvider(
    ChainId.MAINNET,
    hardhat.provider
  );

  const ROUTING_CONFIG: AlphaRouterConfig = {
    // @ts-ignore[TS7053] - complaining about switch being non exhaustive
    ...DEFAULT_ROUTING_CONFIG_BY_CHAIN[ChainId.MAINNET],
    protocols: [Protocol.V3, Protocol.V2],
    saveTenderlySimulationIfFailed: true, // save tenderly simulation on integ-test runs, easier for debugging
  };

  const executeSwap = async (
    swapType: SwapType,
    methodParameters: MethodParameters,
    tokenIn: Currency,
    tokenOut: Currency,
    gasLimit?: BigNumber,
    permit?: boolean,
    portion?: Portion
  ): Promise<{
    tokenInAfter: CurrencyAmount<Currency>;
    tokenInBefore: CurrencyAmount<Currency>;
    tokenOutAfter: CurrencyAmount<Currency>;
    tokenOutBefore: CurrencyAmount<Currency>;
    tokenOutPortionRecipientBefore?: CurrencyAmount<Currency>;
    tokenOutPortionRecipientAfter?: CurrencyAmount<Currency>;
  }> => {
    expect(tokenIn.symbol).not.toBe(tokenOut.symbol);
    let transactionResponse: providers.TransactionResponse;

    let tokenInBefore: CurrencyAmount<Currency>;
    let tokenOutBefore: CurrencyAmount<Currency>;
    const tokenOutPortionRecipientBefore = portion
      ? await hardhat.getBalance(portion.recipient, tokenOut)
      : undefined;
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
    const tokenOutPortionRecipientAfter = portion
      ? await hardhat.getBalance(portion.recipient, tokenOut)
      : undefined;

    return {
      tokenInAfter,
      tokenInBefore,
      tokenOutAfter,
      tokenOutBefore,
      tokenOutPortionRecipientBefore,
      tokenOutPortionRecipientAfter,
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
    acceptableDifference?: number,
    quoteGasAndPortionAdjusted?: CurrencyAmount<Currency>,
    targetQuoteGasAndPortionAdjustedDecimalsAmount?: number,
    acceptablePortionDifference?: number
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

    if (targetQuoteGasAndPortionAdjustedDecimalsAmount && quoteGasAndPortionAdjusted) {
      acceptablePortionDifference = acceptablePortionDifference ?? 0

      expect(
        quoteGasAndPortionAdjusted.greaterThan(
          CurrencyAmount.fromRawAmount(
            quoteGasAndPortionAdjusted.currency,
            expandDecimals(
              quoteGasAndPortionAdjusted.currency,
              targetQuoteGasAndPortionAdjustedDecimalsAmount - acceptablePortionDifference
            )
          )
        )
      ).toBe(true);
      expect(
        quoteGasAndPortionAdjusted.lessThan(
          CurrencyAmount.fromRawAmount(
            quoteGasAndPortionAdjusted.currency,
            expandDecimals(
              quoteGasAndPortionAdjusted.currency,
              targetQuoteGasAndPortionAdjustedDecimalsAmount + acceptablePortionDifference
            )
          )
        )
      ).toBe(true);
    }

    if (tradeType == TradeType.EXACT_INPUT) {
      // == lessThanOrEqualTo
      expect(!quoteGasAdjusted.greaterThan(quote)).toBe(true);

      if (quoteGasAndPortionAdjusted) {
        expect(!quoteGasAndPortionAdjusted.greaterThan(quoteGasAdjusted)).toBe(true);
      }
    } else {
      // == greaterThanOrEqual
      expect(!quoteGasAdjusted.lessThan(quote)).toBe(true);

      if (quoteGasAndPortionAdjusted) {
        expect(!quoteGasAndPortionAdjusted.lessThan(quoteGasAdjusted)).toBe(true);
      }
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
    permit?: boolean,
    portion?: Portion,
    checkTokenOutPortionAmount?: number,
    skipQuoteTokenCheck?: boolean,
  ) => {
    expect(methodParameters).not.toBeUndefined();
    const { tokenInBefore, tokenInAfter, tokenOutBefore, tokenOutAfter, tokenOutPortionRecipientBefore, tokenOutPortionRecipientAfter } =
      await executeSwap(
        swapType,
        methodParameters!,
        tokenIn,
        tokenOut!,
        estimatedGasUsed,
        permit,
        portion
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
      if (!skipQuoteTokenCheck) {
        checkQuoteToken(
          tokenOutBefore,
          tokenOutAfter,
          /// @dev we need to recreate the CurrencyAmount object here because tokenOut can be different from quote.currency (in the case of ETH vs. WETH)
          CurrencyAmount.fromRawAmount(tokenOut, quote.quotient)
        );
      }
      if (checkTokenOutPortionAmount) {
        checkPortionRecipientToken(
          tokenOutPortionRecipientBefore!,
          tokenOutPortionRecipientAfter!,
          CurrencyAmount.fromRawAmount(
            tokenOut,
            expandDecimals(tokenOut, checkTokenOutPortionAmount)
          )
        );
      }
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
      if (!skipQuoteTokenCheck) {
        checkQuoteToken(
          tokenInBefore,
          tokenInAfter,
          CurrencyAmount.fromRawAmount(tokenIn, quote.quotient)
        );
      }
      if (checkTokenOutPortionAmount) {
        checkPortionRecipientToken(
          tokenOutPortionRecipientBefore!,
          tokenOutPortionRecipientAfter!,
          CurrencyAmount.fromRawAmount(
            tokenOut,
            expandDecimals(tokenOut, checkTokenOutPortionAmount)
          )
        );
      }
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
        '0x2fEb1512183545f48f6b9C5b4EbfCaF49CfCa6F3', // WETH whale
      ]
    );

    await hardhat.fund(
      alice._address,
      [parseAmount('735871', BULLET)],
      [
        '0x171d311eAcd2206d21Cb462d661C33F0eddadC03', // BULLET whale
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
    const aliceBULLETBalance = await hardhat.getBalance(
      alice._address,
      BULLET
    )
    expect(aliceBULLETBalance).toEqual(parseAmount('735871', BULLET))

    const v3PoolProvider = new CachingV3PoolProvider(
      ChainId.MAINNET,
      new V3PoolProvider(ChainId.MAINNET, multicall2Provider),
      new NodeJSCache(new NodeCache({ stdTTL: 360, useClones: false }))
    );
    const tokenFeeFetcher = new OnChainTokenFeeFetcher(
      ChainId.MAINNET,
      hardhat.provider
    )
    const tokenPropertiesProvider = new TokenPropertiesProvider(
      ChainId.MAINNET,
      new NodeJSCache(new NodeCache({ stdTTL: 360, useClones: false })),
      tokenFeeFetcher
    )
    const v2PoolProvider = new V2PoolProvider(
      ChainId.MAINNET,
      multicall2Provider,
      tokenPropertiesProvider
    );
    const cachingV2PoolProvider = new CachingV2PoolProvider(
      ChainId.MAINNET,
      v2PoolProvider,
      new NodeJSCache(new NodeCache({ stdTTL: 360, useClones: false }))
    )

    const portionProvider = new PortionProvider();
    const ethEstimateGasSimulator = new EthEstimateGasSimulator(
      ChainId.MAINNET,
      hardhat.providers[0]!,
      v2PoolProvider,
      v3PoolProvider,
      portionProvider
    );

    const tenderlySimulator = new TenderlySimulator(
      ChainId.MAINNET,
      process.env.TENDERLY_BASE_URL!,
      process.env.TENDERLY_USER!,
      process.env.TENDERLY_PROJECT!,
      process.env.TENDERLY_ACCESS_KEY!,
      v2PoolProvider,
      v3PoolProvider,
      hardhat.providers[0]!,
      portionProvider
    );

    const simulator = new FallbackTenderlySimulator(
      ChainId.MAINNET,
      hardhat.providers[0]!,
      new PortionProvider(),
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

    feeOnTransferAlphaRouter = new AlphaRouter({
      chainId: ChainId.MAINNET,
      provider: hardhat.providers[0]!,
      multicall2Provider,
      v2PoolProvider: cachingV2PoolProvider,
      v3PoolProvider,
      simulator,
    });
  });

  /**
   *  tests are 1:1 with routing api integ tests
   */
  for (const tradeType of [TradeType.EXACT_INPUT, TradeType.EXACT_OUTPUT]) {
    describe(`${ID_TO_NETWORK_NAME(1)} alpha - ${tradeType.toString()}`, () => {
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

        it('erc20 -> erc20 works when symbol is returning bytes32', async () => {
          // This token has a bytes32 symbol type
          const tokenIn = new Token(
            ChainId.MAINNET,
            '0x0d88ed6e74bbfd96b831231638b66c05571e824f',
            18,
            'AVT',
            'AVT'
          );

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

        it('erc20 -> erc20 gas token specified', async () => {
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
              gasToken: DAI_MAINNET.address
            }
          );
  
          expect(swap).toBeDefined();
          expect(swap).not.toBeNull();
  
          const { quote, quoteGasAdjusted, methodParameters, estimatedGasUsedGasToken } = swap!;
  
          expect(estimatedGasUsedGasToken).toBeDefined();
          expect(estimatedGasUsedGasToken?.currency.equals(DAI_MAINNET)).toBe(true);
  
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
  
        it('erc20 -> eth gas token as weth', async () => {
          // declaring these to reduce confusion
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
              gasToken: WRAPPED_NATIVE_CURRENCY[1]!.address
            }
          );
  
          expect(swap).toBeDefined();
          expect(swap).not.toBeNull();
  
          const { quote, quoteGasAdjusted, methodParameters, estimatedGasUsedGasToken } = swap!;
  
          expect(estimatedGasUsedGasToken).toBeDefined();
          expect(estimatedGasUsedGasToken?.currency.equals(WRAPPED_NATIVE_CURRENCY[1]!)).toBe(true);
  
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
                slippageTolerance: LARGE_SLIPPAGE,
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
                slippageTolerance: LARGE_SLIPPAGE,
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

          it.skip('eth -> erc20 without sufficient ETH balance', async () => {
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

          it('erc20 -> erc20 gas token specified', async () => {
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
                gasToken: DAI_MAINNET.address
              }
            );
    
            expect(swap).toBeDefined();
            expect(swap).not.toBeNull();
    
            const { quote, quoteGasAdjusted, methodParameters, estimatedGasUsedGasToken, simulationStatus } = swap!;

            expect(simulationStatus).toBeDefined();
            expect(simulationStatus).toEqual(SimulationStatus.Succeeded);
            expect(estimatedGasUsedGasToken).toBeDefined();
            expect(estimatedGasUsedGasToken?.currency.equals(DAI_MAINNET)).toBe(true);
    
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
    
          it('erc20 -> eth gas token as weth', async () => {
            // declaring these to reduce confusion
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
                simulate: { fromAddress: WHALES(tokenIn) },
              },
              {
                ...ROUTING_CONFIG,
                gasToken: WRAPPED_NATIVE_CURRENCY[1]!.address
              }
            );
    
            expect(swap).toBeDefined();
            expect(swap).not.toBeNull();
    
            const { quote, quoteGasAdjusted, methodParameters, estimatedGasUsedGasToken, simulationStatus } = swap!;

            expect(simulationStatus).toBeDefined();
            expect(simulationStatus).toEqual(SimulationStatus.Succeeded);
            expect(estimatedGasUsedGasToken).toBeDefined();
            expect(estimatedGasUsedGasToken?.currency.equals(WRAPPED_NATIVE_CURRENCY[1]!)).toBe(true);
    
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

          GREENLIST_TOKEN_PAIRS.forEach(([tokenIn, tokenOut]) => {
            it(`${tokenIn.symbol} -> ${tokenOut.symbol} with portion`, async () => {
              const originalAmount = (tokenIn.symbol === 'WBTC' && tradeType === TradeType.EXACT_INPUT) ||
              (tokenOut.symbol === 'WBTC' && tradeType === TradeType.EXACT_OUTPUT)
                ? '1'
                : '100';
              const amount =
                tradeType == TradeType.EXACT_INPUT
                  ? parseAmount(originalAmount, tokenIn)
                  : parseAmount(originalAmount, tokenOut);
              const bps = new Percent(FLAT_PORTION.bips, 10_000)

              const swap = await alphaRouter.route(
                amount,
                getQuoteToken(tokenIn, tokenOut, tradeType),
                tradeType,
                {
                  type: SwapType.UNIVERSAL_ROUTER,
                  recipient: alice._address,
                  slippageTolerance: LARGE_SLIPPAGE,
                  deadlineOrPreviousBlockhash: parseDeadline(360),
                  simulate: { fromAddress: WHALES(tokenIn) },
                  fee: tradeType == TradeType.EXACT_INPUT ? { fee: bps, recipient: FLAT_PORTION.recipient } : undefined,
                  flatFee: tradeType == TradeType.EXACT_OUTPUT ? { amount: amount.multiply(bps).quotient.toString(), recipient: FLAT_PORTION.recipient } : undefined
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

              const { quote, quoteGasAdjusted, quoteGasAndPortionAdjusted, methodParameters, portionAmount, route } = swap!;

              // The most strict way to ensure the output amount from route path is correct with respect to portion
              // is to make sure the output amount from route path is exactly portion bps different from the quote
              const allQuotesAcrossRoutes = route.map(route => route.quote).reduce((sum, quote) => quote.add(sum))
              if (tradeType === TradeType.EXACT_INPUT) {
                const tokensDiff = quote.subtract(allQuotesAcrossRoutes)
                const percentDiff = tokensDiff.asFraction.divide(quote.asFraction);
                expect(percentDiff.toFixed(10)).toEqual(new Fraction(FLAT_PORTION.bips, 10_000).toFixed(10))
              } else {
                expect(allQuotesAcrossRoutes.greaterThan(quote)).toBe(true);

                const tokensDiff = allQuotesAcrossRoutes.subtract(quote)
                const percentDiff = tokensDiff.asFraction.divide(quote.asFraction);
                expect(percentDiff.toFixed(10)).toEqual(new Fraction(FLAT_PORTION.bips, 10_000).toFixed(10))
              }

              expect(quoteGasAndPortionAdjusted).toBeDefined();
              expect(portionAmount).toBeDefined();

              const expectedPortionAmount = tradeType === TradeType.EXACT_INPUT ? quote.multiply(new Fraction(FLAT_PORTION.bips, 10_000)) : amount.multiply(new Fraction(FLAT_PORTION.bips, 10_000))
              expect(portionAmount?.toExact()).toEqual(expectedPortionAmount.toExact())

              // We must have very strict difference tolerance to not hide any bug.
              // the only difference can be due to rounding,
              // so regardless of token decimals & amounts,
              // the difference will always be at most 1
              const acceptableDifference = 1
              const acceptablePortionDifference = 1
              const portionQuoteAmount = tradeType === TradeType.EXACT_OUTPUT ? quoteGasAndPortionAdjusted!.subtract(quoteGasAdjusted) : portionAmount
              expect(portionQuoteAmount).toBeDefined();

              const targetQuoteGasAndPortionAdjustedDecimalsAmount =
                tradeType === TradeType.EXACT_OUTPUT ?
                  quoteGasAdjusted.add(portionQuoteAmount!) :
                  quoteGasAdjusted.subtract(expectedPortionAmount)
              await validateSwapRoute(
                quote,
                quoteGasAdjusted,
                tradeType,
                parseFloat(quote.toFixed(0)),
                acceptableDifference,
                quoteGasAndPortionAdjusted,
                parseFloat(targetQuoteGasAndPortionAdjustedDecimalsAmount.toFixed(0)),
                acceptablePortionDifference
              );

              // skip checking token in amount for native ETH, since we have no way to know the exact gas cost in terms of ETH token
              const checkTokenInAmount = tokenIn.isNative ? undefined: parseFloat(amount.toFixed(0))
              // skip checking token out amount for native ETH, since we have no way to know the exact gas cost in terms of ETH token
              const checkTokenOutAmount = tokenOut.isNative ? undefined : parseFloat(amount.toFixed(0))
              const checkPortionAmount = parseFloat(expectedPortionAmount.toFixed(0))

              const skipQuoteTokenCheck =
                // If token out is native, and trade type is exact in, check quote token will fail due to unable to know the exact gas cost in terms of ETH token
                tokenOut.isNative && tradeType === TradeType.EXACT_INPUT
                // If token in is native, and trade type is exact out, check quote token will fail due to unable to know the exact gas cost in terms of ETH token
                || tokenIn.isNative && tradeType === TradeType.EXACT_OUTPUT

              await validateExecuteSwap(
                SwapType.UNIVERSAL_ROUTER,
                quote,
                tokenIn,
                tokenOut,
                methodParameters,
                tradeType,
                checkTokenInAmount,
                checkTokenOutAmount,
                undefined,
                false,
                FLAT_PORTION,
                checkPortionAmount,
                skipQuoteTokenCheck
              );
            });
          });

          // FOT swap only works for exact in
          if (tradeType === TradeType.EXACT_INPUT) {
            const tokenInAndTokenOut = [
              [BULLET_WITHOUT_TAX, WETH9[ChainId.MAINNET]!],
              [WETH9[ChainId.MAINNET]!, BULLET_WITHOUT_TAX],
            ]

            tokenInAndTokenOut.forEach(([tokenIn, tokenOut]) => {
              it(`fee-on-transfer ${tokenIn?.symbol} -> ${tokenOut?.symbol}`, async () => {
                const enableFeeOnTransferFeeFetching = [true, false, undefined]
                // we want to swap the tokenIn/tokenOut order so that we can test both sellFeeBps and buyFeeBps for exactIn vs exactOut
                const originalAmount = tokenIn?.equals(WETH9[ChainId.MAINNET]!) ? '10' : '2924'
                const amount = parseAmount(originalAmount, tokenIn!);

                // Parallelize the FOT quote requests, because we notice there might be tricky race condition that could cause quote to not include FOT tax
                const responses = await Promise.all(
                  enableFeeOnTransferFeeFetching.map(async (enableFeeOnTransferFeeFetching) => {
                    if (enableFeeOnTransferFeeFetching) {
                      // if it's FOT flag enabled request, we delay it so that it's more likely to repro the race condition in
                      // https://github.com/Uniswap/smart-order-router/pull/415#issue-1914604864
                      await new Promise((f) => setTimeout(f, 1000))
                    }

                    const swap = await feeOnTransferAlphaRouter.route(
                      amount,
                      getQuoteToken(tokenIn!, tokenOut!, tradeType),
                      tradeType,
                      {
                        type: SwapType.UNIVERSAL_ROUTER,
                        recipient: alice._address,
                        slippageTolerance: LARGE_SLIPPAGE,
                        deadlineOrPreviousBlockhash: parseDeadline(360),
                        simulate: { fromAddress: WHALES(tokenIn!) },
                      },
                      {
                        ...ROUTING_CONFIG,
                        enableFeeOnTransferFeeFetching: enableFeeOnTransferFeeFetching
                      }
                    );

                    expect(swap).toBeDefined();
                    expect(swap).not.toBeNull();

                    // Expect tenderly simulation to be successful
                    expect(swap!.simulationStatus).toEqual(SimulationStatus.Succeeded);
                    expect(swap!.methodParameters).toBeDefined();
                    expect(swap!.methodParameters!.to).toBeDefined();

                    return { enableFeeOnTransferFeeFetching, ...swap! }
                  })
                )

                const quoteWithFlagOn = responses.find((r) => r.enableFeeOnTransferFeeFetching === true)
                expect(quoteWithFlagOn).toBeDefined();
                responses
                  .filter((r) => r.enableFeeOnTransferFeeFetching !== true)
                  .forEach((r) => {
                    if (tradeType === TradeType.EXACT_INPUT) {
                      // quote without fot flag must be greater than the quote with fot flag
                      // this is to catch https://github.com/Uniswap/smart-order-router/pull/421
                      expect(r.quote.greaterThan(quoteWithFlagOn!.quote)).toBeTruthy();

                      // below is additional assertion to ensure the quote without fot tax vs quote with tax should be very roughly equal to the fot sell/buy tax rate
                      const tokensDiff = r.quote.subtract(quoteWithFlagOn!.quote);
                      const percentDiff = tokensDiff.asFraction.divide(r.quote.asFraction);
                      if (tokenIn?.equals(BULLET_WITHOUT_TAX)) {
                        expect(percentDiff.toFixed(3, undefined, Rounding.ROUND_HALF_UP)).toEqual((new Fraction(BigNumber.from(BULLET.sellFeeBps ?? 0).toString(), 10_000)).toFixed(3));
                      } else if (tokenOut?.equals(BULLET_WITHOUT_TAX)) {
                        expect(percentDiff.toFixed(3, undefined, Rounding.ROUND_HALF_UP)).toEqual((new Fraction(BigNumber.from(BULLET.buyFeeBps ?? 0).toString(), 10_000)).toFixed(3));
                      }
                    }
                  })

                for (const response of responses) {
                  const { enableFeeOnTransferFeeFetching, quote, quoteGasAdjusted, methodParameters, route, estimatedGasUsed } = response

                  if (tradeType == TradeType.EXACT_INPUT) {
                    expect(quoteGasAdjusted.lessThan(quote)).toBeTruthy();
                  } else {
                    expect(quoteGasAdjusted.greaterThan(quote)).toBeTruthy();
                  }

                  expect(methodParameters).toBeDefined();

                  for (const r of route) {
                    expect(r.route).toBeInstanceOf(V2Route)
                    const tokenIn = (r.route as V2Route).input
                    const tokenOut = (r.route as V2Route).output
                    const pools = (r.route as V2Route).pairs

                    for (const pool of pools) {
                      if (enableFeeOnTransferFeeFetching) {
                        // the assertion here will differ from routing-api one
                        // https://github.com/Uniswap/routing-api/blob/09a40a0a9a40ad0881337decd0db9a43ba39f3eb/test/mocha/integ/quote.test.ts#L1141-L1152
                        // the reason is because from sor, we intentionally don't reinstantiate token in and token out with the fot taxes
                        // at sor level, fot taxes can only be retrieved from the pool reserves
                        if (tokenIn.address === BULLET.address) {
                          expect(tokenIn.sellFeeBps).toBeUndefined();
                          expect(tokenIn.buyFeeBps).toBeUndefined();
                        }
                        if (tokenOut.address === BULLET.address) {
                          expect(tokenOut.sellFeeBps).toBeUndefined();
                          expect(tokenOut.buyFeeBps).toBeUndefined();
                        }
                        if (pool.reserve0.currency.address === BULLET.address) {
                          expect(pool.reserve0.currency.sellFeeBps).toBeDefined();
                          expect(pool.reserve0.currency.sellFeeBps?.toString()).toEqual(BULLET.sellFeeBps?.toString())
                          expect(pool.reserve0.currency.buyFeeBps).toBeDefined();
                          expect(pool.reserve0.currency.buyFeeBps?.toString()).toEqual(BULLET.buyFeeBps?.toString())
                        }
                        if (pool.reserve1.currency.address === BULLET.address) {
                          expect(pool.reserve1.currency.sellFeeBps).toBeDefined();
                          expect(pool.reserve1.currency.sellFeeBps?.toString()).toEqual(BULLET.sellFeeBps?.toString())
                          expect(pool.reserve1.currency.buyFeeBps).toBeDefined();
                          expect(pool.reserve1.currency.buyFeeBps?.toString()).toEqual(BULLET.buyFeeBps?.toString())
                        }
                      } else {
                        expect(tokenOut.sellFeeBps).toBeUndefined();
                        expect(tokenOut.buyFeeBps).toBeUndefined();
                        // we actually don't have a way to toggle off the fot taxes for pool reserve at sor level,
                        // due to https://github.com/Uniswap/smart-order-router/pull/415
                        // we are relying on routing-api level test assertion
                        // https://github.com/Uniswap/routing-api/blob/09a40a0a9a40ad0881337decd0db9a43ba39f3eb/test/mocha/integ/quote.test.ts#L1168-L1172
                        if (pool.reserve0.currency.address === BULLET.address) {
                          expect(pool.reserve0.currency.sellFeeBps).toBeDefined();
                          expect(pool.reserve0.currency.buyFeeBps).toBeDefined();
                        }
                        if (pool.reserve1.currency.address === BULLET.address) {
                          expect(pool.reserve1.currency.sellFeeBps).toBeDefined();
                          expect(pool.reserve1.currency.buyFeeBps).toBeDefined();
                        }
                      }
                    }
                  }

                  // without enabling the fee fetching
                  // sometimes we can get execute swap failure due to unpredictable gas limit
                  // underneath the hood, the returned universal router calldata can be bad enough to cause swap failures
                  // which is equivalent of what was happening in prod, before interface supports FOT
                  // we only care about hardhat fork swap execution success after we enable fee-on-transfer
                  if (enableFeeOnTransferFeeFetching) {
                    const checkTokenInAmount = parseFloat(amount.toFixed(0))
                    const checkTokenOutAmount = parseFloat(amount.toFixed(0))

                    // We don't have a bullet proof way to asser the fot-involved quote is post tax
                    // so the best way is to execute the swap on hardhat mainnet fork,
                    // and make sure the executed quote doesn't differ from callstatic simulated quote by over slippage tolerance
                    await validateExecuteSwap(
                      SwapType.UNIVERSAL_ROUTER,
                      quote,
                      tokenIn!,
                      tokenOut!,
                      methodParameters,
                      tradeType,
                      checkTokenInAmount,
                      checkTokenOutAmount,
                      estimatedGasUsed
                    );
                  }
                }
              })
            });
          }
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
          jest.setTimeout(1000 * 1000); // 1000s

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

        it('ETH -> UNI', async () => {
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
              protocols: [Protocol.MIXED],
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
  const TEST_ERC20_1: { [chainId in ChainId]: () => Token } = {
    [ChainId.MAINNET]: () => USDC_ON(ChainId.MAINNET),
    [ChainId.GOERLI]: () => UNI_GOERLI,
    [ChainId.SEPOLIA]: () => USDC_ON(ChainId.SEPOLIA),
    [ChainId.OPTIMISM]: () => USDC_ON(ChainId.OPTIMISM),
    [ChainId.OPTIMISM_GOERLI]: () => USDC_ON(ChainId.OPTIMISM_GOERLI),
    [ChainId.ARBITRUM_ONE]: () => USDC_ON(ChainId.ARBITRUM_ONE),
    [ChainId.ARBITRUM_GOERLI]: () => USDC_ON(ChainId.ARBITRUM_GOERLI),
    [ChainId.POLYGON]: () => USDC_ON(ChainId.POLYGON),
    [ChainId.POLYGON_MUMBAI]: () => USDC_ON(ChainId.POLYGON_MUMBAI),
    [ChainId.CELO]: () => CUSD_CELO,
    [ChainId.CELO_ALFAJORES]: () => CUSD_CELO_ALFAJORES,
    [ChainId.GNOSIS]: () => WBTC_GNOSIS,
    [ChainId.MOONBEAM]: () => WBTC_MOONBEAM,
    [ChainId.BNB]: () => USDC_BNB,
    [ChainId.AVALANCHE]: () => USDC_ON(ChainId.AVALANCHE),
    [ChainId.BASE]: () => USDC_ON(ChainId.BASE),
    [ChainId.BASE_GOERLI]: () => USDC_ON(ChainId.BASE_GOERLI),
  };
  const TEST_ERC20_2: { [chainId in ChainId]: () => Token } = {
    [ChainId.MAINNET]: () => DAI_ON(1),
    [ChainId.GOERLI]: () => DAI_ON(ChainId.GOERLI),
    [ChainId.SEPOLIA]: () => DAI_ON(ChainId.SEPOLIA),
    [ChainId.OPTIMISM]: () => DAI_ON(ChainId.OPTIMISM),
    [ChainId.OPTIMISM_GOERLI]: () => DAI_ON(ChainId.OPTIMISM_GOERLI),
    [ChainId.ARBITRUM_ONE]: () => DAI_ON(ChainId.ARBITRUM_ONE),
    [ChainId.ARBITRUM_GOERLI]: () => DAI_ON(ChainId.ARBITRUM_GOERLI),
    [ChainId.POLYGON]: () => DAI_ON(ChainId.POLYGON),
    [ChainId.POLYGON_MUMBAI]: () => DAI_ON(ChainId.POLYGON_MUMBAI),
    [ChainId.CELO]: () => CEUR_CELO,
    [ChainId.CELO_ALFAJORES]: () => CEUR_CELO_ALFAJORES,
    [ChainId.GNOSIS]: () => USDC_ETHEREUM_GNOSIS,
    [ChainId.MOONBEAM]: () => WBTC_MOONBEAM,
    [ChainId.BNB]: () => USDT_BNB,
    [ChainId.AVALANCHE]: () => DAI_ON(ChainId.AVALANCHE),
    [ChainId.BASE]: () => WNATIVE_ON(ChainId.BASE),
    [ChainId.BASE_GOERLI]: () => WNATIVE_ON(ChainId.BASE_GOERLI),
  };

  // TODO: Find valid pools/tokens on optimistic kovan and polygon mumbai. We skip those tests for now.
  for (const chain of _.filter(
    SUPPORTED_CHAINS,
    (c) =>
      c != ChainId.OPTIMISM_GOERLI &&
      c != ChainId.POLYGON_MUMBAI &&
      c != ChainId.ARBITRUM_GOERLI &&
      // Tests are failing https://github.com/Uniswap/smart-order-router/issues/104
      c != ChainId.CELO_ALFAJORES &&
      c != ChainId.SEPOLIA
  )) {
    for (const tradeType of [TradeType.EXACT_INPUT, TradeType.EXACT_OUTPUT]) {
      const erc1 = TEST_ERC20_1[chain]();
      const erc2 = TEST_ERC20_2[chain]();

      describe(`${ID_TO_NETWORK_NAME(chain)} ${tradeType} 2xx`, function() {
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
          const tokenFeeFetcher = new OnChainTokenFeeFetcher(
            ChainId.MAINNET,
            hardhat.provider
          )
          const tokenPropertiesProvider = new TokenPropertiesProvider(
            ChainId.MAINNET,
            new NodeJSCache(new NodeCache({ stdTTL: 360, useClones: false })),
            tokenFeeFetcher
          )
          const v2PoolProvider = new V2PoolProvider(chain, multicall2Provider, tokenPropertiesProvider);

          const portionProvider = new PortionProvider();
          const ethEstimateGasSimulator = new EthEstimateGasSimulator(
            chain,
            provider,
            v2PoolProvider,
            v3PoolProvider,
            portionProvider
          );

          const tenderlySimulator = new TenderlySimulator(
            chain,
            process.env.TENDERLY_BASE_URL!,
            process.env.TENDERLY_USER!,
            process.env.TENDERLY_PROJECT!,
            process.env.TENDERLY_ACCESS_KEY!,
            v2PoolProvider,
            v3PoolProvider,
            provider,
            portionProvider
          );

          const simulator = new FallbackTenderlySimulator(
            chain,
            provider,
            new PortionProvider(),
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

        describe(`Swap`, function() {
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
            // TODO ROUTE-64: Remove this once smart-order-router supports ETH native currency on BASE
            // see https://uniswapteam.slack.com/archives/C021SU4PMR7/p1691593679108459?thread_ts=1691532336.742419&cid=C021SU4PMR7
            const tokenOut = chain == ChainId.BASE ? USDC_ON(ChainId.BASE) : erc2

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
          describe(`Simulate + Swap ${tradeType.toString()}`, function() {
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
                chain == ChainId.GOERLI
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
                  saveTenderlySimulationIfFailed: true,
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
                chain == ChainId.GOERLI
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
                  saveTenderlySimulationIfFailed: true,
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
              // TODO ROUTE-64: Remove this once smart-order-router supports ETH native currency on BASE
              // see https://uniswapteam.slack.com/archives/C021SU4PMR7/p1691593679108459?thread_ts=1691532336.742419&cid=C021SU4PMR7
              const tokenOut = chain == ChainId.BASE ? USDC_ON(ChainId.BASE) : erc2
              const amount =
                tradeType == TradeType.EXACT_INPUT
                  ? parseAmount('1', tokenIn)
                  : parseAmount('1', tokenOut);

              // Universal Router is not deployed on Gorli.
              const swapOptions: SwapOptions =
                chain == ChainId.GOERLI
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
                  saveTenderlySimulationIfFailed: true,
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
