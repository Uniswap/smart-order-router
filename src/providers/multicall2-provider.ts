import { Interface } from '@ethersproject/abi';
import { BigNumber, providers } from 'ethers';
import _ from 'lodash';
import { Multicall2, Multicall2__factory } from '../types/other';
import { MULTICALL2_ADDRESS } from '../util/addresses';
import { log } from '../util/log';

export type CallSameFunctionOnMultipleContractsParams<TFunctionParams> = {
  addresses: string[];
  contractInterface: Interface;
  functionName: string;
  functionParams?: TFunctionParams;
};

export type CallSameFunctionOnContractWithMultipleParams<TFunctionParams> = {
  address: string;
  contractInterface: Interface;
  functionName: string;
  functionParams: TFunctionParams[];
};

export type SuccessResult<TReturn> = {
  success: true;
  result: TReturn;
};

export type FailResult = {
  success: false;
  returnData: string;
};

export type Result<TReturn> = SuccessResult<TReturn> | FailResult;

export class Multicall2Provider {
  private multicallContract: Multicall2;

  constructor(protected provider: providers.BaseProvider) {
    this.multicallContract = Multicall2__factory.connect(
      MULTICALL2_ADDRESS,
      this.provider
    );
  }

  public async callSameFunctionOnMultipleContracts<
    TFunctionParams extends any[] | undefined,
    TReturn = any
  >(
    params: CallSameFunctionOnMultipleContractsParams<TFunctionParams>
  ): Promise<{
    blockNumber: BigNumber;
    results: Result<TReturn>[];
  }> {
    const { addresses, contractInterface, functionName, functionParams } =
      params;

    const fragment = contractInterface.getFunction(functionName);
    const callData = contractInterface.encodeFunctionData(
      fragment,
      functionParams
    );

    const calls = _.map(addresses, (address) => {
      return {
        target: address,
        callData,
      };
    });

    log.debug(
      { calls },
      `About to multicall2 tryBlockAndAggregate for ${functionName} across ${addresses.length} addresses`
    );

    const { blockNumber, returnData: aggregateResults } =
      await this.multicallContract.callStatic.tryBlockAndAggregate(
        false,
        calls
      );

    const results: Result<TReturn>[] = [];

    for (let i = 0; i < aggregateResults.length; i++) {
      const { success, returnData } = aggregateResults[i]!;

      // Return data "0x" is sometimes returned for invalid pools.
      if (!success || returnData.length <= 2) {
        log.debug(
          { result: aggregateResults[i] },
          `Invalid result calling ${functionName} on address ${addresses[i]}`
        );
        results.push({
          success: false,
          returnData,
        });
        continue;
      }

      results.push({
        success: true,
        result: contractInterface.decodeFunctionResult(
          fragment,
          returnData
        ) as unknown as TReturn,
      });
    }

    log.debug(
      { results },
      `Results for multicall2 using tryBlockAndAggregate on ${functionName} across ${addresses.length} addresses as of block ${blockNumber}`
    );

    return { blockNumber, results };
  }

  public async callSameFunctionOnContractWithMultipleParams<
    TFunctionParams extends any[] | undefined,
    TReturn = any
  >(
    params: CallSameFunctionOnContractWithMultipleParams<TFunctionParams>
  ): Promise<{
    blockNumber: BigNumber;
    results: Result<TReturn>[];
  }> {
    const { address, contractInterface, functionName, functionParams } = params;
    const fragment = contractInterface.getFunction(functionName);

    const calls = _.map(functionParams, (functionParam) => {
      const callData = contractInterface.encodeFunctionData(
        fragment,
        functionParam
      );

      return {
        target: address,
        callData,
      };
    });

    log.debug(
      { calls },
      `About to multicall2 tryBlockAndAggregate for ${functionName} at address ${address} with ${functionParams.length} different sets of params`
    );

    const { blockNumber, returnData: aggregateResults } =
      await this.multicallContract.callStatic.tryBlockAndAggregate(
        false,
        calls
      );

    const results: Result<TReturn>[] = [];

    for (let i = 0; i < aggregateResults.length; i++) {
      const { success, returnData } = aggregateResults[i]!;

      // Return data "0x" is sometimes returned for invalid pools.
      if (!success || returnData.length <= 2) {
        log.debug(
          { result: aggregateResults[i] },
          `Invalid result calling ${functionName} with params ${functionParams[i]}`
        );
        results.push({
          success: false,
          returnData,
        });
        continue;
      }

      results.push({
        success: true,
        result: contractInterface.decodeFunctionResult(
          fragment,
          returnData
        ) as unknown as TReturn,
      });
    }

    log.debug(
      { results, functionName, address },
      `Results for multicall2 using tryBlockAndAggregate for ${functionName} at address ${address} with ${functionParams.length} different sets of params. Results as of block ${blockNumber}`
    );
    return { blockNumber, results };
  }
}
