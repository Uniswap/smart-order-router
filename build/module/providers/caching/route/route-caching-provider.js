import { TradeType, } from '@uniswap/sdk-core';
import { CacheMode } from './model';
/**
 * Abstract class for a RouteCachingProvider.
 * Defines the base methods of how to interact with this interface, but not the implementation of how to cache.
 */
export class IRouteCachingProvider {
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
            if ((await this.getCacheMode(chainId, amount, quoteToken, tradeType, protocols)) == CacheMode.Darkmode) {
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
                CacheMode.Darkmode) {
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
        const quoteToken = cachedRoutes.tradeType == TradeType.EXACT_INPUT
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicm91dGUtY2FjaGluZy1wcm92aWRlci5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbIi4uLy4uLy4uLy4uLy4uL3NyYy9wcm92aWRlcnMvY2FjaGluZy9yb3V0ZS9yb3V0ZS1jYWNoaW5nLXByb3ZpZGVyLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQU9BLE9BQU8sRUFLTCxTQUFTLEdBQ1YsTUFBTSxtQkFBbUIsQ0FBQztBQUUzQixPQUFPLEVBQUUsU0FBUyxFQUFFLE1BQU0sU0FBUyxDQUFDO0FBR3BDOzs7R0FHRztBQUNILE1BQU0sT0FBZ0IscUJBQXFCO0lBQTNDO1FBQ0U7Ozs7Ozs7Ozs7O1dBV0c7UUFDYSxtQkFBYyxHQUFHLEtBQUs7UUFDcEMsK0VBQStFO1FBQy9FLE9BQWUsRUFDZixNQUFnQyxFQUNoQyxVQUFpQixFQUNqQixTQUFvQixFQUNwQixTQUFxQixFQUNyQixXQUFtQixFQUNuQixVQUFVLEdBQUcsS0FBSyxFQUNpQixFQUFFO1lBQ3JDLElBQ0UsQ0FBQyxNQUFNLElBQUksQ0FBQyxZQUFZLENBQ3RCLE9BQU8sRUFDUCxNQUFNLEVBQ04sVUFBVSxFQUNWLFNBQVMsRUFDVCxTQUFTLENBQ1YsQ0FBQyxJQUFJLFNBQVMsQ0FBQyxRQUFRLEVBQ3hCO2dCQUNBLE9BQU8sU0FBUyxDQUFDO2FBQ2xCO1lBRUQsTUFBTSxXQUFXLEdBQUcsTUFBTSxJQUFJLENBQUMsZUFBZSxDQUM1QyxPQUFPLEVBQ1AsTUFBTSxFQUNOLFVBQVUsRUFDVixTQUFTLEVBQ1QsU0FBUyxFQUNULFdBQVcsRUFDWCxVQUFVLENBQ1gsQ0FBQztZQUVGLE9BQU8sSUFBSSxDQUFDLHlCQUF5QixDQUFDLFdBQVcsRUFBRSxXQUFXLEVBQUUsVUFBVSxDQUFDLENBQUM7UUFDOUUsQ0FBQyxDQUFDO1FBRUY7Ozs7Ozs7O1dBUUc7UUFDYSxtQkFBYyxHQUFHLEtBQUs7UUFDcEMsK0VBQStFO1FBQy9FLFlBQTBCLEVBQzFCLE1BQWdDLEVBQ2QsRUFBRTtZQUNwQixJQUNFLENBQUMsTUFBTSxJQUFJLENBQUMsNEJBQTRCLENBQUMsWUFBWSxFQUFFLE1BQU0sQ0FBQyxDQUFDO2dCQUMvRCxTQUFTLENBQUMsUUFBUSxFQUNsQjtnQkFDQSxPQUFPLEtBQUssQ0FBQzthQUNkO1lBRUQsWUFBWSxDQUFDLFlBQVksR0FBRyxNQUFNLElBQUksQ0FBQyxnQkFBZ0IsQ0FDckQsWUFBWSxFQUNaLE1BQU0sQ0FDUCxDQUFDO1lBRUYsT0FBTyxJQUFJLENBQUMsZUFBZSxDQUFDLFlBQVksRUFBRSxNQUFNLENBQUMsQ0FBQztRQUNwRCxDQUFDLENBQUM7SUFzR0osQ0FBQztJQXBHQzs7Ozs7T0FLRztJQUNJLDRCQUE0QixDQUNqQyxZQUEwQixFQUMxQixNQUFnQztRQUVoQyxNQUFNLFVBQVUsR0FDZCxZQUFZLENBQUMsU0FBUyxJQUFJLFNBQVMsQ0FBQyxXQUFXO1lBQzdDLENBQUMsQ0FBQyxZQUFZLENBQUMsUUFBUTtZQUN2QixDQUFDLENBQUMsWUFBWSxDQUFDLE9BQU8sQ0FBQztRQUUzQixPQUFPLElBQUksQ0FBQyxZQUFZLENBQ3RCLFlBQVksQ0FBQyxPQUFPLEVBQ3BCLE1BQU0sRUFDTixVQUFVLEVBQ1YsWUFBWSxDQUFDLFNBQVMsRUFDdEIsWUFBWSxDQUFDLGdCQUFnQixDQUM5QixDQUFDO0lBQ0osQ0FBQztJQXFCUyx5QkFBeUIsQ0FDakMsWUFBc0MsRUFDdEMsV0FBbUIsRUFDbkIsVUFBbUI7UUFFbkIsT0FBTyxDQUFBLFlBQVksYUFBWixZQUFZLHVCQUFaLFlBQVksQ0FBRSxVQUFVLENBQUMsV0FBVyxFQUFFLFVBQVUsQ0FBQztZQUN0RCxDQUFDLENBQUMsWUFBWTtZQUNkLENBQUMsQ0FBQyxTQUFTLENBQUM7SUFDaEIsQ0FBQztDQWlERiJ9