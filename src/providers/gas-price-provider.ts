import { BigNumber } from '@ethersproject/bignumber';
import { ProviderConfig } from './provider';

export type GasPrice = {
  gasPriceWei: BigNumber;
};

/**
 * Provider for getting gas prices.
 */
export abstract class IGasPriceProvider {
  public abstract getGasPrice(providerConfig: ProviderConfig): Promise<GasPrice>;
}
