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
  private GAS_KEY = (chainId: ChainId, blockNumber: number) =>
    `gasPrice-${chainId}-${blockNumber}`;

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

  public override async getGasPrice(
    latestBlockNumber: number,
    requestBlockNumber?: number
  ): Promise<GasPrice> {
    // If block number is specified in the request, we have to use that block number find any potential cache hits.
    // Otherwise, we can use the latest block number.
    const targetBlockNumber = requestBlockNumber ?? latestBlockNumber;
    const cachedGasPrice = await this.cache.get(
      this.GAS_KEY(this.chainId, targetBlockNumber)
    );

    if (cachedGasPrice) {
      log.info(
        { cachedGasPrice },
        `Got gas station price from local cache: ${cachedGasPrice.gasPriceWei}.`
      );

      return cachedGasPrice;
    }

    const gasPrice = await this.gasPriceProvider.getGasPrice(
      latestBlockNumber,
      requestBlockNumber
    );
    await this.cache.set(
      this.GAS_KEY(this.chainId, targetBlockNumber),
      gasPrice
    );

    return gasPrice;
  }
}
