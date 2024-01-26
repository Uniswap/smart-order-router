import { BigNumber } from '@ethersproject/bignumber';
import { ChainId } from '@uniswap/sdk-core';
import { SwapType, } from '../routers';
import { BEACON_CHAIN_DEPOSIT_ADDRESS, log } from '../util';
import { calculateGasUsed, initSwapRouteFromExisting, } from '../util/gas-factory-helpers';
import { SimulationStatus, Simulator } from './simulation-provider';
// We multiply eth estimate gas by this to add a buffer for gas limits
const DEFAULT_ESTIMATE_MULTIPLIER = 1.2;
export class EthEstimateGasSimulator extends Simulator {
    constructor(chainId, provider, v2PoolProvider, v3PoolProvider, portionProvider, overrideEstimateMultiplier) {
        super(provider, portionProvider, chainId);
        this.v2PoolProvider = v2PoolProvider;
        this.v3PoolProvider = v3PoolProvider;
        this.overrideEstimateMultiplier = overrideEstimateMultiplier !== null && overrideEstimateMultiplier !== void 0 ? overrideEstimateMultiplier : {};
    }
    async ethEstimateGas(fromAddress, swapOptions, route, l2GasData, providerConfig) {
        const currencyIn = route.trade.inputAmount.currency;
        let estimatedGasUsed;
        if (swapOptions.type == SwapType.UNIVERSAL_ROUTER) {
            if (currencyIn.isNative && this.chainId == ChainId.MAINNET) {
                // w/o this gas estimate differs by a lot depending on if user holds enough native balance
                // always estimate gas as if user holds enough balance
                // so that gas estimate is consistent for UniswapX
                fromAddress = BEACON_CHAIN_DEPOSIT_ADDRESS;
            }
            log.info({ addr: fromAddress, methodParameters: route.methodParameters }, 'Simulating using eth_estimateGas on Universal Router');
            try {
                estimatedGasUsed = await this.provider.estimateGas({
                    data: route.methodParameters.calldata,
                    to: route.methodParameters.to,
                    from: fromAddress,
                    value: BigNumber.from(currencyIn.isNative ? route.methodParameters.value : '0'),
                });
            }
            catch (e) {
                log.error({ e }, 'Error estimating gas');
                return {
                    ...route,
                    simulationStatus: SimulationStatus.Failed,
                };
            }
        }
        else if (swapOptions.type == SwapType.SWAP_ROUTER_02) {
            try {
                estimatedGasUsed = await this.provider.estimateGas({
                    data: route.methodParameters.calldata,
                    to: route.methodParameters.to,
                    from: fromAddress,
                    value: BigNumber.from(currencyIn.isNative ? route.methodParameters.value : '0'),
                });
            }
            catch (e) {
                log.error({ e }, 'Error estimating gas');
                return {
                    ...route,
                    simulationStatus: SimulationStatus.Failed,
                };
            }
        }
        else {
            throw new Error(`Unsupported swap type ${swapOptions}`);
        }
        estimatedGasUsed = this.adjustGasEstimate(estimatedGasUsed);
        log.info({
            methodParameters: route.methodParameters,
            estimatedGasUsed: estimatedGasUsed.toString(),
        }, 'Simulated using eth_estimateGas on SwapRouter02');
        const { estimatedGasUsedUSD, estimatedGasUsedQuoteToken, estimatedGasUsedGasToken, quoteGasAdjusted, } = await calculateGasUsed(route.quote.currency.chainId, route, estimatedGasUsed, this.v2PoolProvider, this.v3PoolProvider, l2GasData, providerConfig);
        return {
            ...initSwapRouteFromExisting(route, this.v2PoolProvider, this.v3PoolProvider, this.portionProvider, quoteGasAdjusted, estimatedGasUsed, estimatedGasUsedQuoteToken, estimatedGasUsedUSD, swapOptions, estimatedGasUsedGasToken),
            simulationStatus: SimulationStatus.Succeeded,
        };
    }
    adjustGasEstimate(gasLimit) {
        var _a;
        const estimateMultiplier = (_a = this.overrideEstimateMultiplier[this.chainId]) !== null && _a !== void 0 ? _a : DEFAULT_ESTIMATE_MULTIPLIER;
        const adjustedGasEstimate = BigNumber.from(gasLimit)
            .mul(estimateMultiplier * 100)
            .div(100);
        return adjustedGasEstimate;
    }
    async simulateTransaction(fromAddress, swapOptions, swapRoute, l2GasData, _providerConfig) {
        const inputAmount = swapRoute.trade.inputAmount;
        if (inputAmount.currency.isNative ||
            (await this.checkTokenApproved(fromAddress, inputAmount, swapOptions, this.provider))) {
            return await this.ethEstimateGas(fromAddress, swapOptions, swapRoute, l2GasData);
        }
        else {
            log.info('Token not approved, skipping simulation');
            return {
                ...swapRoute,
                simulationStatus: SimulationStatus.NotApproved,
            };
        }
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZXRoLWVzdGltYXRlLWdhcy1wcm92aWRlci5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbIi4uLy4uLy4uL3NyYy9wcm92aWRlcnMvZXRoLWVzdGltYXRlLWdhcy1wcm92aWRlci50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQSxPQUFPLEVBQUUsU0FBUyxFQUFFLE1BQU0sMEJBQTBCLENBQUM7QUFFckQsT0FBTyxFQUFFLE9BQU8sRUFBRSxNQUFNLG1CQUFtQixDQUFDO0FBRTVDLE9BQU8sRUFJTCxRQUFRLEdBQ1QsTUFBTSxZQUFZLENBQUM7QUFDcEIsT0FBTyxFQUFFLDRCQUE0QixFQUFFLEdBQUcsRUFBRSxNQUFNLFNBQVMsQ0FBQztBQUM1RCxPQUFPLEVBQ0wsZ0JBQWdCLEVBQ2hCLHlCQUF5QixHQUMxQixNQUFNLDZCQUE2QixDQUFDO0FBSXJDLE9BQU8sRUFBRSxnQkFBZ0IsRUFBRSxTQUFTLEVBQUUsTUFBTSx1QkFBdUIsQ0FBQztBQUtwRSxzRUFBc0U7QUFDdEUsTUFBTSwyQkFBMkIsR0FBRyxHQUFHLENBQUM7QUFFeEMsTUFBTSxPQUFPLHVCQUF3QixTQUFRLFNBQVM7SUFLcEQsWUFDRSxPQUFnQixFQUNoQixRQUF5QixFQUN6QixjQUErQixFQUMvQixjQUErQixFQUMvQixlQUFpQyxFQUNqQywwQkFBOEQ7UUFFOUQsS0FBSyxDQUFDLFFBQVEsRUFBRSxlQUFlLEVBQUUsT0FBTyxDQUFDLENBQUM7UUFDMUMsSUFBSSxDQUFDLGNBQWMsR0FBRyxjQUFjLENBQUM7UUFDckMsSUFBSSxDQUFDLGNBQWMsR0FBRyxjQUFjLENBQUM7UUFDckMsSUFBSSxDQUFDLDBCQUEwQixHQUFHLDBCQUEwQixhQUExQiwwQkFBMEIsY0FBMUIsMEJBQTBCLEdBQUksRUFBRSxDQUFDO0lBQ3JFLENBQUM7SUFFRCxLQUFLLENBQUMsY0FBYyxDQUNsQixXQUFtQixFQUNuQixXQUF3QixFQUN4QixLQUFnQixFQUNoQixTQUE2QyxFQUM3QyxjQUErQjtRQUUv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