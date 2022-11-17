import axios from 'axios';
import { BigNumber } from 'ethers/lib/ethers';

import { ChainId, log, SWAP_ROUTER_ADDRESS } from '../util';

export enum FeeType {
  Legacy = 'legacy',
  Eip1559 = 'eip1559',
}

/**
 * Fee information for EIP-1559 fees
 * @member type - This will always be "eip1559"
 * @member gasLimit - Units of gas used for this transaction, e.g. the output of `provider.estimateGas(tx)`
 * @member gasFee - Total fees by speed, denoted in wei. This accounts for both gas price and gas limit
 * @member maxPriorityFeePerGas - Miner tip by speed, denoted in wei
 * @member maxBaseFeePerGas - Base fee used for this transaction
 */
export type FeeResponseEip1559 = {
  type: FeeType.Eip1559;
  gasLimit: string;
  gasFee: {
    normal: string;
    fast: string;
    urgent: string;
  };
  maxPriorityFeePerGas: {
    normal: string;
    fast: string;
    urgent: string;
  };
  maxFeePerGas: {
    normal: string;
    fast: string;
    urgent: string;
  };
};

export type FeeResponseLegacy = {
  type: FeeType.Legacy;
  gasLimit: string;
  gasFee: {
    normal: string;
    fast: string;
    urgent: string;
  };
  gasPrice: {
    normal: string;
    fast: string;
    urgent: string;
  };
};

export type GasFeeResponse = FeeResponseEip1559 | FeeResponseLegacy;

export class GasServiceProvider {
  public async getGasServiceEstimatesWithGasLimit(
    chainId: ChainId,
    calldata: string,
    gasLimit: BigNumber
  ): Promise<GasFeeResponse> {
    const body = {
      chainId,
      to: SWAP_ROUTER_ADDRESS,
      data: calldata,
      gasLimit: gasLimit.toString(),
    };
    const headers = {
      'Content-Type': 'application/json',
    };
    try {
      const resp = await axios.post<GasFeeResponse>(
        'https://api.uniswap.org/gas-fee',
        body,
        { headers: headers }
      );
      return resp.data;
    } catch (e: unknown) {
      log.info(`Request to gas-service failed!`, e);
      throw e;
    }
  }
  public async getGasServiceEstimatesWithFromAddress(
    chainId: ChainId,
    calldata: string,
    fromAddress: string
  ): Promise<GasFeeResponse> {
    const body = {
      chainId,
      from: fromAddress,
      to: SWAP_ROUTER_ADDRESS,
      data: calldata,
    };
    const headers = {
      'Content-Type': 'application/json',
    };
    try {
      const resp = await axios.post<GasFeeResponse>(
        'https://api.uniswap.org/gas-fee',
        body,
        { headers: headers }
      );
      return resp.data;
    } catch (e: unknown) {
      log.info(`Request to gas-service failed!`, e);
      throw e;
    }
  }
}
