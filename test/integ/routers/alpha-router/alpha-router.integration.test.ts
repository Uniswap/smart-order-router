import hre from 'hardhat';
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { Currency, CurrencyAmount, TradeType } from '@uniswap/sdk-core';
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
} from '../../../../src';
// MARK: end SOR imports

import { resetAndFundAtBlock } from '../../../test-util/forkAndFund';
import { MethodParameters } from '@uniswap/v3-sdk';
import { getBalance, getBalanceAndApprove } from '../../../test-util/getBalanceAndApprove';

const SWAP_ROUTER_V2 = '0x68b3465833fb72A70ecDF485E0e4C7bD8665Fc45'

const { ethers } = hre;

const PINNED_BLOCK_MAINNET = 14390000;

describe('alpha router integration', () => {

  let alice: SignerWithAddress
  let block: number

  block = PINNED_BLOCK_MAINNET;

  let alphaRouter: AlphaRouter;

  const ROUTING_CONFIG: AlphaRouterConfig = {
    v3PoolSelection: {
      topN: 0,
      topNDirectSwaps: 0,
      topNTokenInOut: 0,
      topNSecondHop: 0,
      topNWithEachBaseToken: 0,
      topNWithBaseToken: 0,
    },
    v2PoolSelection: {
      topN: 0,
      topNDirectSwaps: 0,
      topNTokenInOut: 0,
      topNSecondHop: 0,
      topNWithEachBaseToken: 0,
      topNWithBaseToken: 0,
    },
    maxSwapsPerPath: 3,
    minSplits: 1,
    maxSplits: 3,
    distributionPercent: 25,
    forceCrossProtocol: false,
  };

  // @ts-ignore
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
    const tokenInBefore = await getBalanceAndApprove(alice, SWAP_ROUTER_V2, currencyIn)
    const tokenOutBefore = await getBalance(alice, currencyOut)

    const transaction = {
      data: methodParameters.calldata,
      to: SWAP_ROUTER_V2,
      value: BigNumber.from(methodParameters.value),
      from: alice.address,
      gasPrice: BigNumber.from(2000000000000),
      type: 1,
    }

    const transactionResponse: providers.TransactionResponse = await alice.sendTransaction(transaction)

    await transactionResponse.wait()

    const tokenInAfter = await getBalance(alice, currencyIn)
    const tokenOutAfter = await getBalance(alice, currencyOut)

    return {
      tokenInAfter,
      tokenInBefore,
      tokenOutAfter,
      tokenOutBefore,
    }
  }

  beforeAll(async () => {
    ;[alice] = await ethers.getSigners()

    alice = await resetAndFundAtBlock(alice, block, [
      parseAmount('8000000', USDC_MAINNET),
      parseAmount('5000000', USDT_MAINNET),
      parseAmount('10', WBTC_MAINNET),
      // parseAmount('1000', UNI_MAINNET),
      parseAmount('4000', WETH9[1]),
      parseAmount('5000000', DAI_MAINNET),
    ])

    const aliceUSDCBalance = await getBalance(alice, USDC_MAINNET);
    expect(aliceUSDCBalance).toEqual(parseAmount('8000000', USDC_MAINNET));

    alphaRouter = new AlphaRouter({
      chainId: 1,
      provider: ethers.getDefaultProvider()
    })
  })

  it('calls route with hardcoded params', async () => {
    // const quoteReq: QuoteQueryParams = {
    //   tokenInAddress: 'USDC',
    //   tokenInChainId: 1,
    //   tokenOutAddress: 'USDT',
    //   tokenOutChainId: 1,
    //   amount: await getAmount(1, type, 'USDC', 'USDT', '100'),
    //   type,
    //   recipient: alice.address,
    //   slippageTolerance: SLIPPAGE,
    //   deadline: '360',
    //   algorithm,
    // }
    const amount = CurrencyAmount.fromRawAmount(USDC_MAINNET, 10000);

    const swap = await alphaRouter.route(
      amount,
      WRAPPED_NATIVE_CURRENCY[1],
      TradeType.EXACT_INPUT,
      undefined,
      { ...ROUTING_CONFIG }
    );
    expect(swap).toBeDefined();
  })
})
