import { JsonRpcProvider } from '@ethersproject/providers';
import { ChainId } from '@uniswap/sdk-core';
import { GasModelProviderConfig, SwapOptions, SwapRoute } from '../routers';
import { EthEstimateGasSimulator } from './eth-estimate-gas-provider';
import { IPortionProvider } from './portion-provider';
import { SimulationResult, Simulator } from './simulation-provider';
import { IV2PoolProvider } from './v2/pool-provider';
import { ArbitrumGasData, OptimismGasData } from './v3/gas-data-provider';
import { IV3PoolProvider } from './v3/pool-provider';
export type TenderlyResponseUniversalRouter = {
    config: {
        url: string;
        method: string;
        data: string;
    };
    simulation_results: [SimulationResult, SimulationResult, SimulationResult];
};
export type TenderlyResponseSwapRouter02 = {
    config: {
        url: string;
        method: string;
        data: string;
    };
    simulation_results: [SimulationResult, SimulationResult];
};
export declare class FallbackTenderlySimulator extends Simulator {
    private tenderlySimulator;
    private ethEstimateGasSimulator;
    constructor(chainId: ChainId, provider: JsonRpcProvider, portionProvider: IPortionProvider, tenderlySimulator: TenderlySimulator, ethEstimateGasSimulator: EthEstimateGasSimulator);
    protected simulateTransaction(fromAddress: string, swapOptions: SwapOptions, swapRoute: SwapRoute, l2GasData?: ArbitrumGasData | OptimismGasData, providerConfig?: GasModelProviderConfig): Promise<SwapRoute>;
}
export declare class TenderlySimulator extends Simulator {
    private tenderlyBaseUrl;
    private tenderlyUser;
    private tenderlyProject;
    private tenderlyAccessKey;
    private v2PoolProvider;
    private v3PoolProvider;
    private overrideEstimateMultiplier;
    private tenderlyRequestTimeout?;
    private tenderlyServiceInstance;
    constructor(chainId: ChainId, tenderlyBaseUrl: string, tenderlyUser: string, tenderlyProject: string, tenderlyAccessKey: string, v2PoolProvider: IV2PoolProvider, v3PoolProvider: IV3PoolProvider, provider: JsonRpcProvider, portionProvider: IPortionProvider, overrideEstimateMultiplier?: {
        [chainId in ChainId]?: number;
    }, tenderlyRequestTimeout?: number);
    simulateTransaction(fromAddress: string, swapOptions: SwapOptions, swapRoute: SwapRoute, l2GasData?: ArbitrumGasData | OptimismGasData, providerConfig?: GasModelProviderConfig): Promise<SwapRoute>;
    private logTenderlyErrorResponse;
}
