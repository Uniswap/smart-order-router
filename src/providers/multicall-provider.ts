import { Interface } from '@ethersproject/abi';
import { BigNumber } from 'ethers';

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

export abstract class IMulticallProvider {
  public abstract callSameFunctionOnMultipleContracts<
    TFunctionParams extends any[] | undefined,
    TReturn = any
  >(
    params: CallSameFunctionOnMultipleContractsParams<TFunctionParams>
  ): Promise<{
    blockNumber: BigNumber;
    results: Result<TReturn>[];
  }>;

  public abstract callSameFunctionOnContractWithMultipleParams<
    TFunctionParams extends any[] | undefined,
    TReturn = any
  >(
    params: CallSameFunctionOnContractWithMultipleParams<TFunctionParams>
  ): Promise<{
    blockNumber: BigNumber;
    results: Result<TReturn>[];
  }>;
}
