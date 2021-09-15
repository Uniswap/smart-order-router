import NodeCache from 'node-cache';
import { ChainId } from '../util/chains';
import { log } from '../util/log';
import { GasPrice, IGasPriceProvider } from './gas-price-provider';

const GAS_CACHE = new NodeCache({ useClones: true });
const GAS_KEY = (chainId: ChainId) => `gas${chainId}`;

export class CachingGasStationProvider extends IGasPriceProvider {
  constructor(protected chainId: ChainId, private gasPriceProvider: IGasPriceProvider, private ttlSeconds: number = 300) {
    super();
  }

  public async getGasPrice(): Promise<GasPrice> {
    const cachedGasPrice = GAS_CACHE.get<GasPrice>(GAS_KEY(this.chainId));

    if (cachedGasPrice) {
      log.info(
        { cachedGasPrice },
        `Got gas station price from local cache: ${cachedGasPrice.gasPriceWei}.`
      );

      return cachedGasPrice;
    }

    log.info('Gas station price local cache miss.');
    const gasPrice = await this.gasPriceProvider.getGasPrice();
    GAS_CACHE.set<GasPrice>(GAS_KEY(this.chainId), gasPrice, this.ttlSeconds);

    return gasPrice;
  }
}
