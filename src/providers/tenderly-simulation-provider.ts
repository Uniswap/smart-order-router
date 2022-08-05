import { Contract } from "@ethersproject/contracts";
import { JsonRpcProvider } from '@ethersproject/providers';
import { Currency } from '@uniswap/sdk-core';
import { Pool } from "@uniswap/v3-sdk";
import axios from 'axios'
import { BigNumber } from 'ethers/lib/ethers';
import _ from 'lodash';

import v3SwapRouter from '../abis/v3SwapRouter.json';
import { SwapRoute } from '../routers'
import { IERC20Metadata__factory } from "../types/v3/factories/IERC20Metadata__factory";
import { ChainId, CurrencyAmount, log, WRAPPED_NATIVE_CURRENCY } from '../util'
import { APPROVE_TOKEN_FOR_TRANSFER, V3_ROUTER2_ADDRESS } from '../util/callData'
import { calculateArbitrumToL1SecurityFee, calculateOptimismToL1SecurityFee, getGasCostInNativeCurrency, getGasCostInQuoteToken, getGasCostInUSD, getHighestLiquidityV3NativePool, getHighestLiquidityV3USDPool } from '../util/gasCalc'

import { ArbitrumGasData, OptimismGasData } from "./v3/gas-data-provider";
import { IV3PoolProvider } from './v3/pool-provider';

type simulation_result = {
  transaction:{hash:string,gas_used:number,error_message:string},simulation:{state_overrides:Record<string,unknown>}
}

export type TENDERLY_RESPONSE = {
  config: {
    url: string,
    method: string,
    data: string,
  },
  simulation_results: [simulation_result, simulation_result],
}

const TENDERLY_BATCH_SIMULATE_API = (
  tenderlyBaseUrl: string,
  tenderlyUser: string,
  tenderlyProject: string
) => `${tenderlyBaseUrl}/api/v1/account/${tenderlyUser}/project/${tenderlyProject}/simulate-batch`

// We multiply tenderly gas estimate by this estimate to overestimate gas fee
const ESTIMATE_MULTIPLIER = 1.25

/**
 * Provider for dry running transactions on tenderly.
 *
 * @export
 * @interface ISimulator
 */
export interface ISimulator {
  v3PoolProvider?: IV3PoolProvider
  /**
   * Returns the gas fee that was paid to land the transaction in the simulation.
   * @returns number or Error
   */
  simulateTransaction: (
    fromAddress: string,
    route: SwapRoute,
    gasPriceWei: BigNumber,
    l2GasData?: OptimismGasData|ArbitrumGasData
  ) => Promise<SwapRoute>
}

export class FallbackTenderlySimulator implements ISimulator {
  private provider: JsonRpcProvider;
  private tenderlySimulator: TenderlySimulator;
  v3PoolProvider?: IV3PoolProvider;

  constructor(tenderlyBaseUrl: string, tenderlyUser: string, tenderlyProject: string, tenderlyAccessKey: string, provider: JsonRpcProvider) {
    this.tenderlySimulator = new TenderlySimulator(tenderlyBaseUrl, tenderlyUser, tenderlyProject, tenderlyAccessKey)
    this.provider = provider
  }

  private async ethEstimateGas(fromAddress: string, tokenIn: Currency, calldata: string): Promise<{approved:boolean,estimatedGasUsed:BigNumber}> {
    // For erc20s, we must check if the token allowance is sufficient
    if(!tokenIn.isNative) {
      const contract = new Contract(tokenIn.address, IERC20Metadata__factory.createInterface(), this.provider);
      let allowance:number
      try {
        allowance = await contract.callStatic["allowance"]!(fromAddress, V3_ROUTER2_ADDRESS)
        // Since we max approve, assume that any non zero allowance is enough for the trade
        // TODO: check that allowance >= amount(tokenIn)
        if(allowance <= 0) return {approved:false, estimatedGasUsed:BigNumber.from(-1)}
      } catch(err) {
          const msg = "check allowance failed while simulating!"
          log.info({err:err}, msg)
          throw new Error(msg)
      }
    }

    const router = new Contract(V3_ROUTER2_ADDRESS, v3SwapRouter, this.provider)
    try {
      const estimatedGasUsed:BigNumber = await router.estimateGas['multicall(bytes[])']!([calldata])
      return { approved:true,estimatedGasUsed:estimatedGasUsed }
    } catch(err) {
      const msg = "Error calling eth_estimateGas!"
      log.info({err:err}, msg)
      throw new Error(msg)
    }
  }

  public async simulateTransaction(
    fromAddress: string,
    route: SwapRoute,
    gasPriceWei: BigNumber,
    l2GasData?: ArbitrumGasData|OptimismGasData
  ): Promise<SwapRoute> {
    const quoteToken = route.quote.currency
    const tokenIn = route.trade.inputAmount.currency
    // calculate L2 to L1 security fee if relevant
    let L2toL1FeeInWei = BigNumber.from(0)
    if([ChainId.ARBITRUM_ONE, ChainId.ARBITRUM_RINKEBY].includes(tokenIn.chainId)) {
      L2toL1FeeInWei = calculateArbitrumToL1SecurityFee(route.methodParameters!.calldata, l2GasData as ArbitrumGasData)[1]
    } else if([ChainId.OPTIMISM, ChainId.OPTIMISTIC_KOVAN].includes(tokenIn.chainId)) {
      L2toL1FeeInWei = calculateOptimismToL1SecurityFee(route.methodParameters!.calldata, l2GasData as OptimismGasData)[1]
    }

    let approved = false
    try {
      ({ approved, estimatedGasUsed:route.estimatedGasUsed } = await this.ethEstimateGas(fromAddress, tokenIn.wrapped, route.methodParameters!.calldata))
    } catch {
      // set error flag to true
      return { ...route, simulationError: true }
    }

    if(!approved) {
      try {
        route.estimatedGasUsed = await this.tenderlySimulator.simulateTransaction(fromAddress,route)
      } catch(err) {
          // set error flag to true
          return { ...route, simulationError: true }
      }
    }

    // add l2 fee and wrap fee to native currency
    const gasCostInWei = (gasPriceWei.mul(route.estimatedGasUsed)).add(L2toL1FeeInWei);
    const nativeCurrency = WRAPPED_NATIVE_CURRENCY[tokenIn.chainId as ChainId];
    const costNativeCurrency = getGasCostInNativeCurrency(nativeCurrency, gasCostInWei)

    const usdPool: Pool = await getHighestLiquidityV3USDPool(
      tokenIn.chainId,
      this.v3PoolProvider!
    );

    const gasCostUSD = await getGasCostInUSD(nativeCurrency, usdPool, costNativeCurrency)
    
    let gasCostQuoteToken = costNativeCurrency

    // get fee in terms of quote token
    if (!(quoteToken.wrapped.equals(nativeCurrency))) {
      const nativePool = await getHighestLiquidityV3NativePool(
        quoteToken.wrapped,
        this.v3PoolProvider!
      );
      if(!nativePool) {
        log.info('Could not find a pool to convert the cost into the quote token')
        gasCostQuoteToken = CurrencyAmount.fromRawAmount(quoteToken.wrapped, 0);
      } else {
        gasCostQuoteToken = await getGasCostInQuoteToken(quoteToken.wrapped, nativePool, costNativeCurrency)
      }
    }

    // Adjust quote for gas fees
    let quoteGasAdjusted: CurrencyAmount
    if(tokenIn.wrapped.equals(quoteToken.wrapped)) {
      // Exact output - need more of tokenIn to get the desired amount of tokenOut
      quoteGasAdjusted = route.quote.add(gasCostQuoteToken)
    } else {
      // Exact input - can get less of tokenOut due to fees
      quoteGasAdjusted = route.quote.subtract(gasCostQuoteToken)
    }

    return {...route, estimatedGasUsedUSD: gasCostUSD, estimatedGasUsedQuoteToken: gasCostQuoteToken, quoteGasAdjusted:quoteGasAdjusted}
  }
}
export class TenderlySimulator {
  private tenderlyBaseUrl: string
  private tenderlyUser: string
  private tenderlyProject: string
  private tenderlyAccessKey: string

  constructor(tenderlyBaseUrl: string, tenderlyUser: string, tenderlyProject: string, tenderlyAccessKey: string) {
    this.tenderlyBaseUrl = tenderlyBaseUrl
    this.tenderlyUser = tenderlyUser
    this.tenderlyProject = tenderlyProject
    this.tenderlyAccessKey = tenderlyAccessKey
  }

  public async simulateTransaction(
    fromAddress: string,
    route: SwapRoute,
  ):Promise<BigNumber> {
    const tokenIn = route.quote.currency.wrapped
    if([ChainId.CELO, ChainId.CELO_ALFAJORES].includes(tokenIn.chainId)) {
      const msg = "Celo not supported by Tenderly!"
      log.info(msg)
      throw new Error(msg)
    }

    if(!route.methodParameters) {
      throw new Error("No calldata provided to simulate transaction")
    }
    const { calldata } = route.methodParameters
    log.info(
      {
        calldata: route.methodParameters.calldata,
        fromAddress: fromAddress,
        chainId: tokenIn.chainId,
        tokenInAddress: tokenIn.address,
      },
      'Simulating transaction via Tenderly'
    )

    const approve = {
      network_id: tokenIn.chainId,
      input: APPROVE_TOKEN_FOR_TRANSFER,
      to: tokenIn.address,
      value: "0",
      from: fromAddress,
      gasPrice: "0",
      gas: 30000000,
    }

    const swap = {
      network_id: tokenIn.chainId,
      input: calldata,
      to: V3_ROUTER2_ADDRESS,
      value: BigNumber.from(route.methodParameters.value).toString(),
      from: fromAddress,
      gasPrice: "0",
      gas: 30000000,
      type: 1,
    }

    const body = {"simulations": [approve, swap]}
    const opts = {
      headers: {
        'X-Access-Key': this.tenderlyAccessKey,
      },
    }
    const url = TENDERLY_BATCH_SIMULATE_API(this.tenderlyBaseUrl, this.tenderlyUser, this.tenderlyProject)
    let resp: TENDERLY_RESPONSE
    try {
      resp = (await axios.post<TENDERLY_RESPONSE>(url, body, opts)).data
    } catch(err) {
        log.info({err:err},`Failed to Simulate Via Tenderly!`)
        throw err
    }

    // Validate tenderly response body
    if(!(resp && resp.simulation_results.length == 2 && resp.simulation_results[1].transaction && !resp.simulation_results[1].transaction.error_message)) {
      const err = resp.simulation_results[1].transaction.error_message
      log.info({err:err},`Failed to Simulate Via Tenderly!`)
      throw new Error(err)
    }

    log.info({approve:resp.simulation_results[0],swap:resp.simulation_results[1]}, 'Simulated Approval + Swap via Tenderly')

    // Parse the gas used in the simulation response object, and then pad it so that we overestimate.
    return BigNumber.from((resp.simulation_results[1].transaction.gas_used*ESTIMATE_MULTIPLIER).toFixed(0))
  }
}
