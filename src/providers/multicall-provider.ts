import { Interface } from '@ethersproject/abi';
import { BigNumber } from 'ethers';
import { ProviderConfig } from './provider';

export type CallSameFunctionOnMultipleContractsParams<
  TFunctionParams,
  TAdditionalConfig = any
> = {
  addresses: string[];
  contractInterface: Interface;
  functionName: string;
  functionParams?: TFunctionParams;
  providerConfig?: ProviderConfig;
  additionalConfig?: TAdditionalConfig;
};

export type CallSameFunctionOnContractWithMultipleParams<
  TFunctionParams,
  TAdditionalConfig = any
> = {
  address: string;
  contractInterface: Interface;
  functionName: string;
  functionParams: TFunctionParams[];
  providerConfig?: ProviderConfig;
  additionalConfig?: TAdditionalConfig;
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

export abstract class IMulticallProvider<TMulticallConfig = any> {
  public abstract callSameFunctionOnMultipleContracts<
    TFunctionParams extends any[] | undefined,
    TReturn = any
  >(
    params: CallSameFunctionOnMultipleContractsParams<
      TFunctionParams,
      TMulticallConfig
    >
  ): Promise<{
    blockNumber: BigNumber;
    results: Result<TReturn>[];
  }>;

  public abstract callSameFunctionOnContractWithMultipleParams<
    TFunctionParams extends any[] | undefined,
    TReturn = any
  >(
    params: CallSameFunctionOnContractWithMultipleParams<
      TFunctionParams,
      TMulticallConfig
    >
  ): Promise<{
    blockNumber: BigNumber;
    results: Result<TReturn>[];
  }>;
}
