import NodeCache from 'node-cache';
import { log } from '../util/log';
import { GasPrice, IGasPriceProvider } from './gas-price-provider';

const GAS_CACHE = new NodeCache({ useClones: true });
const GAS_KEY = 'gas';

export class CachingGasStationProvider extends IGasPriceProvider {
  constructor(private gasPriceProvider: IGasPriceProvider, private ttlSeconds: number = 300) {
    super();
  }

  public async getGasPrice(): Promise<GasPrice> {
    const cachedGasPrice = GAS_CACHE.get<GasPrice>(GAS_KEY);

    if (cachedGasPrice) {
      log.info(
        { cachedGasPrice },
        `Got gas station price from local cache: ${cachedGasPrice.gasPriceWei}.`
      );

      return cachedGasPrice;
    }

    log.info('Gas station price local cache miss.');
    const gasPrice = await this.gasPriceProvider.getGasPrice();
    GAS_CACHE.set<GasPrice>(GAS_KEY, gasPrice, this.ttlSeconds);

    return gasPrice;
  }
}
