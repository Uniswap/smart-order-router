import { BigNumber } from 'ethers';

export type GasPrice = {
  gasPriceWei: BigNumber;
  blockNumber: number;
};

export abstract class IGasPriceProvider {
  public abstract getGasPrice(): Promise<GasPrice>;
}
