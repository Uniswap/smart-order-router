import { BigNumber } from 'ethers';

export type GasPrice = {
  gasPriceWei: BigNumber;
  blockNumber: number;
};

/**
 * Provider for getting gas prices.
 */
export abstract class IGasPriceProvider {
  public abstract getGasPrice(): Promise<GasPrice>;
}
