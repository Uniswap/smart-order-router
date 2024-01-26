import { BigNumber } from '@ethersproject/bignumber';
import { BaseProvider } from '@ethersproject/providers';
import { ChainId } from '@uniswap/sdk-core';
import { CallMultipleFunctionsOnSameContractParams, CallSameFunctionOnContractWithMultipleParams, CallSameFunctionOnMultipleContractsParams, IMulticallProvider, Result } from './multicall-provider';
export type UniswapMulticallConfig = {
    gasLimitPerCallOverride?: number;
};
/**
 * The UniswapMulticall contract has added functionality for limiting the amount of gas
 * that each call within the multicall can consume. This is useful for operations where
 * a call could consume such a large amount of gas that it causes the node to error out
 * with an out of gas error.
 *
 * @export
 * @class UniswapMulticallProvider
 */
export declare class UniswapMulticallProvider extends IMulticallProvider<UniswapMulticallConfig> {
    protected chainId: ChainId;
    protected provider: BaseProvider;
    protected gasLimitPerCall: number;
    private multicallContract;
    constructor(chainId: ChainId, provider: BaseProvider, gasLimitPerCall?: number);
    callSameFunctionOnMultipleContracts<TFunctionParams extends any[] | undefined, TReturn = any>(params: CallSameFunctionOnMultipleContractsParams<TFunctionParams>): Promise<{
        blockNumber: BigNumber;
        results: Result<TReturn>[];
    }>;
    callSameFunctionOnContractWithMultipleParams<TFunctionParams extends any[] | undefined, TReturn>(params: CallSameFunctionOnContractWithMultipleParams<TFunctionParams, UniswapMulticallConfig>): Promise<{
        blockNumber: BigNumber;
        results: Result<TReturn>[];
        approxGasUsedPerSuccessCall: number;
    }>;
    callMultipleFunctionsOnSameContract<TFunctionParams extends any[] | undefined, TReturn>(params: CallMultipleFunctionsOnSameContractParams<TFunctionParams, UniswapMulticallConfig>): Promise<{
        blockNumber: BigNumber;
        results: Result<TReturn>[];
        approxGasUsedPerSuccessCall: number;
    }>;
}
