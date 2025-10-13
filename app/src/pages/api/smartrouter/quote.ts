/*
 * @Author: leo leean1687@gmail.com
 * @Date: 2025-10-09 17:59:41
 * @LastEditors: leo leean1687@gmail.com
 * @LastEditTime: 2025-10-13 18:05:28
 * @FilePath: /app/src/pages/api/smartrouter/quote.ts
 * @Description: 这是默认设置,请设置`customMade`, 打开koroFileHeader查看配置 进行设置: https://github.com/OBKoro1/koro1FileHeader/wiki/%E9%85%8D%E7%BD%AE
 */
import { ethers } from 'ethers'
import { AlphaRouter, SwapOptionsSwapRouter02, SwapType } from '@uniswap/smart-order-router'
import { Percent, Token, CurrencyAmount } from '@uniswap/sdk-core'
import {
  TradeType
} from "@uniswap/sdk";
import type { ParamsOptions } from './index'
const ENDPOINTS_BASE = {
  1:`https://mainnet.infura.io/v3/`,
  137:`https://polygon-mainnet.infura.io/v3/`,
  8453:`https://base-mainnet.infura.io/v3/`,
  10:`https://optimism-mainnet.infura.io/v3/`,
  42161:`https://arbitrum-mainnet.infura.io/v3/`,
  43114:`https://avalanche-mainnet.infura.io/v3/`,
  56:`https://bsc-mainnet.infura.io/v3/`,
  130:`https://unichain-mainnet.infura.io/v3/`
}
const getProvider = (chainid: keyof typeof ENDPOINTS_BASE ) => {
  const provider = new ethers.providers.JsonRpcProvider(`${ENDPOINTS_BASE[chainid]}${process.env.NEXT_PUBLIC_ALCHEMY_API_KEY!}`)
  return provider
}

export const getRoute = async(params:ParamsOptions) => {
  const chainId = Number(params.chainId)
  const { token0, token1, walletAddress, slippage, amountIn } = params
  const router = new AlphaRouter({
    chainId,
    provider: getProvider(chainId as keyof typeof ENDPOINTS_BASE),
  })
  const TOKEN_IN = new Token(
    chainId,//chainId
    token0.address,
    token0.decimals,
    token0.symbol,
    token0.name
  );
  const TOKEN_OUT = new Token(
    chainId,//chainId
    token1.address,
    token1.decimals,
    token1.symbol,
    token1.name
  );
  const options: SwapOptionsSwapRouter02 = {
    recipient: walletAddress,
    slippageTolerance: new Percent(slippage, 10_000),
    deadline: Math.floor(Date.now() / 1000 + 1800),
    type: SwapType.SWAP_ROUTER_02,
  }
  const route = await router.route(
    CurrencyAmount.fromRawAmount(
      TOKEN_IN, //入
      ethers.utils.parseUnits(String(amountIn), TOKEN_IN.decimals).toString()
    ),
    TOKEN_OUT, //出
    TradeType.EXACT_INPUT,
    options
  );
  return route
}
