import { BigNumber } from '@ethersproject/bignumber';
import { BaseProvider } from '@ethersproject/providers';
import { ChainId } from '@uniswap/sdk-core';
import { IMulticallProvider } from '../multicall-provider';
import { ProviderConfig } from '../provider';
/**
 * Provider for getting gas constants on L2s.
 *
 * @export
 * @interface IL2GasDataProvider
 */
export interface IL2GasDataProvider<T> {
    /**
     * Gets the data constants needed to calculate the l1 security fee on L2s like arbitrum and optimism.
     * @returns An object that includes the data necessary for the off chain estimations.
     */
    getGasData(providerConfig?: ProviderConfig): Promise<T>;
}
export type OptimismGasData = {
    l1BaseFee: BigNumber;
    scalar: BigNumber;
    decimals: BigNumber;
    overhead: BigNumber;
};
export declare class OptimismGasDataProvider implements IL2GasDataProvider<OptimismGasData> {
    protected chainId: ChainId;
    protected multicall2Provider: IMulticallProvider;
    protected gasOracleAddress: string;
    constructor(chainId: ChainId, multicall2Provider: IMulticallProvider, gasPriceAddress?: string);
    /**
     * Gets the data constants needed to calculate the l1 security fee on Optimism.
     * @returns An OptimismGasData object that includes the l1BaseFee,
     * scalar, decimals, and overhead values.
     */
    getGasData(providerConfig?: ProviderConfig): Promise<OptimismGasData>;
}
/**
 * perL2TxFee is the base fee in wei for an l2 transaction.
 * perL2CalldataFee is the fee in wei per byte of calldata the swap uses. Multiply by the total bytes of the calldata.
 * perArbGasTotal is the fee in wei per unit of arbgas. Multiply this by the estimate we calculate based on ticks/hops in the gasModel.
 */
export type ArbitrumGasData = {
    perL2TxFee: BigNumber;
    perL1CalldataFee: BigNumber;
    perArbGasTotal: BigNumber;
};
export declare class ArbitrumGasDataProvider implements IL2GasDataProvider<ArbitrumGasData> {
    protected chainId: ChainId;
    protected provider: BaseProvider;
    protected gasFeesAddress: string;
    protected blockNumberOverride: number | Promise<number> | undefined;
    constructor(chainId: ChainId, provider: BaseProvider, gasDataAddress?: string);
    getGasData(providerConfig?: ProviderConfig): Promise<{
        perL2TxFee: BigNumber;
        perL1CalldataFee: BigNumber;
        perArbGasTotal: BigNumber;
    }>;
}
