
import { TradeType } from '@uniswap/sdk-core';
import _ from 'lodash';
import {
  AlphaRouter,
  AlphaRouterConfig,
  CurrencyAmount,
  USDC_MAINNET,
  USDT_MAINNET,
  WBTC_MAINNET,
  DAI_MAINNET,
  WRAPPED_NATIVE_CURRENCY,
  WETH9,
} from '../../../../src';
// MARK: end SOR imports

import { BigNumber, providers } from 'ethers'
import hre from 'hardhat'
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';

// const helper = require('../../../../src/routers/alpha-router/functions/calculate-ratio-amount-in');

const { ethers } = hre

describe('alpha router integration', () => {

  let alice: SignerWithAddress
  let block: number

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

    alphaRouter = new AlphaRouter({
      chainId: 1,
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
    const amount = CurrencyAmount.fromRawAmount(USDC, 10000);

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
