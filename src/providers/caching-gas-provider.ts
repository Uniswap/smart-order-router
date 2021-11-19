import { ChainId } from '../util/chains';
import { log } from '../util/log';
import { ICache } from './cache';
import { GasPrice, IGasPriceProvider } from './gas-price-provider';

export class CachingGasStationProvider implements IGasPriceProvider {
  private GAS_KEY = (chainId: ChainId) => `gasPrice-${chainId}`;

  constructor(
    protected chainId: ChainId,
    private gasPriceProvider: IGasPriceProvider,
    private cache: ICache<GasPrice>
  ) {}

  public async getGasPrice(): Promise<GasPrice> {
    const cachedGasPrice = await this.cache.get(this.GAS_KEY(this.chainId));

    if (cachedGasPrice) {
      log.info(
        { cachedGasPrice },
        `Got gas station price from local cache: ${cachedGasPrice.gasPriceWei}.`
      );

      return cachedGasPrice;
    }

    log.info('Gas station price local cache miss.');
    const gasPrice = await this.gasPriceProvider.getGasPrice();
    await this.cache.set(this.GAS_KEY(this.chainId), gasPrice);

    return gasPrice;
  }
}
