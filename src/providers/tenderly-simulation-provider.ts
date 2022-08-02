import { Contract } from "@ethersproject/contracts";
import { JsonRpcProvider } from '@ethersproject/providers';
import { Token } from '@uniswap/sdk-core';
import axios from 'axios'
import { BigNumber } from 'ethers/lib/ethers';
import _ from 'lodash';

import v3SwapRouter from '../abis/v3SwapRouter.json';
import { SwapRoute } from '../routers'
import { IERC20Metadata__factory } from "../types/v3/factories/IERC20Metadata__factory";
import { ChainId, log } from '../util'
import { APPROVE_TOKEN_FOR_TRANSFER, V3_ROUTER2_ADDRESS } from '../util/callData'

import { getGasCostsInUSDandQuote } from './util'
import { ArbitrumGasData, IL2GasDataProvider, OptimismGasData } from "./v3/gas-data-provider";
import { IV3PoolProvider } from './v3/pool-provider';

type simulation_result = {
  transaction:{hash:string,gas_used:number,error_message:string},simulation:{state_overrides:Record<string,unknown>}
}

export type TENDERLY_RESPONSE = {
  status: number,
  statusText: string,
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
const ESTIMATE_MULTIPLIER = 1.1

/**
 * Provider for dry running transactions on tenderly.
 *
 * @export
 * @interface ISimulator
 */
export interface ISimulator {
  /**
   * Returns the gas fee that was paid to land the transaction in the simulation.
   * @returns number or Error
   */
  simulateTransaction: (
    tokenIn: Token,
    quoteToken: Token,
    fromAddress: string,
    route: SwapRoute,
    v3PoolProvider: IV3PoolProvider,
    l2GasDataProvider?: IL2GasDataProvider<ArbitrumGasData|OptimismGasData>
  ) => Promise<SwapRoute>
}

export class FallbackTenderlySimulator {
  private provider: JsonRpcProvider;
  private tenderlySimulator: ISimulator;

  constructor(tenderlyBaseUrl: string, tenderlyUser: string, tenderlyProject: string, tenderlyAccessKey: string, provider: JsonRpcProvider,) {
    this.tenderlySimulator = new TenderlySimulator(tenderlyBaseUrl, tenderlyUser, tenderlyProject, tenderlyAccessKey)
    this.provider = provider
  }

  private async ethEstimateGas(fromAddress: string, tokenIn: Token, calldata: string): Promise<{approved:boolean,estimatedGasUsed:BigNumber}> {
    const provider = this.provider
    const contract = new Contract(tokenIn.address, IERC20Metadata__factory.createInterface(), provider);
    let allowance:number
    try {
      allowance = await contract.callStatic["allowance"]!(fromAddress, V3_ROUTER2_ADDRESS)
    } catch(err) {
        const msg = "Eth_EstimateGas failed!"
        log.info({err:err}, msg)
        throw new Error(msg)
    }
    // Since we max approve, assume that any non zero allowance is enough for the trade
    if(allowance == 0) {
      return {approved:false, estimatedGasUsed:BigNumber.from(-1)}
    } else {
      const router = new Contract(V3_ROUTER2_ADDRESS, v3SwapRouter, provider)
      try {
        const estimatedGasUsed:BigNumber = await router.estimateGas['multicall(bytes[])']!([calldata])
        return {approved:true,estimatedGasUsed:estimatedGasUsed}
      } catch(err) {
        const msg = "Error calling eth_estimateGas!"
        log.info({err:err}, msg)
        throw new Error(msg)
      }
    }
  }

  public async simulateTransaction(
    tokenIn: Token,
    quoteToken: Token,
    fromAddress: string,
    route: SwapRoute,
    v3PoolProvider: IV3PoolProvider,
    l2GasDataProvider?: IL2GasDataProvider<ArbitrumGasData|OptimismGasData>
  ): Promise<SwapRoute> {
    const {approved, estimatedGasUsed} = await this.ethEstimateGas(fromAddress, tokenIn, route.methodParameters!.calldata)
    if(approved) {
      return {...route, estimatedGasUsed: estimatedGasUsed}
    } else {
      return this.tenderlySimulator.simulateTransaction(tokenIn,quoteToken,fromAddress,route,v3PoolProvider,l2GasDataProvider)
    }
  }
}
export class TenderlySimulator implements ISimulator {
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
    tokenIn: Token,
    quoteToken: Token,
    fromAddress: string,
    route: SwapRoute,
    v3PoolProvider: IV3PoolProvider,
    l2GasDataProvider?: IL2GasDataProvider<ArbitrumGasData|OptimismGasData>
  ): Promise<SwapRoute> {
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
      value: "0",
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
    const resp = await axios.post<TENDERLY_RESPONSE>(url, body, opts)

    // Validate tenderly response body
    if(!(resp.status==200 && resp.data && resp.data.simulation_results.length == 2 && resp.data.simulation_results[1].transaction && !resp.data.simulation_results[1].transaction.error_message)) {
      const errMsg = `Failed to Simulate Via Tenderly!`
      log.info({resp:resp},errMsg)
      throw new Error(errMsg)
    }

    log.info({approve:resp.data.simulation_results[0],swap:resp.data.simulation_results[1]}, 'Simulated Approval + Swap via Tenderly')

    // Parse the gas used in the simulation response object, and then pad it so that we overestimate.
    const gasUsed = resp.data.simulation_results[1].transaction.gas_used * ESTIMATE_MULTIPLIER
    const l1FeeInWei = BigNumber.from((gasUsed).toFixed())

    // gasCostL1USD and gasCostL1QuoteToken is the cost of gas in each of those tokens
    const { gasCostL1QuoteToken, gasCostL1USD } = await getGasCostsInUSDandQuote(quoteToken,l1FeeInWei,v3PoolProvider)
    const quoteGasAdjusted = route.quote.subtract(gasCostL1QuoteToken)
    if(l2GasDataProvider) {
      const quoteGasAdjustedForL1 = l2GasDataProvider.getGasData()
      return {...route, estimatedGasUsed:l1FeeInWei, estimatedGasUsedUSD: gasCostL1USD, estimatedGasUsedQuoteToken: gasCostL1QuoteToken, quoteGasAdjusted:quoteGasAdjustedForL1}
    }
    return {...route, estimatedGasUsed:l1FeeInWei, estimatedGasUsedUSD: gasCostL1USD, estimatedGasUsedQuoteToken: gasCostL1QuoteToken, quoteGasAdjusted:quoteGasAdjusted}
  }
}
