import { JsonRpcProvider } from '@ethersproject/providers';
import { ChainId, TradeType } from '@uniswap/sdk-core';
import { GasModelProviderConfig, SwapOptions, SwapRoute } from '../routers';
import { CurrencyAmount } from '../util';
import { IPortionProvider } from './portion-provider';
import { ArbitrumGasData, OptimismGasData } from './v3/gas-data-provider';
export type SimulationResult = {
    transaction: {
        hash: string;
        gas_used: number;
        gas: number;
        error_message: string;
    };
    simulation: {
        state_overrides: Record<string, unknown>;
    };
};
export declare enum SimulationStatus {
    NotSupported = 0,
    Failed = 1,
    Succeeded = 2,
    InsufficientBalance = 3,
    NotApproved = 4
}
/**
 * Provider for dry running transactions.
 *
 * @export
 * @class Simulator
 */
export declare abstract class Simulator {
    protected chainId: ChainId;
    protected provider: JsonRpcProvider;
    protected portionProvider: IPortionProvider;
    /**
     * Returns a new SwapRoute with simulated gas estimates
     * @returns SwapRoute
     */
    constructor(provider: JsonRpcProvider, portionProvider: IPortionProvider, chainId: ChainId);
    simulate(fromAddress: string, swapOptions: SwapOptions, swapRoute: SwapRoute, amount: CurrencyAmount, quote: CurrencyAmount, l2GasData?: OptimismGasData | ArbitrumGasData, providerConfig?: GasModelProviderConfig): Promise<SwapRoute>;
    protected abstract simulateTransaction(fromAddress: string, swapOptions: SwapOptions, swapRoute: SwapRoute, l2GasData?: OptimismGasData | ArbitrumGasData, providerConfig?: GasModelProviderConfig): Promise<SwapRoute>;
    protected userHasSufficientBalance(fromAddress: string, tradeType: TradeType, amount: CurrencyAmount, quote: CurrencyAmount): Promise<boolean>;
    protected checkTokenApproved(fromAddress: string, inputAmount: CurrencyAmount, swapOptions: SwapOptions, provider: JsonRpcProvider): Promise<boolean>;
}
