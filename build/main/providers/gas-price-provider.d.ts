import { BigNumber } from '@ethersproject/bignumber';
export type GasPrice = {
    gasPriceWei: BigNumber;
};
/**
 * Provider for getting gas prices.
 */
export declare abstract class IGasPriceProvider {
    abstract getGasPrice(latestBlockNumber: number, requestBlockNumber?: number): Promise<GasPrice>;
}
