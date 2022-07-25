import axios from 'axios'
import { log } from '../util'
import { APPROVE_TOKEN_FOR_TRANSFER, V3_ROUTER2_ADDRESS } from '../util/callData'

export const TENDERLY_BATCH_SIMULATE_API = (
  TENDERLY_BASE_URL: string,
  TENDERLY_USER: string,
  TENDERLY_PROJECT: string
) => `${TENDERLY_BASE_URL}/api/v1/account/${TENDERLY_USER}/project/${TENDERLY_PROJECT}/simulate-batch`

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
    chainId: number,
    hexData: string,
    tokenInAddress: string,
    fromAddress: string,
    fallback?: number
  ) => Promise<number|Error>
}
export class TenderlyProvider implements ISimulator {
  TENDERLY_BASE_URL: string
  TENDERLY_USER: string
  TENDERLY_PROJECT: string
  TENDERLY_ACCESS_KEY: string
  constructor(TENDERLY_BASE_URL: string, TENDERLY_USER: string, TENDERLY_PROJECT: string, TENDERLY_ACCESS_KEY: string) {
    this.TENDERLY_BASE_URL = TENDERLY_BASE_URL
    this.TENDERLY_USER = TENDERLY_USER
    this.TENDERLY_PROJECT = TENDERLY_PROJECT
    this.TENDERLY_ACCESS_KEY = TENDERLY_ACCESS_KEY
  }

  public async simulateTransaction(
    chainId: number,
    hexData: string,
    tokenInAddress: string,
    fromAddress: string,
    fallback?: number,
    stateOverrides?: Record<string, unknown>
  ): Promise<number|Error> {
    log.info(
      {
        hexData: hexData,
        fromAddress: fromAddress,
        chainId: chainId,
        tokenInAddress: tokenInAddress,
      },
      'Simulating transaction via Tenderly'
    )

    const approve = {
      network_id: chainId,
      input: APPROVE_TOKEN_FOR_TRANSFER,
      to: tokenInAddress,
      value: "0",
      from: fromAddress,
      gasPrice: "0",
      gas: 30000000,
    }

    const swap = {
      network_id: chainId,
      input: hexData,
      to: V3_ROUTER2_ADDRESS,
      value: "0",
      from: fromAddress,
      gasPrice: "0",
      gas: 30000000,
      type: 1,
      estimate_gas: true,
      stateOverrides: stateOverrides
    }

    const body = {"simulations": [approve, swap]}
    body
    const opts = {
      headers: {
        'X-Access-Key': this.TENDERLY_ACCESS_KEY,
      },
    }
    const url = TENDERLY_BATCH_SIMULATE_API(this.TENDERLY_BASE_URL, this.TENDERLY_USER, this.TENDERLY_PROJECT)
    const resp=await axios.post(url, body, opts)
    if(resp.data && resp.data.simulation_results.length == 2 && resp.data.simulation_results[1].transaction.error == null) {
      log.info({approve:resp.data.simulation_results[0],swap:resp.data.simulation_results[1]}, 'Simulated Transaction Via Tenderly')
      return resp.data.simulation_results[1].transaction.gas_used as number
    } else {
      log.info(`Failed to Simulate Via Tenderly!`)
      if(!fallback) {
        return new Error('`Failed to Simulate Via Tenderly! No fallback set!`')
      }
      log.info(`Defaulting to fallback return value of: ${fallback}s.`)
      return fallback
    }
  }
}
