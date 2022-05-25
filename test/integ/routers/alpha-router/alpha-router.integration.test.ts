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
  ChainId,
} from '../../../../src';
// MARK: end SOR imports
import '@uniswap/hardhat-plugin-jest';

import { JsonRpcSigner } from '@ethersproject/providers';

// import { resetAndFundAtBlock } from '../../../test-util/forkAndFund';
import { MethodParameters } from '@uniswap/v3-sdk';
import { getBalance, getBalanceAndApprove } from '../../../test-util/getBalanceAndApprove';
import { BigNumber, providers } from 'ethers';
import { Protocol } from '@uniswap/router-sdk';
import { DEFAULT_ROUTING_CONFIG_BY_CHAIN } from '../../../../src/routers/alpha-router/config';

const SWAP_ROUTER_V2 = '0x68b3465833fb72A70ecDF485E0e4C7bD8665Fc45'

describe('alpha router integration', () => {

  // @ts-ignore
  let alice: JsonRpcSigner;
  jest.setTimeout(500 * 1000); // 500s

  let alphaRouter: AlphaRouter;

  const ROUTING_CONFIG: AlphaRouterConfig = {
    // @ts-ignore
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
    await hardhat.approve(alice._address, SWAP_ROUTER_V2, currencyIn);
    const tokenInBefore = await hardhat.getBalance(alice._address, currencyIn);
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

    await transactionResponse.wait()

    const tokenInAfter = await hardhat.getBalance(alice._address, currencyIn)
    const tokenOutAfter = await hardhat.getBalance(alice._address, currencyOut)

    return {
      tokenInAfter,
      tokenInBefore,
      tokenOutAfter,
      tokenOutBefore,
    }
  }

  beforeAll(async () => {

    // alice = hardhat.provider.getSigner();
    // alice = hardhat.provider.getSigner();
    alice = hardhat.providers[0]!.getSigner()
    const aliceAddress = await alice.getAddress();

    await hardhat.forkAndFund(alice._address, [
      parseAmount('80', USDC_MAINNET),
      // parseAmount('5000000', USDT_MAINNET),
      // parseAmount('10', WBTC_MAINNET),
      // // parseAmount('1000', UNI_MAINNET),
      // parseAmount('4000', WETH9[1]),
      // parseAmount('5000000', DAI_MAINNET),
    ])

    console.log("forked and funded")

    const aliceUSDCBalance = await hardhat.getBalance(alice._address, USDC_MAINNET);
    expect(aliceUSDCBalance).toEqual(parseAmount('80', USDC_MAINNET));

    alphaRouter = new AlphaRouter({
      chainId: 1,
      provider: hardhat.providers[0]!
    })
  })

  it('returns correct quote', async () => {
    const amount = CurrencyAmount.fromRawAmount(USDC_MAINNET, 10000);

    const swap = await alphaRouter.route(
      amount,
      WRAPPED_NATIVE_CURRENCY[1],
      TradeType.EXACT_INPUT,
      undefined,
      {
        ...ROUTING_CONFIG
      }
    );
    expect(swap).toBeDefined();
    expect(swap).not.toBeNull();

    console.log(swap);
  })
})
