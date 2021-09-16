import { BigNumber, providers } from 'ethers';
import _ from 'lodash';
import stats from 'stats-lite';
import { UniswapInterfaceMulticall__factory } from '../types/v3/factories/UniswapInterfaceMulticall__factory';
import { UniswapInterfaceMulticall } from '../types/v3/UniswapInterfaceMulticall';
import { ChainId } from '../util';
import { UNISWAP_MULTICALL_ADDRESS } from '../util/addresses';
import { log } from '../util/log';
import {
  CallSameFunctionOnContractWithMultipleParams,
  CallSameFunctionOnMultipleContractsParams,
  IMulticallProvider,
  Result,
} from './multicall-provider';

export type UniswapMulticallConfig = {
  gasLimitPerCallOverride?: number;
};

const contractAddressByChain: { [chainId in ChainId]?: string } = {
  [ChainId.MAINNET]: UNISWAP_MULTICALL_ADDRESS,
  [ChainId.RINKEBY]: UNISWAP_MULTICALL_ADDRESS,
  [ChainId.KOVAN]: UNISWAP_MULTICALL_ADDRESS,
  [ChainId.ROPSTEN]: UNISWAP_MULTICALL_ADDRESS,
  [ChainId.GÖRLI]: UNISWAP_MULTICALL_ADDRESS
}

export class UniswapMulticallProvider extends IMulticallProvider<UniswapMulticallConfig> {
  private multicallContract: UniswapInterfaceMulticall;

  constructor(
    protected chainId: ChainId,
    protected provider: providers.BaseProvider,
    protected gasLimitPerCall = 1_000_000,
    protected multicallAddressOverride = UNISWAP_MULTICALL_ADDRESS
  ) {
    super();
    const multicallAddress = multicallAddressOverride ? multicallAddressOverride : contractAddressByChain[this.chainId];
    
    if (!multicallAddress) {
      throw new Error(`No address for Uniswap Multicall Contract on chain id: ${chainId}`);
    }

    this.multicallContract = UniswapInterfaceMulticall__factory.connect(
      multicallAddress,
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
    const {
      addresses,
      contractInterface,
      functionName,
      functionParams,
      providerConfig,
    } = params;

    const blockNumberOverride = providerConfig?.blockNumber ?? undefined;

    const fragment = contractInterface.getFunction(functionName);
    const callData = contractInterface.encodeFunctionData(
      fragment,
      functionParams
    );

    const calls = _.map(addresses, (address) => {
      return {
        target: address,
        callData,
        gasLimit: this.gasLimitPerCall,
      };
    });

    log.debug(
      { calls },
      `About to multicall for ${functionName} across ${addresses.length} addresses`
    );

    const { blockNumber, returnData: aggregateResults } =
      await this.multicallContract.callStatic.multicall(calls, {
        blockTag: blockNumberOverride,
      });

    const results: Result<TReturn>[] = [];

    for (let i = 0; i < aggregateResults.length; i++) {
      const { success, returnData } = aggregateResults[i]!;

      // Return data "0x" is sometimes returned for invalid calls.
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
      `Results for multicall on ${functionName} across ${addresses.length} addresses as of block ${blockNumber}`
    );

    return { blockNumber, results };
  }

  public async callSameFunctionOnContractWithMultipleParams<
    TFunctionParams extends any[] | undefined,
    TReturn
  >(
    params: CallSameFunctionOnContractWithMultipleParams<
      TFunctionParams,
      UniswapMulticallConfig
    >
  ): Promise<{
    blockNumber: BigNumber;
    results: Result<TReturn>[];
    approxGasUsedPerSuccessCall: number;
  }> {
    const {
      address,
      contractInterface,
      functionName,
      functionParams,
      additionalConfig,
      providerConfig,
    } = params;
    const fragment = contractInterface.getFunction(functionName);

    const gasLimitPerCall =
      additionalConfig?.gasLimitPerCallOverride ?? this.gasLimitPerCall;
    const blockNumberOverride = providerConfig?.blockNumber ?? undefined;

    const calls = _.map(functionParams, (functionParam) => {
      const callData = contractInterface.encodeFunctionData(
        fragment,
        functionParam
      );

      return {
        target: address,
        callData,
        gasLimit: gasLimitPerCall,
      };
    });

    log.debug(
      { calls },
      `About to multicall for ${functionName} at address ${address} with ${functionParams.length} different sets of params`
    );

    const { blockNumber, returnData: aggregateResults } =
      await this.multicallContract.callStatic.multicall(calls, {
        blockTag: blockNumberOverride,
      });

    const results: Result<TReturn>[] = [];

    const gasUsedForSuccess: number[] = [];
    for (let i = 0; i < aggregateResults.length; i++) {
      const { success, returnData, gasUsed } = aggregateResults[i]!;

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

      gasUsedForSuccess.push(gasUsed.toNumber());

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
      `Results for multicall for ${functionName} at address ${address} with ${functionParams.length} different sets of params. Results as of block ${blockNumber}`
    );
    return {
      blockNumber,
      results,
      approxGasUsedPerSuccessCall: stats.percentile(gasUsedForSuccess, 99),
    };
  }
}
