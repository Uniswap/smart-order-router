"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CachingGasStationProvider = void 0;
const log_1 = require("../util/log");
const gas_price_provider_1 = require("./gas-price-provider");
/**
 * Provider for getting gas price, with functionality for caching the results.
 *
 * @export
 * @class CachingV3SubgraphProvider
 */
class CachingGasStationProvider extends gas_price_provider_1.IGasPriceProvider {
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
            log_1.log.info({ cachedGasPrice }, `Got gas station price from local cache: ${cachedGasPrice.gasPriceWei}.`);
            return cachedGasPrice;
        }
        const gasPrice = await this.gasPriceProvider.getGasPrice(latestBlockNumber, requestBlockNumber);
        await this.cache.set(this.GAS_KEY(this.chainId, targetBlockNumber), gasPrice);
        return gasPrice;
    }
}
exports.CachingGasStationProvider = CachingGasStationProvider;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY2FjaGluZy1nYXMtcHJvdmlkZXIuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi8uLi8uLi9zcmMvcHJvdmlkZXJzL2NhY2hpbmctZ2FzLXByb3ZpZGVyLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7OztBQUVBLHFDQUFrQztBQUdsQyw2REFBbUU7QUFFbkU7Ozs7O0dBS0c7QUFDSCxNQUFhLHlCQUEwQixTQUFRLHNDQUFpQjtJQUk5RDs7Ozs7T0FLRztJQUNILFlBQ1ksT0FBZ0IsRUFDbEIsZ0JBQW1DLEVBQ25DLEtBQXVCO1FBRS9CLEtBQUssRUFBRSxDQUFDO1FBSkUsWUFBTyxHQUFQLE9BQU8sQ0FBUztRQUNsQixxQkFBZ0IsR0FBaEIsZ0JBQWdCLENBQW1CO1FBQ25DLFVBQUssR0FBTCxLQUFLLENBQWtCO1FBWnpCLFlBQU8sR0FBRyxDQUFDLE9BQWdCLEVBQUUsV0FBbUIsRUFBRSxFQUFFLENBQzFELFlBQVksT0FBTyxJQUFJLFdBQVcsRUFBRSxDQUFDO0lBY3ZDLENBQUM7SUFFZSxLQUFLLENBQUMsV0FBVyxDQUMvQixpQkFBeUIsRUFDekIsa0JBQTJCO1FBRTNCLCtHQUErRztRQUMvRyxpREFBaUQ7UUFDakQsTUFBTSxpQkFBaUIsR0FBRyxrQkFBa0IsYUFBbEIsa0JBQWtCLGNBQWxCLGtCQUFrQixHQUFJLGlCQUFpQixDQUFDO1FBQ2xFLE1BQU0sY0FBYyxHQUFHLE1BQU0sSUFBSSxDQUFDLEtBQUssQ0FBQyxHQUFHLENBQ3pDLElBQUksQ0FBQyxPQUFPLENBQUMsSUFBSSxDQUFDLE9BQU8sRUFBRSxpQkFBaUIsQ0FBQyxDQUM5QyxDQUFDO1FBRUYsSUFBSSxjQUFjLEVBQUU7WUFDbEIsU0FBRyxDQUFDLElBQUksQ0FDTixFQUFFLGNBQWMsRUFBRSxFQUNsQiwyQ0FBMkMsY0FBYyxDQUFDLFdBQVcsR0FBRyxDQUN6RSxDQUFDO1lBRUYsT0FBTyxjQUFjLENBQUM7U0FDdkI7UUFFRCxNQUFNLFFBQVEsR0FBRyxNQUFNLElBQUksQ0FBQyxnQkFBZ0IsQ0FBQyxXQUFXLENBQ3RELGlCQUFpQixFQUNqQixrQkFBa0IsQ0FDbkIsQ0FBQztRQUNGLE1BQU0sSUFBSSxDQUFDLEtBQUssQ0FBQyxHQUFHLENBQ2xCLElBQUksQ0FBQyxPQUFPLENBQUMsSUFBSSxDQUFDLE9BQU8sRUFBRSxpQkFBaUIsQ0FBQyxFQUM3QyxRQUFRLENBQ1QsQ0FBQztRQUVGLE9BQU8sUUFBUSxDQUFDO0lBQ2xCLENBQUM7Q0FDRjtBQWpERCw4REFpREMifQ==