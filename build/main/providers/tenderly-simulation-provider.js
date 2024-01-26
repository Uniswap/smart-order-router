"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.TenderlySimulator = exports.FallbackTenderlySimulator = void 0;
const http_1 = __importDefault(require("http"));
const https_1 = __importDefault(require("https"));
const constants_1 = require("@ethersproject/constants");
const sdk_core_1 = require("@uniswap/sdk-core");
const universal_router_sdk_1 = require("@uniswap/universal-router-sdk");
const axios_1 = __importDefault(require("axios"));
const ethers_1 = require("ethers/lib/ethers");
const routers_1 = require("../routers");
const Erc20__factory_1 = require("../types/other/factories/Erc20__factory");
const Permit2__factory_1 = require("../types/other/factories/Permit2__factory");
const util_1 = require("../util");
const callData_1 = require("../util/callData");
const gas_factory_helpers_1 = require("../util/gas-factory-helpers");
const simulation_provider_1 = require("./simulation-provider");
var TenderlySimulationType;
(function (TenderlySimulationType) {
    TenderlySimulationType["QUICK"] = "quick";
    TenderlySimulationType["FULL"] = "full";
    TenderlySimulationType["ABI"] = "abi";
})(TenderlySimulationType || (TenderlySimulationType = {}));
const TENDERLY_BATCH_SIMULATE_API = (tenderlyBaseUrl, tenderlyUser, tenderlyProject) => `${tenderlyBaseUrl}/api/v1/account/${tenderlyUser}/project/${tenderlyProject}/simulate-batch`;
// We multiply tenderly gas limit by this to overestimate gas limit
const DEFAULT_ESTIMATE_MULTIPLIER = 1.3;
class FallbackTenderlySimulator extends simulation_provider_1.Simulator {
    constructor(chainId, provider, portionProvider, tenderlySimulator, ethEstimateGasSimulator) {
        super(provider, portionProvider, chainId);
        this.tenderlySimulator = tenderlySimulator;
        this.ethEstimateGasSimulator = ethEstimateGasSimulator;
    }
    async simulateTransaction(fromAddress, swapOptions, swapRoute, l2GasData, providerConfig) {
        // Make call to eth estimate gas if possible
        // For erc20s, we must check if the token allowance is sufficient
        const inputAmount = swapRoute.trade.inputAmount;
        if ((inputAmount.currency.isNative && this.chainId == sdk_core_1.ChainId.MAINNET) ||
            (await this.checkTokenApproved(fromAddress, inputAmount, swapOptions, this.provider))) {
            util_1.log.info('Simulating with eth_estimateGas since token is native or approved.');
            try {
                const swapRouteWithGasEstimate = await this.ethEstimateGasSimulator.ethEstimateGas(fromAddress, swapOptions, swapRoute, l2GasData, providerConfig);
                return swapRouteWithGasEstimate;
            }
            catch (err) {
                util_1.log.info({ err: err }, 'Error simulating using eth_estimateGas');
                return Object.assign(Object.assign({}, swapRoute), { simulationStatus: simulation_provider_1.SimulationStatus.Failed });
            }
        }
        try {
            return await this.tenderlySimulator.simulateTransaction(fromAddress, swapOptions, swapRoute, l2GasData, providerConfig);
        }
        catch (err) {
            util_1.log.error({ err: err }, 'Failed to simulate via Tenderly');
            if (err instanceof Error && err.message.includes('timeout')) {
                routers_1.metric.putMetric('TenderlySimulationTimeouts', 1, routers_1.MetricLoggerUnit.Count);
            }
            return Object.assign(Object.assign({}, swapRoute), { simulationStatus: simulation_provider_1.SimulationStatus.Failed });
        }
    }
}
exports.FallbackTenderlySimulator = FallbackTenderlySimulator;
class TenderlySimulator extends simulation_provider_1.Simulator {
    constructor(chainId, tenderlyBaseUrl, tenderlyUser, tenderlyProject, tenderlyAccessKey, v2PoolProvider, v3PoolProvider, provider, portionProvider, overrideEstimateMultiplier, tenderlyRequestTimeout) {
        super(provider, portionProvider, chainId);
        this.tenderlyServiceInstance = axios_1.default.create({
            // keep connections alive,
            // maxSockets default is Infinity, so Infinity is read as 50 sockets
            httpAgent: new http_1.default.Agent({ keepAlive: true }),
            httpsAgent: new https_1.default.Agent({ keepAlive: true }),
        });
        this.tenderlyBaseUrl = tenderlyBaseUrl;
        this.tenderlyUser = tenderlyUser;
        this.tenderlyProject = tenderlyProject;
        this.tenderlyAccessKey = tenderlyAccessKey;
        this.v2PoolProvider = v2PoolProvider;
        this.v3PoolProvider = v3PoolProvider;
        this.overrideEstimateMultiplier = overrideEstimateMultiplier !== null && overrideEstimateMultiplier !== void 0 ? overrideEstimateMultiplier : {};
        this.tenderlyRequestTimeout = tenderlyRequestTimeout;
    }
    async simulateTransaction(fromAddress, swapOptions, swapRoute, l2GasData, providerConfig) {
        var _a;
        const currencyIn = swapRoute.trade.inputAmount.currency;
        const tokenIn = currencyIn.wrapped;
        const chainId = this.chainId;
        if ([sdk_core_1.ChainId.CELO, sdk_core_1.ChainId.CELO_ALFAJORES].includes(chainId)) {
            const msg = 'Celo not supported by Tenderly!';
            util_1.log.info(msg);
            return Object.assign(Object.assign({}, swapRoute), { simulationStatus: simulation_provider_1.SimulationStatus.NotSupported });
        }
        if (!swapRoute.methodParameters) {
            const msg = 'No calldata provided to simulate transaction';
            util_1.log.info(msg);
            throw new Error(msg);
        }
        const { calldata } = swapRoute.methodParameters;
        util_1.log.info({
            calldata: swapRoute.methodParameters.calldata,
            fromAddress: fromAddress,
            chainId: chainId,
            tokenInAddress: tokenIn.address,
            router: swapOptions.type,
        }, 'Simulating transaction on Tenderly');
        const blockNumber = await (providerConfig === null || providerConfig === void 0 ? void 0 : providerConfig.blockNumber);
        let estimatedGasUsed;
        const estimateMultiplier = (_a = this.overrideEstimateMultiplier[chainId]) !== null && _a !== void 0 ? _a : DEFAULT_ESTIMATE_MULTIPLIER;
        if (swapOptions.type == routers_1.SwapType.UNIVERSAL_ROUTER) {
            // simulating from beacon chain deposit address that should always hold **enough balance**
            if (currencyIn.isNative && this.chainId == sdk_core_1.ChainId.MAINNET) {
                fromAddress = util_1.BEACON_CHAIN_DEPOSIT_ADDRESS;
            }
            // Do initial onboarding approval of Permit2.
            const erc20Interface = Erc20__factory_1.Erc20__factory.createInterface();
            const approvePermit2Calldata = erc20Interface.encodeFunctionData('approve', [universal_router_sdk_1.PERMIT2_ADDRESS, constants_1.MaxUint256]);
            // We are unsure if the users calldata contains a permit or not. We just
            // max approve the Universal Router from Permit2 instead, which will cover both cases.
            const permit2Interface = Permit2__factory_1.Permit2__factory.createInterface();
            const approveUniversalRouterCallData = permit2Interface.encodeFunctionData('approve', [
                tokenIn.address,
                (0, universal_router_sdk_1.UNIVERSAL_ROUTER_ADDRESS)(this.chainId),
                util_1.MAX_UINT160,
                Math.floor(new Date().getTime() / 1000) + 10000000,
            ]);
            const approvePermit2 = {
                network_id: chainId,
                estimate_gas: true,
                input: approvePermit2Calldata,
                to: tokenIn.address,
                value: '0',
                from: fromAddress,
                simulation_type: TenderlySimulationType.QUICK,
                save_if_fails: providerConfig === null || providerConfig === void 0 ? void 0 : providerConfig.saveTenderlySimulationIfFailed,
            };
            const approveUniversalRouter = {
                network_id: chainId,
                estimate_gas: true,
                input: approveUniversalRouterCallData,
                to: universal_router_sdk_1.PERMIT2_ADDRESS,
                value: '0',
                from: fromAddress,
                simulation_type: TenderlySimulationType.QUICK,
                save_if_fails: providerConfig === null || providerConfig === void 0 ? void 0 : providerConfig.saveTenderlySimulationIfFailed,
            };
            const swap = {
                network_id: chainId,
                input: calldata,
                estimate_gas: true,
                to: (0, universal_router_sdk_1.UNIVERSAL_ROUTER_ADDRESS)(this.chainId),
                value: currencyIn.isNative ? swapRoute.methodParameters.value : '0',
                from: fromAddress,
                block_number: blockNumber,
                simulation_type: TenderlySimulationType.QUICK,
                save_if_fails: providerConfig === null || providerConfig === void 0 ? void 0 : providerConfig.saveTenderlySimulationIfFailed,
            };
            const body = {
                simulations: [approvePermit2, approveUniversalRouter, swap],
                estimate_gas: true,
            };
            const opts = {
                headers: {
                    'X-Access-Key': this.tenderlyAccessKey,
                },
                timeout: this.tenderlyRequestTimeout,
            };
            const url = TENDERLY_BATCH_SIMULATE_API(this.tenderlyBaseUrl, this.tenderlyUser, this.tenderlyProject);
            routers_1.metric.putMetric('TenderlySimulationUniversalRouterRequests', 1, routers_1.MetricLoggerUnit.Count);
            const before = Date.now();
            const { data: resp, status: httpStatus } = await this.tenderlyServiceInstance
                .post(url, body, opts)
                .finally(() => {
                routers_1.metric.putMetric('TenderlySimulationLatencies', Date.now() - before, routers_1.MetricLoggerUnit.Milliseconds);
            });
            const latencies = Date.now() - before;
            util_1.log.info(`Tenderly simulation universal router request body: ${JSON.stringify(body, null, 2)}, having latencies ${latencies} in milliseconds.`);
            routers_1.metric.putMetric('TenderlySimulationUniversalRouterLatencies', Date.now() - before, routers_1.MetricLoggerUnit.Milliseconds);
            routers_1.metric.putMetric(`TenderlySimulationUniversalRouterResponseStatus${httpStatus}`, 1, routers_1.MetricLoggerUnit.Count);
            // Validate tenderly response body
            if (!resp ||
                resp.simulation_results.length < 3 ||
                !resp.simulation_results[2].transaction ||
                resp.simulation_results[2].transaction.error_message) {
                this.logTenderlyErrorResponse(resp);
                return Object.assign(Object.assign({}, swapRoute), { simulationStatus: simulation_provider_1.SimulationStatus.Failed });
            }
            // Parse the gas used in the simulation response object, and then pad it so that we overestimate.
            estimatedGasUsed = ethers_1.BigNumber.from((resp.simulation_results[2].transaction.gas * estimateMultiplier).toFixed(0));
            util_1.log.info({
                body,
                approvePermit2GasUsed: resp.simulation_results[0].transaction.gas_used,
                approveUniversalRouterGasUsed: resp.simulation_results[1].transaction.gas_used,
                swapGasUsed: resp.simulation_results[2].transaction.gas_used,
                approvePermit2Gas: resp.simulation_results[0].transaction.gas,
                approveUniversalRouterGas: resp.simulation_results[1].transaction.gas,
                swapGas: resp.simulation_results[2].transaction.gas,
                swapWithMultiplier: estimatedGasUsed.toString(),
            }, 'Successfully Simulated Approvals + Swap via Tenderly for Universal Router. Gas used.');
            util_1.log.info({
                body,
                swapSimulation: resp.simulation_results[2].simulation,
                swapTransaction: resp.simulation_results[2].transaction,
            }, 'Successful Tenderly Swap Simulation for Universal Router');
        }
        else if (swapOptions.type == routers_1.SwapType.SWAP_ROUTER_02) {
            const approve = {
                network_id: chainId,
                input: callData_1.APPROVE_TOKEN_FOR_TRANSFER,
                estimate_gas: true,
                to: tokenIn.address,
                value: '0',
                from: fromAddress,
                simulation_type: TenderlySimulationType.QUICK,
            };
            const swap = {
                network_id: chainId,
                input: calldata,
                to: (0, util_1.SWAP_ROUTER_02_ADDRESSES)(chainId),
                estimate_gas: true,
                value: currencyIn.isNative ? swapRoute.methodParameters.value : '0',
                from: fromAddress,
                block_number: blockNumber,
                simulation_type: TenderlySimulationType.QUICK,
            };
            const body = { simulations: [approve, swap] };
            const opts = {
                headers: {
                    'X-Access-Key': this.tenderlyAccessKey,
                },
                timeout: this.tenderlyRequestTimeout,
            };
            const url = TENDERLY_BATCH_SIMULATE_API(this.tenderlyBaseUrl, this.tenderlyUser, this.tenderlyProject);
            routers_1.metric.putMetric('TenderlySimulationSwapRouter02Requests', 1, routers_1.MetricLoggerUnit.Count);
            const before = Date.now();
            const { data: resp, status: httpStatus } = await this.tenderlyServiceInstance.post(url, body, opts);
            routers_1.metric.putMetric(`TenderlySimulationSwapRouter02ResponseStatus${httpStatus}`, 1, routers_1.MetricLoggerUnit.Count);
            const latencies = Date.now() - before;
            util_1.log.info(`Tenderly simulation swap router02 request body: ${body}, having latencies ${latencies} in milliseconds.`);
            routers_1.metric.putMetric('TenderlySimulationSwapRouter02Latencies', latencies, routers_1.MetricLoggerUnit.Milliseconds);
            // Validate tenderly response body
            if (!resp ||
                resp.simulation_results.length < 2 ||
                !resp.simulation_results[1].transaction ||
                resp.simulation_results[1].transaction.error_message) {
                const msg = `Failed to Simulate Via Tenderly!: ${resp.simulation_results[1].transaction.error_message}`;
                util_1.log.info({ err: resp.simulation_results[1].transaction.error_message }, msg);
                return Object.assign(Object.assign({}, swapRoute), { simulationStatus: simulation_provider_1.SimulationStatus.Failed });
            }
            // Parse the gas used in the simulation response object, and then pad it so that we overestimate.
            estimatedGasUsed = ethers_1.BigNumber.from((resp.simulation_results[1].transaction.gas * estimateMultiplier).toFixed(0));
            util_1.log.info({
                body,
                approveGasUsed: resp.simulation_results[0].transaction.gas_used,
                swapGasUsed: resp.simulation_results[1].transaction.gas_used,
                approveGas: resp.simulation_results[0].transaction.gas,
                swapGas: resp.simulation_results[1].transaction.gas,
                swapWithMultiplier: estimatedGasUsed.toString(),
            }, 'Successfully Simulated Approval + Swap via Tenderly for SwapRouter02. Gas used.');
            util_1.log.info({
                body,
                swapTransaction: resp.simulation_results[1].transaction,
                swapSimulation: resp.simulation_results[1].simulation,
            }, 'Successful Tenderly Swap Simulation for SwapRouter02');
        }
        else {
            throw new Error(`Unsupported swap type: ${swapOptions}`);
        }
        const { estimatedGasUsedUSD, estimatedGasUsedQuoteToken, estimatedGasUsedGasToken, quoteGasAdjusted, } = await (0, gas_factory_helpers_1.calculateGasUsed)(chainId, swapRoute, estimatedGasUsed, this.v2PoolProvider, this.v3PoolProvider, l2GasData, providerConfig);
        return Object.assign(Object.assign({}, (0, gas_factory_helpers_1.initSwapRouteFromExisting)(swapRoute, this.v2PoolProvider, this.v3PoolProvider, this.portionProvider, quoteGasAdjusted, estimatedGasUsed, estimatedGasUsedQuoteToken, estimatedGasUsedUSD, swapOptions, estimatedGasUsedGasToken)), { simulationStatus: simulation_provider_1.SimulationStatus.Succeeded });
    }
    logTenderlyErrorResponse(resp) {
        util_1.log.info({
            resp,
        }, 'Failed to Simulate on Tenderly');
        util_1.log.info({
            err: resp.simulation_results.length >= 1
                ? resp.simulation_results[0].transaction
                : {},
        }, 'Failed to Simulate on Tenderly #1 Transaction');
        util_1.log.info({
            err: resp.simulation_results.length >= 1
                ? resp.simulation_results[0].simulation
                : {},
        }, 'Failed to Simulate on Tenderly #1 Simulation');
        util_1.log.info({
            err: resp.simulation_results.length >= 2
                ? resp.simulation_results[1].transaction
                : {},
        }, 'Failed to Simulate on Tenderly #2 Transaction');
        util_1.log.info({
            err: resp.simulation_results.length >= 2
                ? resp.simulation_results[1].simulation
                : {},
        }, 'Failed to Simulate on Tenderly #2 Simulation');
        util_1.log.info({
            err: resp.simulation_results.length >= 3
                ? resp.simulation_results[2].transaction
                : {},
        }, 'Failed to Simulate on Tenderly #3 Transaction');
        util_1.log.info({
            err: resp.simulation_results.length >= 3
                ? resp.simulation_results[2].simulation
                : {},
        }, 'Failed to Simulate on Tenderly #3 Simulation');
    }
}
exports.TenderlySimulator = TenderlySimulator;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidGVuZGVybHktc2ltdWxhdGlvbi1wcm92aWRlci5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbIi4uLy4uLy4uL3NyYy9wcm92aWRlcnMvdGVuZGVybHktc2ltdWxhdGlvbi1wcm92aWRlci50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiOzs7Ozs7QUFBQSxnREFBd0I7QUFDeEIsa0RBQTBCO0FBRTFCLHdEQUFzRDtBQUV0RCxnREFBNEM7QUFDNUMsd0VBR3VDO0FBQ3ZDLGtEQUFrRDtBQUNsRCw4Q0FBOEM7QUFFOUMsd0NBT29CO0FBQ3BCLDRFQUF5RTtBQUN6RSxnRkFBNkU7QUFDN0Usa0NBS2lCO0FBQ2pCLCtDQUE4RDtBQUM5RCxxRUFHcUM7QUFJckMsK0RBSStCO0FBdUIvQixJQUFLLHNCQUlKO0FBSkQsV0FBSyxzQkFBc0I7SUFDekIseUNBQWUsQ0FBQTtJQUNmLHVDQUFhLENBQUE7SUFDYixxQ0FBVyxDQUFBO0FBQ2IsQ0FBQyxFQUpJLHNCQUFzQixLQUF0QixzQkFBc0IsUUFJMUI7QUFtQkQsTUFBTSwyQkFBMkIsR0FBRyxDQUNsQyxlQUF1QixFQUN2QixZQUFvQixFQUNwQixlQUF1QixFQUN2QixFQUFFLENBQ0YsR0FBRyxlQUFlLG1CQUFtQixZQUFZLFlBQVksZUFBZSxpQkFBaUIsQ0FBQztBQUVoRyxtRUFBbUU7QUFDbkUsTUFBTSwyQkFBMkIsR0FBRyxHQUFHLENBQUM7QUFFeEMsTUFBYSx5QkFBMEIsU0FBUSwrQkFBUztJQUd0RCxZQUNFLE9BQWdCLEVBQ2hCLFFBQXlCLEVBQ3pCLGVBQWlDLEVBQ2pDLGlCQUFvQyxFQUNwQyx1QkFBZ0Q7UUFFaEQsS0FBSyxDQUFDLFFBQVEsRUFBRSxlQUFlLEVBQUUsT0FBTyxDQUFDLENBQUM7UUFDMUMsSUFBSSxDQUFDLGlCQUFpQixHQUFHLGlCQUFpQixDQUFDO1FBQzNDLElBQUksQ0FBQyx1QkFBdUIsR0FBRyx1QkFBdUIsQ0FBQztJQUN6RCxDQUFDO0lBRVMsS0FBSyxDQUFDLG1CQUFtQixD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