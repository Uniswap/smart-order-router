import _ from 'lodash';
import { CachedRoute } from './cached-route';
/**
 * Class defining the route to cache
 *
 * @export
 * @class CachedRoute
 */
export class CachedRoutes {
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
        const cachedRoutes = _.map(routes, (route) => new CachedRoute({ route: route.route, percent: route.percent }));
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY2FjaGVkLXJvdXRlcy5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbIi4uLy4uLy4uLy4uLy4uLy4uL3NyYy9wcm92aWRlcnMvY2FjaGluZy9yb3V0ZS9tb2RlbC9jYWNoZWQtcm91dGVzLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUVBLE9BQU8sQ0FBQyxNQUFNLFFBQVEsQ0FBQztBQVN2QixPQUFPLEVBQUUsV0FBVyxFQUFFLE1BQU0sZ0JBQWdCLENBQUM7QUFjN0M7Ozs7O0dBS0c7QUFDSCxNQUFNLE9BQU8sWUFBWTtJQVl2Qjs7Ozs7Ozs7OztPQVVHO0lBQ0gsWUFBWSxFQUNWLE1BQU0sRUFDTixPQUFPLEVBQ1AsT0FBTyxFQUNQLFFBQVEsRUFDUixnQkFBZ0IsRUFDaEIsV0FBVyxFQUNYLFNBQVMsRUFDVCxjQUFjLEVBQ2QsWUFBWSxHQUFHLENBQUMsR0FDRztRQUNuQixJQUFJLENBQUMsTUFBTSxHQUFHLE1BQU0sQ0FBQztRQUNyQixJQUFJLENBQUMsT0FBTyxHQUFHLE9BQU8sQ0FBQztRQUN2QixJQUFJLENBQUMsT0FBTyxHQUFHLE9BQU8sQ0FBQztRQUN2QixJQUFJLENBQUMsUUFBUSxHQUFHLFFBQVEsQ0FBQztRQUN6QixJQUFJLENBQUMsZ0JBQWdCLEdBQUcsZ0JBQWdCLENBQUM7UUFDekMsSUFBSSxDQUFDLFdBQVcsR0FBRyxXQUFXLENBQUM7UUFDL0IsSUFBSSxDQUFDLFNBQVMsR0FBRyxTQUFTLENBQUM7UUFDM0IsSUFBSSxDQUFDLGNBQWMsR0FBRyxjQUFjLENBQUM7UUFDckMsSUFBSSxDQUFDLFlBQVksR0FBRyxZQUFZLENBQUM7SUFDbkMsQ0FBQztJQUVEOzs7Ozs7Ozs7Ozs7O09BYUc7SUFDSSxNQUFNLENBQUMseUJBQXlCLENBQ3JDLE1BQTZCLEVBQzdCLE9BQWdCLEVBQ2hCLE9BQWMsRUFDZCxRQUFlLEVBQ2YsZ0JBQTRCLEVBQzVCLFdBQW1CLEVBQ25CLFNBQW9CLEVBQ3BCLGNBQXNCO1FBRXRCLElBQUksTUFBTSxDQUFDLE1BQU0sSUFBSSxDQUFDO1lBQUUsT0FBTyxTQUFTLENBQUM7UUFFekMsTUFBTSxZQUFZLEdBQUcsQ0FBQyxDQUFDLEdBQUcsQ0FDeEIsTUFBTSxFQUNOLENBQUMsS0FBMEIsRUFBRSxFQUFFLENBQzdCLElBQUksV0FBVyxDQUFDLEVBQUUsS0FBSyxFQUFFLEtBQUssQ0FBQyxLQUFLLEVBQUUsT0FBTyxFQUFFLEtBQUssQ0FBQyxPQUFPLEVBQUUsQ0FBQyxDQUNsRSxDQUFDO1FBRUYsT0FBTyxJQUFJLFlBQVksQ0FBQztZQUN0QixNQUFNLEVBQUUsWUFBWTtZQUNwQixPQUFPO1lBQ1AsT0FBTztZQUNQLFFBQVE7WUFDUixnQkFBZ0I7WUFDaEIsV0FBVztZQUNYLFNBQVM7WUFDVCxjQUFjO1NBQ2YsQ0FBQyxDQUFDO0lBQ0wsQ0FBQztJQUVEOzs7OztPQUtHO0lBQ0ksVUFBVSxDQUFDLGtCQUEwQixFQUFFLFVBQVUsR0FBRyxLQUFLO1FBQzlELDJFQUEyRTtRQUMzRSxNQUFNLFlBQVksR0FBRyxVQUFVLENBQUMsQ0FBQyxDQUFDLElBQUksQ0FBQyxZQUFZLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQztRQUN4RCxNQUFNLGdCQUFnQixHQUFHLGtCQUFrQixHQUFHLElBQUksQ0FBQyxXQUFXLENBQUM7UUFFL0QsT0FBTyxnQkFBZ0IsSUFBSSxZQUFZLENBQUM7SUFDMUMsQ0FBQztDQUNGIn0=