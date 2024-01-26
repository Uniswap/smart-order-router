"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.IRouteCachingProvider = void 0;
const sdk_core_1 = require("@uniswap/sdk-core");
const model_1 = require("./model");
/**
 * Abstract class for a RouteCachingProvider.
 * Defines the base methods of how to interact with this interface, but not the implementation of how to cache.
 */
class IRouteCachingProvider {
    constructor() {
        /**
         * Final implementation of the public `getCachedRoute` method, this is how code will interact with the implementation
         *
         * @public
         * @readonly
         * @param chainId
         * @param amount
         * @param quoteToken
         * @param tradeType
         * @param protocols
         * @param blockNumber
         */
        this.getCachedRoute = async (
        // Defined as a readonly member instead of a regular function to make it final.
        chainId, amount, quoteToken, tradeType, protocols, blockNumber, optimistic = false) => {
            if ((await this.getCacheMode(chainId, amount, quoteToken, tradeType, protocols)) == model_1.CacheMode.Darkmode) {
                return undefined;
            }
            const cachedRoute = await this._getCachedRoute(chainId, amount, quoteToken, tradeType, protocols, blockNumber, optimistic);
            return this.filterExpiredCachedRoutes(cachedRoute, blockNumber, optimistic);
        };
        /**
         * Final implementation of the public `setCachedRoute` method.
         * This method will set the blockToLive in the CachedRoutes object before calling the internal method to insert in cache.
         *
         * @public
         * @readonly
         * @param cachedRoutes The route to cache.
         * @returns Promise<boolean> Indicates if the route was inserted into cache.
         */
        this.setCachedRoute = async (
        // Defined as a readonly member instead of a regular function to make it final.
        cachedRoutes, amount) => {
            if ((await this.getCacheModeFromCachedRoutes(cachedRoutes, amount)) ==
                model_1.CacheMode.Darkmode) {
                return false;
            }
            cachedRoutes.blocksToLive = await this._getBlocksToLive(cachedRoutes, amount);
            return this._setCachedRoute(cachedRoutes, amount);
        };
    }
    /**
     * Returns the CacheMode for the given cachedRoutes and amount
     *
     * @param cachedRoutes
     * @param amount
     */
    getCacheModeFromCachedRoutes(cachedRoutes, amount) {
        const quoteToken = cachedRoutes.tradeType == sdk_core_1.TradeType.EXACT_INPUT
            ? cachedRoutes.tokenOut
            : cachedRoutes.tokenIn;
        return this.getCacheMode(cachedRoutes.chainId, amount, quoteToken, cachedRoutes.tradeType, cachedRoutes.protocolsCovered);
    }
    filterExpiredCachedRoutes(cachedRoutes, blockNumber, optimistic) {
        return (cachedRoutes === null || cachedRoutes === void 0 ? void 0 : cachedRoutes.notExpired(blockNumber, optimistic))
            ? cachedRoutes
            : undefined;
    }
}
exports.IRouteCachingProvider = IRouteCachingProvider;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicm91dGUtY2FjaGluZy1wcm92aWRlci5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbIi4uLy4uLy4uLy4uLy4uL3NyYy9wcm92aWRlcnMvY2FjaGluZy9yb3V0ZS9yb3V0ZS1jYWNoaW5nLXByb3ZpZGVyLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7OztBQU9BLGdEQU0yQjtBQUUzQixtQ0FBb0M7QUFHcEM7OztHQUdHO0FBQ0gsTUFBc0IscUJBQXFCO0lBQTNDO1FBQ0U7Ozs7Ozs7Ozs7O1dBV0c7UUFDYSxtQkFBYyxHQUFHLEtBQUs7UUFDcEMsK0VBQStFO1FBQy9FLE9BQWUsRUFDZixNQUFnQyxFQUNoQyxVQUFpQixFQUNqQixTQUFvQixFQUNwQixTQUFxQixFQUNyQixXQUFtQixFQUNuQixVQUFVLEdBQUcsS0FBSyxFQUNpQixFQUFFO1lBQ3JDLElBQ0UsQ0FBQyxNQUFNLElBQUksQ0FBQyxZQUFZLENBQ3RCLE9BQU8sRUFDUCxNQUFNLEVBQ04sVUFBVSxFQUNWLFNBQVMsRUFDVCxTQUFTLENBQ1YsQ0FBQyxJQUFJLGlCQUFTLENBQUMsUUFBUSxFQUN4QjtnQkFDQSxPQUFPLFNBQVMsQ0FBQzthQUNsQjtZQUVELE1BQU0sV0FBVyxHQUFHLE1BQU0sSUFBSSxDQUFDLGVBQWUsQ0FDNUMsT0FBTyxFQUNQLE1BQU0sRUFDTixVQUFVLEVBQ1YsU0FBUyxFQUNULFNBQVMsRUFDVCxXQUFXLEVBQ1gsVUFBVSxDQUNYLENBQUM7WUFFRixPQUFPLElBQUksQ0FBQyx5QkFBeUIsQ0FBQyxXQUFXLEVBQUUsV0FBVyxFQUFFLFVBQVUsQ0FBQyxDQUFDO1FBQzlFLENBQUMsQ0FBQztRQUVGOzs7Ozs7OztXQVFHO1FBQ2EsbUJBQWMsR0FBRyxLQUFLO1FBQ3BDLCtFQUErRTtRQUMvRSxZQUEwQixFQUMxQixNQUFnQyxFQUNkLEVBQUU7WUFDcEIsSUFDRSxDQUFDLE1BQU0sSUFBSSxDQUFDLDRCQUE0QixDQUFDLFlBQVksRUFBRSxNQUFNLENBQUMsQ0FBQztnQkFDL0QsaUJBQVMsQ0FBQyxRQUFRLEVBQ2xCO2dCQUNBLE9BQU8sS0FBSyxDQUFDO2FBQ2Q7WUFFRCxZQUFZLENBQUMsWUFBWSxHQUFHLE1BQU0sSUFBSSxDQUFDLGdCQUFnQixDQUNyRCxZQUFZLEVBQ1osTUFBTSxDQUNQLENBQUM7WUFFRixPQUFPLElBQUksQ0FBQyxlQUFlLENBQUMsWUFBWSxFQUFFLE1BQU0sQ0FBQyxDQUFDO1FBQ3BELENBQUMsQ0FBQztJQXNHSixDQUFDO0lBcEdDOzs7OztPQUtHO0lBQ0ksNEJBQTRCLENBQ2pDLFlBQTBCLEVBQzFCLE1BQWdDO1FBRWhDLE1BQU0sVUFBVSxHQUNkLFlBQVksQ0FBQyxTQUFTLElBQUksb0JBQVMsQ0FBQyxXQUFXO1lBQzdDLENBQUMsQ0FBQyxZQUFZLENBQUMsUUFBUTtZQUN2QixDQUFDLENBQUMsWUFBWSxDQUFDLE9BQU8sQ0FBQztRQUUzQixPQUFPLElBQUksQ0FBQyxZQUFZLENBQ3RCLFlBQVksQ0FBQyxPQUFPLEVBQ3BCLE1BQU0sRUFDTixVQUFVLEVBQ1YsWUFBWSxDQUFDLFNBQVMsRUFDdEIsWUFBWSxDQUFDLGdCQUFnQixDQUM5QixDQUFDO0lBQ0osQ0FBQztJQXFCUyx5QkFBeUIsQ0FDakMsWUFBc0MsRUFDdEMsV0FBbUIsRUFDbkIsVUFBbUI7UUFFbkIsT0FBTyxDQUFBLFlBQVksYUFBWixZQUFZLHVCQUFaLFlBQVksQ0FBRSxVQUFVLENBQUMsV0FBVyxFQUFFLFVBQVUsQ0FBQztZQUN0RCxDQUFDLENBQUMsWUFBWTtZQUNkLENBQUMsQ0FBQyxTQUFTLENBQUM7SUFDaEIsQ0FBQztDQWlERjtBQWpMRCxzREFpTEMifQ==