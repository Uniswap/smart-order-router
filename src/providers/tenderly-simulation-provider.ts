import { Token } from '@uniswap/sdk-core';
import axios from 'axios'
import { BigNumber } from 'ethers'
import { SwapRoute } from '../routers'
import { log } from '../util'
import { APPROVE_TOKEN_FOR_TRANSFER, V3_ROUTER2_ADDRESS } from '../util/callData'

export const TENDERLY_BATCH_SIMULATE_API = (
  tenderlyBaseUrl: string,
  tenderlyUser: string,
  tenderlyProject: string
) => `${tenderlyBaseUrl}/api/v1/account/${tenderlyUser}/project/${tenderlyProject}/simulate-batch`

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
    fromAddress: string,
    route: SwapRoute
  ) => Promise<SwapRoute>
}
export class TenderlyProvider implements ISimulator {
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
    fromAddress: string,
    route: SwapRoute,
  ): Promise<SwapRoute> {
    const { calldata } = route.methodParameters!
    if(!route.methodParameters) {
      throw new Error("No calldata provided to simulate transaction")
    }
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
      estimate_gas: true,
    }

    const body = {"simulations": [approve, swap]}
    const opts = {
      headers: {
        'X-Access-Key': this.tenderlyAccessKey,
      },
    }
    const url = TENDERLY_BATCH_SIMULATE_API(this.tenderlyBaseUrl, this.tenderlyUser, this.tenderlyProject)
    const resp = await axios.post(url, body, opts)

    // Validate tenderly response body
    if(resp.data && resp.data.simulation_results.length == 2 && resp.data.simulation_results[1].transaction && !resp.data.simulation_results[1].transaction.error) {
      log.info({approve:resp.data.simulation_results[0],swap:resp.data.simulation_results[1]}, 'Simulated Transaction Via Tenderly')
      route.estimatedGasUsed = resp.data.simulation_results[1].transaction.gas_used as BigNumber
    } else {
      const errMsg = `Failed to Simulate Via Tenderly!`
      log.info({resp:resp},errMsg)
      throw new Error(errMsg)
    }
    return route
  }
}
