// eslint-disable-next-line no-restricted-imports
import { BigNumber } from 'ethers';

import { GasPrice, IGasPriceProvider } from './gas-price-provider';

export class StaticGasPriceProvider implements IGasPriceProvider {
  constructor(private gasPriceWei: BigNumber) {}
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async getGasPrice(_latestBlockNumber: number, _requestBlockNumber?: number): Promise<GasPrice> {
    return { gasPriceWei: this.gasPriceWei };
  }
}
