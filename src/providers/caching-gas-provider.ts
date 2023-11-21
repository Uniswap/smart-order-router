import { ChainId } from '@uniswap/sdk-core';

import { log } from '../util/log';

import { ICache } from './cache';
import { GasPrice, IGasPriceProvider } from './gas-price-provider';

/**
 * Provider for getting gas price, with functionality for caching the results.
 *
 * @export
 * @class CachingV3SubgraphProvider
 */
export class CachingGasStationProvider extends IGasPriceProvider {
  private GAS_KEY = (chainId: ChainId, blockNumber: number) => `gasPrice-${chainId}-${blockNumber}`;

  /**
   * Creates an instance of CachingGasStationProvider.
   * @param chainId The chain id to use.
   * @param gasPriceProvider The provider to use to get the gas price when not in the cache.
   * @param cache Cache instance to hold cached pools.
   */
  constructor(
    protected chainId: ChainId,
    private gasPriceProvider: IGasPriceProvider,
    private cache: ICache<GasPrice>
  ) {
    super();
  }

  public override async getGasPrice(requestBlockNumber: number): Promise<GasPrice> {
    const cachedGasPrice = await this.cache.get(this.GAS_KEY(this.chainId, requestBlockNumber));

    if (cachedGasPrice) {
      log.info(
        { cachedGasPrice },
        `Got gas station price from local cache: ${cachedGasPrice.gasPriceWei}.`
      );

      return cachedGasPrice;
    }

    log.info('Gas station price local cache miss.');
    const gasPrice = await this.gasPriceProvider.getGasPrice(requestBlockNumber);
    await this.cache.set(this.GAS_KEY(this.chainId, requestBlockNumber), gasPrice);

    return gasPrice;
  }
}
