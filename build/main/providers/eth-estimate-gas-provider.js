"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.EthEstimateGasSimulator = void 0;
const bignumber_1 = require("@ethersproject/bignumber");
const sdk_core_1 = require("@uniswap/sdk-core");
const routers_1 = require("../routers");
const util_1 = require("../util");
const gas_factory_helpers_1 = require("../util/gas-factory-helpers");
const simulation_provider_1 = require("./simulation-provider");
// We multiply eth estimate gas by this to add a buffer for gas limits
const DEFAULT_ESTIMATE_MULTIPLIER = 1.2;
class EthEstimateGasSimulator extends simulation_provider_1.Simulator {
    constructor(chainId, provider, v2PoolProvider, v3PoolProvider, portionProvider, overrideEstimateMultiplier) {
        super(provider, portionProvider, chainId);
        this.v2PoolProvider = v2PoolProvider;
        this.v3PoolProvider = v3PoolProvider;
        this.overrideEstimateMultiplier = overrideEstimateMultiplier !== null && overrideEstimateMultiplier !== void 0 ? overrideEstimateMultiplier : {};
    }
    async ethEstimateGas(fromAddress, swapOptions, route, l2GasData, providerConfig) {
        const currencyIn = route.trade.inputAmount.currency;
        let estimatedGasUsed;
        if (swapOptions.type == routers_1.SwapType.UNIVERSAL_ROUTER) {
            if (currencyIn.isNative && this.chainId == sdk_core_1.ChainId.MAINNET) {
                // w/o this gas estimate differs by a lot depending on if user holds enough native balance
                // always estimate gas as if user holds enough balance
                // so that gas estimate is consistent for UniswapX
                fromAddress = util_1.BEACON_CHAIN_DEPOSIT_ADDRESS;
            }
            util_1.log.info({ addr: fromAddress, methodParameters: route.methodParameters }, 'Simulating using eth_estimateGas on Universal Router');
            try {
                estimatedGasUsed = await this.provider.estimateGas({
                    data: route.methodParameters.calldata,
                    to: route.methodParameters.to,
                    from: fromAddress,
                    value: bignumber_1.BigNumber.from(currencyIn.isNative ? route.methodParameters.value : '0'),
                });
            }
            catch (e) {
                util_1.log.error({ e }, 'Error estimating gas');
                return Object.assign(Object.assign({}, route), { simulationStatus: simulation_provider_1.SimulationStatus.Failed });
            }
        }
        else if (swapOptions.type == routers_1.SwapType.SWAP_ROUTER_02) {
            try {
                estimatedGasUsed = await this.provider.estimateGas({
                    data: route.methodParameters.calldata,
                    to: route.methodParameters.to,
                    from: fromAddress,
                    value: bignumber_1.BigNumber.from(currencyIn.isNative ? route.methodParameters.value : '0'),
                });
            }
            catch (e) {
                util_1.log.error({ e }, 'Error estimating gas');
                return Object.assign(Object.assign({}, route), { simulationStatus: simulation_provider_1.SimulationStatus.Failed });
            }
        }
        else {
            throw new Error(`Unsupported swap type ${swapOptions}`);
        }
        estimatedGasUsed = this.adjustGasEstimate(estimatedGasUsed);
        util_1.log.info({
            methodParameters: route.methodParameters,
            estimatedGasUsed: estimatedGasUsed.toString(),
        }, 'Simulated using eth_estimateGas on SwapRouter02');
        const { estimatedGasUsedUSD, estimatedGasUsedQuoteToken, estimatedGasUsedGasToken, quoteGasAdjusted, } = await (0, gas_factory_helpers_1.calculateGasUsed)(route.quote.currency.chainId, route, estimatedGasUsed, this.v2PoolProvider, this.v3PoolProvider, l2GasData, providerConfig);
        return Object.assign(Object.assign({}, (0, gas_factory_helpers_1.initSwapRouteFromExisting)(route, this.v2PoolProvider, this.v3PoolProvider, this.portionProvider, quoteGasAdjusted, estimatedGasUsed, estimatedGasUsedQuoteToken, estimatedGasUsedUSD, swapOptions, estimatedGasUsedGasToken)), { simulationStatus: simulation_provider_1.SimulationStatus.Succeeded });
    }
    adjustGasEstimate(gasLimit) {
        var _a;
        const estimateMultiplier = (_a = this.overrideEstimateMultiplier[this.chainId]) !== null && _a !== void 0 ? _a : DEFAULT_ESTIMATE_MULTIPLIER;
        const adjustedGasEstimate = bignumber_1.BigNumber.from(gasLimit)
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
            util_1.log.info('Token not approved, skipping simulation');
            return Object.assign(Object.assign({}, swapRoute), { simulationStatus: simulation_provider_1.SimulationStatus.NotApproved });
        }
    }
}
exports.EthEstimateGasSimulator = EthEstimateGasSimulator;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZXRoLWVzdGltYXRlLWdhcy1wcm92aWRlci5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbIi4uLy4uLy4uL3NyYy9wcm92aWRlcnMvZXRoLWVzdGltYXRlLWdhcy1wcm92aWRlci50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiOzs7QUFBQSx3REFBcUQ7QUFFckQsZ0RBQTRDO0FBRTVDLHdDQUtvQjtBQUNwQixrQ0FBNEQ7QUFDNUQscUVBR3FDO0FBSXJDLCtEQUFvRTtBQUtwRSxzRUFBc0U7QUFDdEUsTUFBTSwyQkFBMkIsR0FBRyxHQUFHLENBQUM7QUFFeEMsTUFBYSx1QkFBd0IsU0FBUSwrQkFBUztJQUtwRCxZQUNFLE9BQWdCLEVBQ2hCLFFBQXlCLEVBQ3pCLGNBQStCLEVBQy9CLGNBQStCLEVBQy9CLGVBQWlDLEVBQ2pDLDBCQUE4RDtRQUU5RCxLQUFLLENBQUMsUUFBUSxFQUFFLGVBQWUsRUFBRSxPQUFPLENBQUMsQ0FBQztRQUMxQyxJQUFJLENBQUMsY0FBYyxHQUFHLGNBQWMsQ0FBQztRQUNyQyxJQUFJLENBQUMsY0FBYyxHQUFHLGNBQWMsQ0FBQztRQUNyQyxJQUFJLENBQUMsMEJBQTBCLEdBQUcsMEJBQTBCLGFBQTFCLDBCQUEwQixjQUExQiwwQkFBMEIsR0FBSSxFQUFFLENBQUM7SUFDckUsQ0FBQztJQUVELEtBQUssQ0FBQyxjQUFjLENBQ2xCLFdBQW1CLEVBQ25CLFdBQXdCLEVBQ3hCLEtBQWdCLEVBQ2hCLFNBQTZDLEVBQzdDLGNBQStCO1FBRS9CLE1BQU0sVUFBVSxHQUFHLEtBQUssQ0FBQyxLQUFLLENBQUMsV0FBVyxDQUFDLFFBQVEsQ0FBQztRQUNwRCxJQUFJLGdCQUEyQixDQUFDO1FBQ2hDLElBQUksV0FBVyxDQUFDLElBQUksSUFBSSxrQkFBUSxDQUFDLGdCQUFnQixFQUFFO1lBQ2pELElBQUksVUFBVSxDQUFDLFFBQVEsSUFBSSxJQUFJLENBQUMsT0FBTyxJQUFJLGtCQUFPLENBQUMsT0FBTyxFQUFFO2dCQUMxRCwwRkFB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