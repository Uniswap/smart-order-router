"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.CachedRoutes = void 0;
const lodash_1 = __importDefault(require("lodash"));
const cached_route_1 = require("./cached-route");
/**
 * Class defining the route to cache
 *
 * @export
 * @class CachedRoute
 */
class CachedRoutes {
    /**
     * @param routes
     * @param chainId
     * @param tokenIn
     * @param tokenOut
     * @param protocolsCovered
     * @param blockNumber
     * @param tradeType
     * @param originalAmount
     * @param blocksToLive
     */
    constructor({ routes, chainId, tokenIn, tokenOut, protocolsCovered, blockNumber, tradeType, originalAmount, blocksToLive = 0, }) {
        this.routes = routes;
        this.chainId = chainId;
        this.tokenIn = tokenIn;
        this.tokenOut = tokenOut;
        this.protocolsCovered = protocolsCovered;
        this.blockNumber = blockNumber;
        this.tradeType = tradeType;
        this.originalAmount = originalAmount;
        this.blocksToLive = blocksToLive;
    }
    /**
     * Factory method that creates a `CachedRoutes` object from an array of RouteWithValidQuote.
     *
     * @public
     * @static
     * @param routes
     * @param chainId
     * @param tokenIn
     * @param tokenOut
     * @param protocolsCovered
     * @param blockNumber
     * @param tradeType
     * @param originalAmount
     */
    static fromRoutesWithValidQuotes(routes, chainId, tokenIn, tokenOut, protocolsCovered, blockNumber, tradeType, originalAmount) {
        if (routes.length == 0)
            return undefined;
        const cachedRoutes = lodash_1.default.map(routes, (route) => new cached_route_1.CachedRoute({ route: route.route, percent: route.percent }));
        return new CachedRoutes({
            routes: cachedRoutes,
            chainId,
            tokenIn,
            tokenOut,
            protocolsCovered,
            blockNumber,
            tradeType,
            originalAmount,
        });
    }
    /**
     * Function to determine if, given a block number, the CachedRoute is expired or not.
     *
     * @param currentBlockNumber
     * @param optimistic
     */
    notExpired(currentBlockNumber, optimistic = false) {
        // When it's not optimistic, we only allow the route of the existing block.
        const blocksToLive = optimistic ? this.blocksToLive : 0;
        const blocksDifference = currentBlockNumber - this.blockNumber;
        return blocksDifference <= blocksToLive;
    }
}
exports.CachedRoutes = CachedRoutes;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY2FjaGVkLXJvdXRlcy5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbIi4uLy4uLy4uLy4uLy4uLy4uL3NyYy9wcm92aWRlcnMvY2FjaGluZy9yb3V0ZS9tb2RlbC9jYWNoZWQtcm91dGVzLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7Ozs7OztBQUVBLG9EQUF1QjtBQVN2QixpREFBNkM7QUFjN0M7Ozs7O0dBS0c7QUFDSCxNQUFhLFlBQVk7SUFZdkI7Ozs7Ozs7Ozs7T0FVRztJQUNILFlBQVksRUFDVixNQUFNLEVBQ04sT0FBTyxFQUNQLE9BQU8sRUFDUCxRQUFRLEVBQ1IsZ0JBQWdCLEVBQ2hCLFdBQVcsRUFDWCxTQUFTLEVBQ1QsY0FBYyxFQUNkLFlBQVksR0FBRyxDQUFDLEdBQ0c7UUFDbkIsSUFBSSxDQUFDLE1BQU0sR0FBRyxNQUFNLENBQUM7UUFDckIsSUFBSSxDQUFDLE9BQU8sR0FBRyxPQUFPLENBQUM7UUFDdkIsSUFBSSxDQUFDLE9BQU8sR0FBRyxPQUFPLENBQUM7UUFDdkIsSUFBSSxDQUFDLFFBQVEsR0FBRyxRQUFRLENBQUM7UUFDekIsSUFBSSxDQUFDLGdCQUFnQixHQUFHLGdCQUFnQixDQUFDO1FBQ3pDLElBQUksQ0FBQyxXQUFXLEdBQUcsV0FBVyxDQUFDO1FBQy9CLElBQUksQ0FBQyxTQUFTLEdBQUcsU0FBUyxDQUFDO1FBQzNCLElBQUksQ0FBQyxjQUFjLEdBQUcsY0FBYyxDQUFDO1FBQ3JDLElBQUksQ0FBQyxZQUFZLEdBQUcsWUFBWSxDQUFDO0lBQ25DLENBQUM7SUFFRDs7Ozs7Ozs7Ozs7OztPQWFHO0lBQ0ksTUFBTSxDQUFDLHlCQUF5QixDQUNyQyxNQUE2QixFQUM3QixPQUFnQixFQUNoQixPQUFjLEVBQ2QsUUFBZSxFQUNmLGdCQUE0QixFQUM1QixXQUFtQixFQUNuQixTQUFvQixFQUNwQixjQUFzQjtRQUV0QixJQUFJLE1BQU0sQ0FBQyxNQUFNLElBQUksQ0FBQztZQUFFLE9BQU8sU0FBUyxDQUFDO1FBRXpDLE1BQU0sWUFBWSxHQUFHLGdCQUFDLENBQUMsR0FBRyxDQUN4QixNQUFNLEVBQ04sQ0FBQyxLQUEwQixFQUFFLEVBQUUsQ0FDN0IsSUFBSSwwQkFBVyxDQUFDLEVBQUUsS0FBSyxFQUFFLEtBQUssQ0FBQyxLQUFLLEVBQUUsT0FBTyxFQUFFLEtBQUssQ0FBQyxPQUFPLEVBQUUsQ0FBQyxDQUNsRSxDQUFDO1FBRUYsT0FBTyxJQUFJLFlBQVksQ0FBQztZQUN0QixNQUFNLEVBQUUsWUFBWTtZQUNwQixPQUFPO1lBQ1AsT0FBTztZQUNQLFFBQVE7WUFDUixnQkFBZ0I7WUFDaEIsV0FBVztZQUNYLFNBQVM7WUFDVCxjQUFjO1NBQ2YsQ0FBQyxDQUFDO0lBQ0wsQ0FBQztJQUVEOzs7OztPQUtHO0lBQ0ksVUFBVSxDQUFDLGtCQUEwQixFQUFFLFVBQVUsR0FBRyxLQUFLO1FBQzlELDJFQUEyRTtRQUMzRSxNQUFNLFlBQVksR0FBRyxVQUFVLENBQUMsQ0FBQyxDQUFDLElBQUksQ0FBQyxZQUFZLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQztRQUN4RCxNQUFNLGdCQUFnQixHQUFHLGtCQUFrQixHQUFHLElBQUksQ0FBQyxXQUFXLENBQUM7UUFFL0QsT0FBTyxnQkFBZ0IsSUFBSSxZQUFZLENBQUM7SUFDMUMsQ0FBQztDQUNGO0FBdEdELG9DQXNHQyJ9