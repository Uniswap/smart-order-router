import { ChainId } from '@uniswap/sdk-core';
import { EIP1559GasPriceProvider } from './eip-1559-gas-price-provider';
import { GasPrice, IGasPriceProvider } from './gas-price-provider';
import { LegacyGasPriceProvider } from './legacy-gas-price-provider';
/**
 * Gets gas prices on chain. If the chain supports EIP-1559 and has the feeHistory API,
 * uses the EIP1559 provider. Otherwise it will use a legacy provider that uses eth_gasPrice
 *
 * @export
 * @class OnChainGasPriceProvider
 */
export declare class OnChainGasPriceProvider extends IGasPriceProvider {
    protected chainId: ChainId;
    protected eip1559GasPriceProvider: EIP1559GasPriceProvider;
    protected legacyGasPriceProvider: LegacyGasPriceProvider;
    protected eipChains: ChainId[];
    constructor(chainId: ChainId, eip1559GasPriceProvider: EIP1559GasPriceProvider, legacyGasPriceProvider: LegacyGasPriceProvider, eipChains?: ChainId[]);
    getGasPrice(latestBlockNumber: number, requestBlockNumber?: number): Promise<GasPrice>;
}
