import { BigNumber } from 'ethers';

export type GasPrice = {
  gasPriceWei: BigNumber;
};

export abstract class IGasPriceProvider {
  public abstract getGasPrice(): Promise<GasPrice>;
}
