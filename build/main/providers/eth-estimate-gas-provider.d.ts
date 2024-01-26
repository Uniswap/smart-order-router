import { JsonRpcProvider } from '@ethersproject/providers';
import { ChainId } from '@uniswap/sdk-core';
import { GasModelProviderConfig, SwapOptions, SwapRoute } from '../routers';
import { IPortionProvider } from './portion-provider';
import { ProviderConfig } from './provider';
import { Simulator } from './simulation-provider';
import { IV2PoolProvider } from './v2/pool-provider';
import { ArbitrumGasData, OptimismGasData } from './v3/gas-data-provider';
import { IV3PoolProvider } from './v3/pool-provider';
export declare class EthEstimateGasSimulator extends Simulator {
    v2PoolProvider: IV2PoolProvider;
    v3PoolProvider: IV3PoolProvider;
    private overrideEstimateMultiplier;
    constructor(chainId: ChainId, provider: JsonRpcProvider, v2PoolProvider: IV2PoolProvider, v3PoolProvider: IV3PoolProvider, portionProvider: IPortionProvider, overrideEstimateMultiplier?: {
        [chainId in ChainId]?: number;
    });
    ethEstimateGas(fromAddress: string, swapOptions: SwapOptions, route: SwapRoute, l2GasData?: ArbitrumGasData | OptimismGasData, providerConfig?: ProviderConfig): Promise<SwapRoute>;
    private adjustGasEstimate;
    protected simulateTransaction(fromAddress: string, swapOptions: SwapOptions, swapRoute: SwapRoute, l2GasData?: OptimismGasData | ArbitrumGasData | undefined, _providerConfig?: GasModelProviderConfig | undefined): Promise<SwapRoute>;
}
