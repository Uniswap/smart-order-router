"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CachedRoute = void 0;
const router_sdk_1 = require("@uniswap/router-sdk");
const v3_sdk_1 = require("@uniswap/v3-sdk");
/**
 * Class defining the route to cache
 *
 * @export
 * @class CachedRoute
 */
class CachedRoute {
    /**
     * @param route
     * @param percent
     */
    constructor({ route, percent }) {
        // Hashing function copying the same implementation as Java's `hashCode`
        // Sourced from: https://gist.github.com/hyamamoto/fd435505d29ebfa3d9716fd2be8d42f0?permalink_comment_id=4613539#gistcomment-4613539
        this.hashCode = (str) => [...str].reduce((s, c) => (Math.imul(31, s) + c.charCodeAt(0)) | 0, 0);
        this.route = route;
        this.percent = percent;
    }
    get protocol() {
        return this.route.protocol;
    }
    get tokenIn() {
        return this.route.input;
    }
    get tokenOut() {
        return this.route.output;
    }
    get routePath() {
        if (this.protocol == router_sdk_1.Protocol.V3) {
            const route = this.route;
            return route.pools
                .map((pool) => `[V3]${pool.token0.address}/${pool.token1.address}/${pool.fee}`)
                .join('->');
        }
        else if (this.protocol == router_sdk_1.Protocol.V2) {
            const route = this.route;
            return route.pairs
                .map((pair) => `[V2]${pair.token0.address}/${pair.token1.address}`)
                .join('->');
        }
        else {
            const route = this.route;
            return route.pools
                .map((pool) => {
                if (pool instanceof v3_sdk_1.Pool) {
                    return `[V3]${pool.token0.address}/${pool.token1.address}/${pool.fee}`;
                }
                else {
                    return `[V2]${pool.token0.address}/${pool.token1.address}`;
                }
            })
                .join('->');
        }
    }
    get routeId() {
        return this.hashCode(this.routePath);
    }
}
exports.CachedRoute = CachedRoute;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY2FjaGVkLXJvdXRlLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiLi4vLi4vLi4vLi4vLi4vLi4vc3JjL3Byb3ZpZGVycy9jYWNoaW5nL3JvdXRlL21vZGVsL2NhY2hlZC1yb3V0ZS50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiOzs7QUFBQSxvREFBK0M7QUFFL0MsNENBQXVDO0FBU3ZDOzs7OztHQUtHO0FBQ0gsTUFBYSxXQUFXO0lBUXRCOzs7T0FHRztJQUNILFlBQVksRUFBRSxLQUFLLEVBQUUsT0FBTyxFQUE0QjtRQVR4RCx3RUFBd0U7UUFDeEUsb0lBQW9JO1FBQzVILGFBQVEsR0FBRyxDQUFDLEdBQVcsRUFBRSxFQUFFLENBQ2pDLENBQUMsR0FBRyxHQUFHLENBQUMsQ0FBQyxNQUFNLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxFQUFFLEVBQUUsQ0FBQyxDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsRUFBRSxFQUFFLENBQUMsQ0FBQyxHQUFHLENBQUMsQ0FBQyxVQUFVLENBQUMsQ0FBQyxDQUFDLENBQUMsR0FBRyxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUM7UUFPdkUsSUFBSSxDQUFDLEtBQUssR0FBRyxLQUFLLENBQUM7UUFDbkIsSUFBSSxDQUFDLE9BQU8sR0FBRyxPQUFPLENBQUM7SUFDekIsQ0FBQztJQUVELElBQVcsUUFBUTtRQUNqQixPQUFPLElBQUksQ0FBQyxLQUFLLENBQUMsUUFBUSxDQUFDO0lBQzdCLENBQUM7SUFFRCxJQUFXLE9BQU87UUFDaEIsT0FBTyxJQUFJLENBQUMsS0FBSyxDQUFDLEtBQUssQ0FBQztJQUMxQixDQUFDO0lBRUQsSUFBVyxRQUFRO1FBQ2pCLE9BQU8sSUFBSSxDQUFDLEtBQUssQ0FBQyxNQUFNLENBQUM7SUFDM0IsQ0FBQztJQUVELElBQVcsU0FBUztRQUNsQixJQUFJLElBQUksQ0FBQyxRQUFRLElBQUkscUJBQVEsQ0FBQyxFQUFFLEVBQUU7WUFDaEMsTUFBTSxLQUFLLEdBQUcsSUFBSSxDQUFDLEtBQWdCLENBQUM7WUFDcEMsT0FBTyxLQUFLLENBQUMsS0FBSztpQkFDZixHQUFHLENBQ0YsQ0FBQyxJQUFJLEVBQUUsRUFBRSxDQUNQLE9BQU8sSUFBSSxDQUFDLE1BQU0sQ0FBQyxPQUFPLElBQUksSUFBSSxDQUFDLE1BQU0sQ0FBQyxPQUFPLElBQUksSUFBSSxDQUFDLEdBQUcsRUFBRSxDQUNsRTtpQkFDQSxJQUFJLENBQUMsSUFBSSxDQUFDLENBQUM7U0FDZjthQUFNLElBQUksSUFBSSxDQUFDLFFBQVEsSUFBSSxxQkFBUSxDQUFDLEVBQUUsRUFBRTtZQUN2QyxNQUFNLEtBQUssR0FBRyxJQUFJLENBQUMsS0FBZ0IsQ0FBQztZQUNwQyxPQUFPLEtBQUssQ0FBQyxLQUFLO2lCQUNmLEdBQUcsQ0FBQyxDQUFDLElBQUksRUFBRSxFQUFFLENBQUMsT0FBTyxJQUFJLENBQUMsTUFBTSxDQUFDLE9BQU8sSUFBSSxJQUFJLENBQUMsTUFBTSxDQUFDLE9BQU8sRUFBRSxDQUFDO2lCQUNsRSxJQUFJLENBQUMsSUFBSSxDQUFDLENBQUM7U0FDZjthQUFNO1lBQ0wsTUFBTSxLQUFLLEdBQUcsSUFBSSxDQUFDLEtBQW1CLENBQUM7WUFDdkMsT0FBTyxLQUFLLENBQUMsS0FBSztpQkFDZixHQUFHLENBQUMsQ0FBQyxJQUFJLEVBQUUsRUFBRTtnQkFDWixJQUFJLElBQUksWUFBWSxhQUFJLEVBQUU7b0JBQ3hCLE9BQU8sT0FBTyxJQUFJLENBQUMsTUFBTSxDQUFDLE9BQU8sSUFBSSxJQUFJLENBQUMsTUFBTSxDQUFDLE9BQU8sSUFBSSxJQUFJLENBQUMsR0FBRyxFQUFFLENBQUM7aUJBQ3hFO3FCQUFNO29CQUNMLE9BQU8sT0FBTyxJQUFJLENBQUMsTUFBTSxDQUFDLE9BQU8sSUFBSSxJQUFJLENBQUMsTUFBTSxDQUFDLE9BQU8sRUFBRSxDQUFDO2lCQUM1RDtZQUNILENBQUMsQ0FBQztpQkFDRCxJQUFJLENBQUMsSUFBSSxDQUFDLENBQUM7U0FDZjtJQUNILENBQUM7SUFFRCxJQUFXLE9BQU87UUFDaEIsT0FBTyxJQUFJLENBQUMsUUFBUSxDQUFDLElBQUksQ0FBQyxTQUFTLENBQUMsQ0FBQztJQUN2QyxDQUFDO0NBQ0Y7QUE1REQsa0NBNERDIn0=