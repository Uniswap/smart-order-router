import _ from 'lodash';
import stats from 'stats-lite';
import { UniswapInterfaceMulticall__factory } from '../types/v3/factories/UniswapInterfaceMulticall__factory';
import { UNISWAP_MULTICALL_ADDRESSES } from '../util/addresses';
import { log } from '../util/log';
import { IMulticallProvider, } from './multicall-provider';
/**
 * The UniswapMulticall contract has added functionality for limiting the amount of gas
 * that each call within the multicall can consume. This is useful for operations where
 * a call could consume such a large amount of gas that it causes the node to error out
 * with an out of gas error.
 *
 * @export
 * @class UniswapMulticallProvider
 */
export class UniswapMulticallProvider extends IMulticallProvider {
    constructor(chainId, provider, gasLimitPerCall = 1000000) {
        super();
        this.chainId = chainId;
        this.provider = provider;
        this.gasLimitPerCall = gasLimitPerCall;
        const multicallAddress = UNISWAP_MULTICALL_ADDRESSES[this.chainId];
        if (!multicallAddress) {
            throw new Error(`No address for Uniswap Multicall Contract on chain id: ${chainId}`);
        }
        this.multicallContract = UniswapInterfaceMulticall__factory.connect(multicallAddress, this.provider);
    }
    async callSameFunctionOnMultipleContracts(params) {
        var _a;
        const { addresses, contractInterface, functionName, functionParams, providerConfig, } = params;
        const blockNumberOverride = (_a = providerConfig === null || providerConfig === void 0 ? void 0 : providerConfig.blockNumber) !== null && _a !== void 0 ? _a : undefined;
        const fragment = contractInterface.getFunction(functionName);
        const callData = contractInterface.encodeFunctionData(fragment, functionParams);
        const calls = _.map(addresses, (address) => {
            return {
                target: address,
                callData,
                gasLimit: this.gasLimitPerCall,
            };
        });
        log.debug({ calls }, `About to multicall for ${functionName} across ${addresses.length} addresses`);
        const { blockNumber, returnData: aggregateResults } = await this.multicallContract.callStatic.multicall(calls, {
            blockTag: blockNumberOverride,
        });
        const results = [];
        for (let i = 0; i < aggregateResults.length; i++) {
            const { success, returnData } = aggregateResults[i];
            // Return data "0x" is sometimes returned for invalid calls.
            if (!success || returnData.length <= 2) {
                log.debug({ result: aggregateResults[i] }, `Invalid result calling ${functionName} on address ${addresses[i]}`);
                results.push({
                    success: false,
                    returnData,
                });
                continue;
            }
            results.push({
                success: true,
                result: contractInterface.decodeFunctionResult(fragment, returnData),
            });
        }
        log.debug({ results }, `Results for multicall on ${functionName} across ${addresses.length} addresses as of block ${blockNumber}`);
        return { blockNumber, results };
    }
    async callSameFunctionOnContractWithMultipleParams(params) {
        var _a, _b;
        const { address, contractInterface, functionName, functionParams, additionalConfig, providerConfig, } = params;
        const fragment = contractInterface.getFunction(functionName);
        const gasLimitPerCall = (_a = additionalConfig === null || additionalConfig === void 0 ? void 0 : additionalConfig.gasLimitPerCallOverride) !== null && _a !== void 0 ? _a : this.gasLimitPerCall;
        const blockNumberOverride = (_b = providerConfig === null || providerConfig === void 0 ? void 0 : providerConfig.blockNumber) !== null && _b !== void 0 ? _b : undefined;
        const calls = _.map(functionParams, (functionParam) => {
            const callData = contractInterface.encodeFunctionData(fragment, functionParam);
            return {
                target: address,
                callData,
                gasLimit: gasLimitPerCall,
            };
        });
        log.debug({ calls }, `About to multicall for ${functionName} at address ${address} with ${functionParams.length} different sets of params`);
        const { blockNumber, returnData: aggregateResults } = await this.multicallContract.callStatic.multicall(calls, {
            blockTag: blockNumberOverride,
        });
        const results = [];
        const gasUsedForSuccess = [];
        for (let i = 0; i < aggregateResults.length; i++) {
            const { success, returnData, gasUsed } = aggregateResults[i];
            // Return data "0x" is sometimes returned for invalid pools.
            if (!success || returnData.length <= 2) {
                log.debug({ result: aggregateResults[i] }, `Invalid result calling ${functionName} with params ${functionParams[i]}`);
                results.push({
                    success: false,
                    returnData,
                });
                continue;
            }
            gasUsedForSuccess.push(gasUsed.toNumber());
            results.push({
                success: true,
                result: contractInterface.decodeFunctionResult(fragment, returnData),
            });
        }
        log.debug({ results, functionName, address }, `Results for multicall for ${functionName} at address ${address} with ${functionParams.length} different sets of params. Results as of block ${blockNumber}`);
        return {
            blockNumber,
            results,
            approxGasUsedPerSuccessCall: stats.percentile(gasUsedForSuccess, 99),
        };
    }
    async callMultipleFunctionsOnSameContract(params) {
        var _a, _b;
        const { address, contractInterface, functionNames, functionParams, additionalConfig, providerConfig, } = params;
        const gasLimitPerCall = (_a = additionalConfig === null || additionalConfig === void 0 ? void 0 : additionalConfig.gasLimitPerCallOverride) !== null && _a !== void 0 ? _a : this.gasLimitPerCall;
        const blockNumberOverride = (_b = providerConfig === null || providerConfig === void 0 ? void 0 : providerConfig.blockNumber) !== null && _b !== void 0 ? _b : undefined;
        const calls = _.map(functionNames, (functionName, i) => {
            const fragment = contractInterface.getFunction(functionName);
            const param = functionParams ? functionParams[i] : [];
            const callData = contractInterface.encodeFunctionData(fragment, param);
            return {
                target: address,
                callData,
                gasLimit: gasLimitPerCall,
            };
        });
        log.debug({ calls }, `About to multicall for ${functionNames.length} functions at address ${address} with ${functionParams === null || functionParams === void 0 ? void 0 : functionParams.length} different sets of params`);
        const { blockNumber, returnData: aggregateResults } = await this.multicallContract.callStatic.multicall(calls, {
            blockTag: blockNumberOverride,
        });
        const results = [];
        const gasUsedForSuccess = [];
        for (let i = 0; i < aggregateResults.length; i++) {
            const fragment = contractInterface.getFunction(functionNames[i]);
            const { success, returnData, gasUsed } = aggregateResults[i];
            // Return data "0x" is sometimes returned for invalid pools.
            if (!success || returnData.length <= 2) {
                log.debug({ result: aggregateResults[i] }, `Invalid result calling ${functionNames[i]} with ${functionParams ? functionParams[i] : '0'} params`);
                results.push({
                    success: false,
                    returnData,
                });
                continue;
            }
            gasUsedForSuccess.push(gasUsed.toNumber());
            results.push({
                success: true,
                result: contractInterface.decodeFunctionResult(fragment, returnData),
            });
        }
        log.debug({ results, functionNames, address }, `Results for multicall for ${functionNames.length} functions at address ${address} with ${functionParams ? functionParams.length : ' 0'} different sets of params. Results as of block ${blockNumber}`);
        return {
            blockNumber,
            results,
            approxGasUsedPerSuccessCall: stats.percentile(gasUsedForSuccess, 99),
        };
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibXVsdGljYWxsLXVuaXN3YXAtcHJvdmlkZXIuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi8uLi8uLi9zcmMvcHJvdmlkZXJzL211bHRpY2FsbC11bmlzd2FwLXByb3ZpZGVyLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUdBLE9BQU8sQ0FBQyxNQUFNLFFBQVEsQ0FBQztBQUN2QixPQUFPLEtBQUssTUFBTSxZQUFZLENBQUM7QUFHL0IsT0FBTyxFQUFFLGtDQUFrQyxFQUFFLE1BQU0sMERBQTBELENBQUM7QUFDOUcsT0FBTyxFQUFFLDJCQUEyQixFQUFFLE1BQU0sbUJBQW1CLENBQUM7QUFDaEUsT0FBTyxFQUFFLEdBQUcsRUFBRSxNQUFNLGFBQWEsQ0FBQztBQUVsQyxPQUFPLEVBSUwsa0JBQWtCLEdBRW5CLE1BQU0sc0JBQXNCLENBQUM7QUFNOUI7Ozs7Ozs7O0dBUUc7QUFDSCxNQUFNLE9BQU8sd0JBQXlCLFNBQVEsa0JBQTBDO0lBR3RGLFlBQ1ksT0FBZ0IsRUFDaEIsUUFBc0IsRUFDdEIsa0JBQWtCLE9BQVM7UUFFckMsS0FBSyxFQUFFLENBQUM7UUFKRSxZQUFPLEdBQVAsT0FBTyxDQUFTO1FBQ2hCLGFBQVEsR0FBUixRQUFRLENBQWM7UUFDdEIsb0JBQWUsR0FBZixlQUFlLENBQVk7UUFHckMsTUFBTSxnQkFBZ0IsR0FBRywyQkFBMkIsQ0FBQyxJQUFJLENBQUMsT0FBTyxDQUFDLENBQUM7UUFFbkUsSUFBSSxDQUFDLGdCQUFnQixFQUFFO1lBQ3JCLE1BQU0sSUFBSSxLQUFLLENBQ2IsMERBQTBELE9BQU8sRUFBRSxDQUNwRSxDQUFDO1NBQ0g7UUFFRCxJQUFJLENBQUMsaUJBQWlCLEdBQUcsa0NBQWtDLENBQUMsT0FBTyxDQUNqRSxnQkFBZ0IsRUFDaEIsSUFBSSxDQUFDLFFBQVEsQ0FDZCxDQUFDO0lBQ0osQ0FBQztJQUVNLEtBQUssQ0FBQyxtQ0FBbUMsQ0FJOUMsTUFBa0U7O1FBS2xFLE1BQU0sRUFDSixTQUFTLEVBQ1QsaUJBQWlCLEVBQ2pCLFlBQVksRUFDWixjQUFjLEVBQ2QsY0FBYyxHQUNmLEdBQUcsTUFBTSxDQUFDO1FBRVgsTUFBTSxtQkFBbUIsR0FBRyxNQUFBLGNBQWMsYUFBZCxjQUFjLHVCQUFkLGNBQWMsQ0FBRSxXQUFXLG1DQUFJLFNBQVMsQ0FBQztRQUVyRSxNQUFNLFFBQVEsR0FBRyxpQkFBaUIsQ0FBQyxXQUFXLENBQUMsWUFBWSxDQUFDLENBQUM7UUFDN0QsTUFBTSxRQUFRLEdBQUcsaUJBQWlCLENBQUMsa0JBQWtCLENBQ25ELFFBQVEsRUFDUixjQUFjLENBQ2YsQ0FBQztRQUVGLE1BQU0sS0FBSyxHQUFHLENBQUMsQ0FBQyxHQUFHLENBQUMsU0FBUyxFQUFFLENBQUMsT0FBTyxFQUFFLEVBQUU7WUFDekMsT0FBTztnQkFDTCxNQUFNLEVBQUUsT0FBTztnQkFDZixRQUFRO2dCQUNSLFFBQVEsRUFBRSxJQUFJLENBQUMsZUFBZTthQUMvQixDQUFDO1FBQ0osQ0FBQyxDQUFDLENBQUM7UUFFSCxHQUFHLENBQUMsS0FBSyxDQUNQLEVBQUUsS0FBSyxFQUFFLEVBQ1QsMEJBQTBCLFlBQVksV0FBVyxTQUFTLENBQUMsTUFBTSxZQUFZLENBQzlFLENBQUM7UUFFRixNQUFNLEVBQUUsV0FBVyxFQUFFLFVBQVUsRUFBRSxnQkFBZ0IsRUFBRSxHQUNqRCxNQUFNLElBQUksQ0FBQyxpQkFBaUIsQ0FBQyxVQUFVLENBQUMsU0FBUyxDQUFDLEtBQUssRUFBRTtZQUN2RCxRQUFRLEVBQUUsbUJBQW1CO1NBQzlCLENBQUMsQ0FBQztRQUVMLE1BQU0sT0FBTyxHQUFzQixFQUFFLENBQUM7UUFFdEMsS0FBSyxJQUFJLENBQUMsR0FBRyxDQUFDLEVBQUUsQ0FBQyxHQUFHLGdCQUFnQixDQUFDLE1BQU0sRUFBRSxDQUFDLEVBQUUsRUFBRTtZQUNoRCxNQUFNLEVBQUUsT0FBTyxFQUFFLFVBQVUsRUFBRSxHQUFHLGdCQUFnQixDQUFDLENBQUMsQ0FBRSxDQUFDO1lBRXJELDREQUE0RDtZQUM1RCxJQUFJLENBQUMsT0FBTyxJQUFJLFVBQVUsQ0FBQyxNQUFNLElBQUksQ0FBQyxFQUFFO2dCQUN0QyxHQUFHLENBQUMsS0FBSyxDQUNQLEVBQUUsTUFBTSxFQUFFLGdCQUFnQixDQUFDLENBQUMsQ0FBQyxFQUFFLEVBQy9CLDBCQUEwQixZQUFZLGVBQWUsU0FBUyxDQUFDLENBQUMsQ0FBQyxFQUFFLENBQ3BFLENBQUM7Z0JBQ0YsT0FBTyxDQUFDLElBQUksQ0FBQztvQkFDWCxPQUFPLEVBQUUsS0FBSztvQkFDZCxVQUFVO2lCQUNYLENBQUMsQ0FBQztnQkFDSCxTQUFTO2FBQ1Y7WUFFRCxPQUFPLENBQUMsSUFBSSxDQUFDO2dCQUNYLE9BQU8sRUFBRSxJQUFJO2dCQUNiLE1BQU0sRUFBRSxpQkFBaUIsQ0FBQyxvQkFBb0IsQ0FDNUMsUUFBUSxFQUNSLFVBQVUsQ0FDVzthQUN4QixDQUFDLENBQUM7U0FDSjtRQUVELEdBQUcsQ0FBQyxLQUFLLENBQ1AsRUFBRSxPQUFPLEVBQUUsRUFDWCw0QkFBNEIsWUFBWSxXQUFXLFNBQVMsQ0FBQyxNQUFNLDBCQUEwQixXQUFXLEVBQUUsQ0FDM0csQ0FBQztRQUVGLE9BQU8sRUFBRSxXQUFXLEVBQUUsT0FBTyxFQUFFLENBQUM7SUFDbEMsQ0FBQztJQUVNLEtBQUssQ0FBQyw0Q0FBNEMsQ0FJdkQsTUFHQzs7UUFNRCxNQUFNLEVBQ0osT0FBTyxFQUNQLGlCQUFpQixFQUNqQixZQUFZLEVBQ1osY0FBYyxFQUNkLGdCQUFnQixFQUNoQixjQUFjLEdBQ2YsR0FBRyxNQUFNLENBQUM7UUFDWCxNQUFNLFFBQVEsR0FBRyxpQkFBaUIsQ0FBQyxXQUFXLENBQUMsWUFBWSxDQUFDLENBQUM7UUFFN0QsTUFBTSxlQUFlLEdBQ25CLE1BQUEsZ0JBQWdCLGFBQWhCLGdCQUFnQix1QkFBaEIsZ0JBQWdCLENBQUUsdUJBQXVCLG1DQUFJLElBQUksQ0FBQyxlQUFlLENBQUM7UUFDcEUsTUFBTSxtQkFBbUIsR0FBRyxNQUFBLGNBQWMsYUFBZCxjQUFjLHVCQUFkLGNBQWMsQ0FBRSxXQUFXLG1DQUFJLFNBQVMsQ0FBQztRQUVyRSxNQUFNLEtBQUssR0FBRyxDQUFDLENBQUMsR0FBRyxDQUFDLGNBQWMsRUFBRSxDQUFDLGFBQWEsRUFBRSxFQUFFO1lBQ3BELE1BQU0sUUFBUSxHQUFHLGlCQUFpQixDQUFDLGtCQUFrQixDQUNuRCxRQUFRLEVBQ1IsYUFBYSxDQUNkLENBQUM7WUFFRixPQUFPO2dCQUNMLE1BQU0sRUFBRSxPQUFPO2dCQUNmLFFBQVE7Z0JBQ1IsUUFBUSxFQUFFLGVBQWU7YUFDMUIsQ0FBQztRQUNKLENBQUMsQ0FBQyxDQUFDO1FBRUgsR0FBRyxDQUFDLEtBQUssQ0FDUCxFQUFFLEtBQUssRUFBRSxFQUNULDBCQUEwQixZQUFZLGVBQWUsT0FBTyxTQUFTLGNBQWMsQ0FBQyxNQUFNLDJCQUEyQixDQUN0SCxDQUFDO1FBRUYsTUFBTSxFQUFFLFdBQVcsRUFBRSxVQUFVLEVBQUUsZ0JBQWdCLEVBQUUsR0FDakQsTUFBTSxJQUFJLENBQUMsaUJBQWlCLENBQUMsVUFBVSxDQUFDLFNBQVMsQ0FBQyxLQUFLLEVBQUU7WUFDdkQsUUFBUSxFQUFFLG1CQUFtQjtTQUM5QixDQUFDLENBQUM7UUFFTCxNQUFNLE9BQU8sR0FBc0IsRUFBRSxDQUFDO1FBRXRDLE1BQU0saUJBQWlCLEdBQWEsRUFBRSxDQUFDO1FBQ3ZDLEtBQUssSUFBSSxDQUFDLEdBQUcsQ0FBQyxFQUFFLENBQUMsR0FBRyxnQkFBZ0IsQ0FBQyxNQUFNLEVBQUUsQ0FBQyxFQUFFLEVBQUU7WUFDaEQsTUFBTSxFQUFFLE9BQU8sRUFBRSxVQUFVLEVBQUUsT0FBTyxFQUFFLEdBQUcsZ0JBQWdCLENBQUMsQ0FBQyxDQUFFLENBQUM7WUFFOUQsNERBQTREO1lBQzVELElBQUksQ0FBQyxPQUFPLElBQUksVUFBVSxDQUFDLE1BQU0sSUFBSSxDQUFDLEVBQUU7Z0JBQ3RDLEdBQUcsQ0FBQyxLQUFLLENBQ1AsRUFBRSxNQUFNLEVBQUUsZ0JBQWdCLENBQUMsQ0FBQyxDQUFDLEVBQUUsRUFDL0IsMEJBQTBCLFlBQVksZ0JBQWdCLGNBQWMsQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUMxRSxDQUFDO2dCQUNGLE9BQU8sQ0FBQyxJQUFJLENBQUM7b0JBQ1gsT0FBTyxFQUFFLEtBQUs7b0JBQ2QsVUFBVTtpQkFDWCxDQUFDLENBQUM7Z0JBQ0gsU0FBUzthQUNWO1lBRUQsaUJBQWlCLENBQUMsSUFBSSxDQUFDLE9BQU8sQ0FBQyxRQUFRLEVBQUUsQ0FBQyxDQUFDO1lBRTNDLE9BQU8sQ0FBQyxJQUFJLENBQUM7Z0JBQ1gsT0FBTyxFQUFFLElBQUk7Z0JBQ2IsTUFBTSxFQUFFLGlCQUFpQixDQUFDLG9CQUFvQixDQUM1QyxRQUFRLEVBQ1IsVUFBVSxDQUNXO2FBQ3hCLENBQUMsQ0FBQztTQUNKO1FBRUQsR0FBRyxDQUFDLEtBQUssQ0FDUCxFQUFFLE9BQU8sRUFBRSxZQUFZLEVBQUUsT0FBTyxFQUFFLEVBQ2xDLDZCQUE2QixZQUFZLGVBQWUsT0FBTyxTQUFTLGNBQWMsQ0FBQyxNQUFNLGtEQUFrRCxXQUFXLEVBQUUsQ0FDN0osQ0FBQztRQUNGLE9BQU87WUFDTCxXQUFXO1lBQ1gsT0FBTztZQUNQLDJCQUEyQixFQUFFLEtBQUssQ0FBQyxVQUFVLENBQUMsaUJBQWlCLEVBQUUsRUFBRSxDQUFDO1NBQ3JFLENBQUM7SUFDSixDQUFDO0lBRU0sS0FBSyxDQUFDLG1DQUFtQyxDQUk5QyxNQUdDOztRQU1ELE1BQU0sRUFDSixPQUFPLEVBQ1AsaUJBQWlCLEVBQ2pCLGFBQWEsRUFDYixjQUFjLEVBQ2QsZ0JBQWdCLEVBQ2hCLGNBQWMsR0FDZixHQUFHLE1BQU0sQ0FBQztRQUVYLE1BQU0sZUFBZSxHQUNuQixNQUFBLGdCQUFnQixhQUFoQixnQkFBZ0IsdUJBQWhCLGdCQUFnQixDQUFFLHVCQUF1QixtQ0FBSSxJQUFJLENBQUMsZUFBZSxDQUFDO1FBQ3BFLE1BQU0sbUJBQW1CLEdBQUcsTUFBQSxjQUFjLGFBQWQsY0FBYyx1QkFBZCxjQUFjLENBQUUsV0FBVyxtQ0FBSSxTQUFTLENBQUM7UUFFckUsTUFBTSxLQUFLLEdBQUcsQ0FBQyxDQUFDLEdBQUcsQ0FBQyxhQUFhLEVBQUUsQ0FBQyxZQUFZLEVBQUUsQ0FBQyxFQUFFLEVBQUU7WUFDckQsTUFBTSxRQUFRLEdBQUcsaUJBQWlCLENBQUMsV0FBVyxDQUFDLFlBQVksQ0FBQyxDQUFDO1lBQzdELE1BQU0sS0FBSyxHQUFHLGNBQWMsQ0FBQyxDQUFDLENBQUMsY0FBYyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUM7WUFDdEQsTUFBTSxRQUFRLEdBQUcsaUJBQWlCLENBQUMsa0JBQWtCLENBQUMsUUFBUSxFQUFFLEtBQUssQ0FBQyxDQUFDO1lBQ3ZFLE9BQU87Z0JBQ0wsTUFBTSxFQUFFLE9BQU87Z0JBQ2YsUUFBUTtnQkFDUixRQUFRLEVBQUUsZUFBZTthQUMxQixDQUFDO1FBQ0osQ0FBQyxDQUFDLENBQUM7UUFFSCxHQUFHLENBQUMsS0FBSyxDQUNQLEVBQUUsS0FBSyxFQUFFLEVBQ1QsMEJBQTBCLGFBQWEsQ0FBQyxNQUFNLHlCQUF5QixPQUFPLFNBQVMsY0FBYyxhQUFkLGNBQWMsdUJBQWQsY0FBYyxDQUFFLE1BQU0sMkJBQTJCLENBQ3pJLENBQUM7UUFFRixNQUFNLEVBQUUsV0FBVyxFQUFFLFVBQVUsRUFBRSxnQkFBZ0IsRUFBRSxHQUNqRCxNQUFNLElBQUksQ0FBQyxpQkFBaUIsQ0FBQyxVQUFVLENBQUMsU0FBUyxDQUFDLEtBQUssRUFBRTtZQUN2RCxRQUFRLEVBQUUsbUJBQW1CO1NBQzlCLENBQUMsQ0FBQztRQUVMLE1BQU0sT0FBTyxHQUFzQixFQUFFLENBQUM7UUFFdEMsTUFBTSxpQkFBaUIsR0FBYSxFQUFFLENBQUM7UUFDdkMsS0FBSyxJQUFJLENBQUMsR0FBRyxDQUFDLEVBQUUsQ0FBQyxHQUFHLGdCQUFnQixDQUFDLE1BQU0sRUFBRSxDQUFDLEVBQUUsRUFBRTtZQUNoRCxNQUFNLFFBQVEsR0FBRyxpQkFBaUIsQ0FBQyxXQUFXLENBQUMsYUFBYSxDQUFDLENBQUMsQ0FBRSxDQUFDLENBQUM7WUFDbEUsTUFBTSxFQUFFLE9BQU8sRUFBRSxVQUFVLEVBQUUsT0FBTyxFQUFFLEdBQUcsZ0JBQWdCLENBQUMsQ0FBQyxDQUFFLENBQUM7WUFFOUQsNERBQTREO1lBQzVELElBQUksQ0FBQyxPQUFPLElBQUksVUFBVSxDQUFDLE1BQU0sSUFBSSxDQUFDLEVBQUU7Z0JBQ3RDLEdBQUcsQ0FBQyxLQUFLLENBQ1AsRUFBRSxNQUFNLEVBQUUsZ0JBQWdCLENBQUMsQ0FBQyxDQUFDLEVBQUUsRUFDL0IsMEJBQTBCLGFBQWEsQ0FBQyxDQUFDLENBQUMsU0FDeEMsY0FBYyxDQUFDLENBQUMsQ0FBQyxjQUFjLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLEdBQ3ZDLFNBQVMsQ0FDVixDQUFDO2dCQUNGLE9BQU8sQ0FBQyxJQUFJLENBQUM7b0JBQ1gsT0FBTyxFQUFFLEtBQUs7b0JBQ2QsVUFBVTtpQkFDWCxDQUFDLENBQUM7Z0JBQ0gsU0FBUzthQUNWO1lBRUQsaUJBQWlCLENBQUMsSUFBSSxDQUFDLE9BQU8sQ0FBQyxRQUFRLEVBQUUsQ0FBQyxDQUFDO1lBRTNDLE9BQU8sQ0FBQyxJQUFJLENBQUM7Z0JBQ1gsT0FBTyxFQUFFLElBQUk7Z0JBQ2IsTUFBTSxFQUFFLGlCQUFpQixDQUFDLG9CQUFvQixDQUM1QyxRQUFRLEVBQ1IsVUFBVSxDQUNXO2FBQ3hCLENBQUMsQ0FBQztTQUNKO1FBRUQsR0FBRyxDQUFDLEtBQUssQ0FDUCxFQUFFLE9BQU8sRUFBRSxhQUFhLEVBQUUsT0FBTyxFQUFFLEVBQ25DLDZCQUNFLGFBQWEsQ0FBQyxNQUNoQix5QkFBeUIsT0FBTyxTQUM5QixjQUFjLENBQUMsQ0FBQyxDQUFDLGNBQWMsQ0FBQyxNQUFNLENBQUMsQ0FBQyxDQUFDLElBQzNDLGtEQUFrRCxXQUFXLEVBQUUsQ0FDaEUsQ0FBQztRQUNGLE9BQU87WUFDTCxXQUFXO1lBQ1gsT0FBTztZQUNQLDJCQUEyQixFQUFFLEtBQUssQ0FBQyxVQUFVLENBQUMsaUJBQWlCLEVBQUUsRUFBRSxDQUFDO1NBQ3JFLENBQUM7SUFDSixDQUFDO0NBQ0YifQ==