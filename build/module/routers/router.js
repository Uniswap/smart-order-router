import { MixedRouteSDK, Protocol, } from '@uniswap/router-sdk';
import { Route as V2RouteRaw } from '@uniswap/v2-sdk';
import { Route as V3RouteRaw, } from '@uniswap/v3-sdk';
export class V3Route extends V3RouteRaw {
    constructor() {
        super(...arguments);
        this.protocol = Protocol.V3;
    }
}
export class V2Route extends V2RouteRaw {
    constructor() {
        super(...arguments);
        this.protocol = Protocol.V2;
    }
}
export class MixedRoute extends MixedRouteSDK {
    constructor() {
        super(...arguments);
        this.protocol = Protocol.MIXED;
    }
}
export var SwapToRatioStatus;
(function (SwapToRatioStatus) {
    SwapToRatioStatus[SwapToRatioStatus["SUCCESS"] = 1] = "SUCCESS";
    SwapToRatioStatus[SwapToRatioStatus["NO_ROUTE_FOUND"] = 2] = "NO_ROUTE_FOUND";
    SwapToRatioStatus[SwapToRatioStatus["NO_SWAP_NEEDED"] = 3] = "NO_SWAP_NEEDED";
})(SwapToRatioStatus || (SwapToRatioStatus = {}));
export var SwapType;
(function (SwapType) {
    SwapType[SwapType["UNIVERSAL_ROUTER"] = 0] = "UNIVERSAL_ROUTER";
    SwapType[SwapType["SWAP_ROUTER_02"] = 1] = "SWAP_ROUTER_02";
})(SwapType || (SwapType = {}));
/**
 * Provides functionality for finding optimal swap routes on the Uniswap protocol.
 *
 * @export
 * @abstract
 * @class IRouter
 */
export class IRouter {
}
export class ISwapToRatio {
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicm91dGVyLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiLi4vLi4vLi4vc3JjL3JvdXRlcnMvcm91dGVyLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUNBLE9BQU8sRUFFTCxhQUFhLEVBQ2IsUUFBUSxHQUVULE1BQU0scUJBQXFCLENBQUM7QUFTN0IsT0FBTyxFQUFFLEtBQUssSUFBSSxVQUFVLEVBQUUsTUFBTSxpQkFBaUIsQ0FBQztBQUN0RCxPQUFPLEVBSUwsS0FBSyxJQUFJLFVBQVUsR0FDcEIsTUFBTSxpQkFBaUIsQ0FBQztBQU96QixNQUFNLE9BQU8sT0FBUSxTQUFRLFVBQXdCO0lBQXJEOztRQUNFLGFBQVEsR0FBZ0IsUUFBUSxDQUFDLEVBQUUsQ0FBQztJQUN0QyxDQUFDO0NBQUE7QUFDRCxNQUFNLE9BQU8sT0FBUSxTQUFRLFVBQXdCO0lBQXJEOztRQUNFLGFBQVEsR0FBZ0IsUUFBUSxDQUFDLEVBQUUsQ0FBQztJQUN0QyxDQUFDO0NBQUE7QUFDRCxNQUFNLE9BQU8sVUFBVyxTQUFRLGFBQTJCO0lBQTNEOztRQUNFLGFBQVEsR0FBbUIsUUFBUSxDQUFDLEtBQUssQ0FBQztJQUM1QyxDQUFDO0NBQUE7QUFzRkQsTUFBTSxDQUFOLElBQVksaUJBSVg7QUFKRCxXQUFZLGlCQUFpQjtJQUMzQiwrREFBVyxDQUFBO0lBQ1gsNkVBQWtCLENBQUE7SUFDbEIsNkVBQWtCLENBQUE7QUFDcEIsQ0FBQyxFQUpXLGlCQUFpQixLQUFqQixpQkFBaUIsUUFJNUI7QUFxQkQsTUFBTSxDQUFOLElBQVksUUFHWDtBQUhELFdBQVksUUFBUTtJQUNsQiwrREFBZ0IsQ0FBQTtJQUNoQiwyREFBYyxDQUFBO0FBQ2hCLENBQUMsRUFIVyxRQUFRLEtBQVIsUUFBUSxRQUduQjtBQTBERDs7Ozs7O0dBTUc7QUFDSCxNQUFNLE9BQWdCLE9BQU87Q0FvQjVCO0FBRUQsTUFBTSxPQUFnQixZQUFZO0NBU2pDIn0=