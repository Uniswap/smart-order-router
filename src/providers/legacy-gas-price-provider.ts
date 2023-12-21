import { JsonRpcProvider } from '@ethersproject/providers';

import { GasPrice, IGasPriceProvider } from './gas-price-provider';

export class LegacyGasPriceProvider extends IGasPriceProvider {
  constructor(protected provider: JsonRpcProvider) {
    super();
  }

  public override async getGasPrice(
    _latestBlockNumber: number,
    _requestBlockNumber?: number
  ): Promise<GasPrice> {
    const gasPriceWei = await this.provider.getGasPrice();
    return {
      gasPriceWei,
    };
  }
}
