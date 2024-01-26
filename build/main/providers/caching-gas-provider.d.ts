import { ChainId } from '@uniswap/sdk-core';
import { ICache } from './cache';
import { GasPrice, IGasPriceProvider } from './gas-price-provider';
/**
 * Provider for getting gas price, with functionality for caching the results.
 *
 * @export
 * @class CachingV3SubgraphProvider
 */
export declare class CachingGasStationProvider extends IGasPriceProvider {
    protected chainId: ChainId;
    private gasPriceProvider;
    private cache;
    private GAS_KEY;
    /**
     * Creates an instance of CachingGasStationProvider.
     * @param chainId The chain id to use.
     * @param gasPriceProvider The provider to use to get the gas price when not in the cache.
     * @param cache Cache instance to hold cached pools.
     */
    constructor(chainId: ChainId, gasPriceProvider: IGasPriceProvider, cache: ICache<GasPrice>);
    getGasPrice(latestBlockNumber: number, requestBlockNumber?: number): Promise<GasPrice>;
}
