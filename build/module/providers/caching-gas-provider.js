import { log } from '../util/log';
import { IGasPriceProvider } from './gas-price-provider';
/**
 * Provider for getting gas price, with functionality for caching the results.
 *
 * @export
 * @class CachingV3SubgraphProvider
 */
export class CachingGasStationProvider extends IGasPriceProvider {
    /**
     * Creates an instance of CachingGasStationProvider.
     * @param chainId The chain id to use.
     * @param gasPriceProvider The provider to use to get the gas price when not in the cache.
     * @param cache Cache instance to hold cached pools.
     */
    constructor(chainId, gasPriceProvider, cache) {
        super();
        this.chainId = chainId;
        this.gasPriceProvider = gasPriceProvider;
        this.cache = cache;
        this.GAS_KEY = (chainId, blockNumber) => `gasPrice-${chainId}-${blockNumber}`;
    }
    async getGasPrice(latestBlockNumber, requestBlockNumber) {
        // If block number is specified in the request, we have to use that block number find any potential cache hits.
        // Otherwise, we can use the latest block number.
        const targetBlockNumber = requestBlockNumber !== null && requestBlockNumber !== void 0 ? requestBlockNumber : latestBlockNumber;
        const cachedGasPrice = await this.cache.get(this.GAS_KEY(this.chainId, targetBlockNumber));
        if (cachedGasPrice) {
            log.info({ cachedGasPrice }, `Got gas station price from local cache: ${cachedGasPrice.gasPriceWei}.`);
            return cachedGasPrice;
        }
        const gasPrice = await this.gasPriceProvider.getGasPrice(latestBlockNumber, requestBlockNumber);
        await this.cache.set(this.GAS_KEY(this.chainId, targetBlockNumber), gasPrice);
        return gasPrice;
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY2FjaGluZy1nYXMtcHJvdmlkZXIuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi8uLi8uLi9zcmMvcHJvdmlkZXJzL2NhY2hpbmctZ2FzLXByb3ZpZGVyLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUVBLE9BQU8sRUFBRSxHQUFHLEVBQUUsTUFBTSxhQUFhLENBQUM7QUFHbEMsT0FBTyxFQUFZLGlCQUFpQixFQUFFLE1BQU0sc0JBQXNCLENBQUM7QUFFbkU7Ozs7O0dBS0c7QUFDSCxNQUFNLE9BQU8seUJBQTBCLFNBQVEsaUJBQWlCO0lBSTlEOzs7OztPQUtHO0lBQ0gsWUFDWSxPQUFnQixFQUNsQixnQkFBbUMsRUFDbkMsS0FBdUI7UUFFL0IsS0FBSyxFQUFFLENBQUM7UUFKRSxZQUFPLEdBQVAsT0FBTyxDQUFTO1FBQ2xCLHFCQUFnQixHQUFoQixnQkFBZ0IsQ0FBbUI7UUFDbkMsVUFBSyxHQUFMLEtBQUssQ0FBa0I7UUFaekIsWUFBTyxHQUFHLENBQUMsT0FBZ0IsRUFBRSxXQUFtQixFQUFFLEVBQUUsQ0FDMUQsWUFBWSxPQUFPLElBQUksV0FBVyxFQUFFLENBQUM7SUFjdkMsQ0FBQztJQUVlLEtBQUssQ0FBQyxXQUFXLENBQy9CLGlCQUF5QixFQUN6QixrQkFBMkI7UUFFM0IsK0dBQStHO1FBQy9HLGlEQUFpRDtRQUNqRCxNQUFNLGlCQUFpQixHQUFHLGtCQUFrQixhQUFsQixrQkFBa0IsY0FBbEIsa0JBQWtCLEdBQUksaUJBQWlCLENBQUM7UUFDbEUsTUFBTSxjQUFjLEdBQUcsTUFBTSxJQUFJLENBQUMsS0FBSyxDQUFDLEdBQUcsQ0FDekMsSUFBSSxDQUFDLE9BQU8sQ0FBQyxJQUFJLENBQUMsT0FBTyxFQUFFLGlCQUFpQixDQUFDLENBQzlDLENBQUM7UUFFRixJQUFJLGNBQWMsRUFBRTtZQUNsQixHQUFHLENBQUMsSUFBSSxDQUNOLEVBQUUsY0FBYyxFQUFFLEVBQ2xCLDJDQUEyQyxjQUFjLENBQUMsV0FBVyxHQUFHLENBQ3pFLENBQUM7WUFFRixPQUFPLGNBQWMsQ0FBQztTQUN2QjtRQUVELE1BQU0sUUFBUSxHQUFHLE1BQU0sSUFBSSxDQUFDLGdCQUFnQixDQUFDLFdBQVcsQ0FDdEQsaUJBQWlCLEVBQ2pCLGtCQUFrQixDQUNuQixDQUFDO1FBQ0YsTUFBTSxJQUFJLENBQUMsS0FBSyxDQUFDLEdBQUcsQ0FDbEIsSUFBSSxDQUFDLE9BQU8sQ0FBQyxJQUFJLENBQUMsT0FBTyxFQUFFLGlCQUFpQixDQUFDLEVBQzdDLFFBQVEsQ0FDVCxDQUFDO1FBRUYsT0FBTyxRQUFRLENBQUM7SUFDbEIsQ0FBQztDQUNGIn0=