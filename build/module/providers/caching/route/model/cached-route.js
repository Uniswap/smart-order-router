import { Protocol } from '@uniswap/router-sdk';
import { Pool } from '@uniswap/v3-sdk';
/**
 * Class defining the route to cache
 *
 * @export
 * @class CachedRoute
 */
export class CachedRoute {
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
        if (this.protocol == Protocol.V3) {
            const route = this.route;
            return route.pools
                .map((pool) => `[V3]${pool.token0.address}/${pool.token1.address}/${pool.fee}`)
                .join('->');
        }
        else if (this.protocol == Protocol.V2) {
            const route = this.route;
            return route.pairs
                .map((pair) => `[V2]${pair.token0.address}/${pair.token1.address}`)
                .join('->');
        }
        else {
            const route = this.route;
            return route.pools
                .map((pool) => {
                if (pool instanceof Pool) {
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY2FjaGVkLXJvdXRlLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiLi4vLi4vLi4vLi4vLi4vLi4vc3JjL3Byb3ZpZGVycy9jYWNoaW5nL3JvdXRlL21vZGVsL2NhY2hlZC1yb3V0ZS50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQSxPQUFPLEVBQUUsUUFBUSxFQUFFLE1BQU0scUJBQXFCLENBQUM7QUFFL0MsT0FBTyxFQUFFLElBQUksRUFBRSxNQUFNLGlCQUFpQixDQUFDO0FBU3ZDOzs7OztHQUtHO0FBQ0gsTUFBTSxPQUFPLFdBQVc7SUFRdEI7OztPQUdHO0lBQ0gsWUFBWSxFQUFFLEtBQUssRUFBRSxPQUFPLEVBQTRCO1FBVHhELHdFQUF3RTtRQUN4RSxvSUFBb0k7UUFDNUgsYUFBUSxHQUFHLENBQUMsR0FBVyxFQUFFLEVBQUUsQ0FDakMsQ0FBQyxHQUFHLEdBQUcsQ0FBQyxDQUFDLE1BQU0sQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDLEVBQUUsRUFBRSxDQUFDLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxFQUFFLEVBQUUsQ0FBQyxDQUFDLEdBQUcsQ0FBQyxDQUFDLFVBQVUsQ0FBQyxDQUFDLENBQUMsQ0FBQyxHQUFHLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQztRQU92RSxJQUFJLENBQUMsS0FBSyxHQUFHLEtBQUssQ0FBQztRQUNuQixJQUFJLENBQUMsT0FBTyxHQUFHLE9BQU8sQ0FBQztJQUN6QixDQUFDO0lBRUQsSUFBVyxRQUFRO1FBQ2pCLE9BQU8sSUFBSSxDQUFDLEtBQUssQ0FBQyxRQUFRLENBQUM7SUFDN0IsQ0FBQztJQUVELElBQVcsT0FBTztRQUNoQixPQUFPLElBQUksQ0FBQyxLQUFLLENBQUMsS0FBSyxDQUFDO0lBQzFCLENBQUM7SUFFRCxJQUFXLFFBQVE7UUFDakIsT0FBTyxJQUFJLENBQUMsS0FBSyxDQUFDLE1BQU0sQ0FBQztJQUMzQixDQUFDO0lBRUQsSUFBVyxTQUFTO1FBQ2xCLElBQUksSUFBSSxDQUFDLFFBQVEsSUFBSSxRQUFRLENBQUMsRUFBRSxFQUFFO1lBQ2hDLE1BQU0sS0FBSyxHQUFHLElBQUksQ0FBQyxLQUFnQixDQUFDO1lBQ3BDLE9BQU8sS0FBSyxDQUFDLEtBQUs7aUJBQ2YsR0FBRyxDQUNGLENBQUMsSUFBSSxFQUFFLEVBQUUsQ0FDUCxPQUFPLElBQUksQ0FBQyxNQUFNLENBQUMsT0FBTyxJQUFJLElBQUksQ0FBQyxNQUFNLENBQUMsT0FBTyxJQUFJLElBQUksQ0FBQyxHQUFHLEVBQUUsQ0FDbEU7aUJBQ0EsSUFBSSxDQUFDLElBQUksQ0FBQyxDQUFDO1NBQ2Y7YUFBTSxJQUFJLElBQUksQ0FBQyxRQUFRLElBQUksUUFBUSxDQUFDLEVBQUUsRUFBRTtZQUN2QyxNQUFNLEtBQUssR0FBRyxJQUFJLENBQUMsS0FBZ0IsQ0FBQztZQUNwQyxPQUFPLEtBQUssQ0FBQyxLQUFLO2lCQUNmLEdBQUcsQ0FBQyxDQUFDLElBQUksRUFBRSxFQUFFLENBQUMsT0FBTyxJQUFJLENBQUMsTUFBTSxDQUFDLE9BQU8sSUFBSSxJQUFJLENBQUMsTUFBTSxDQUFDLE9BQU8sRUFBRSxDQUFDO2lCQUNsRSxJQUFJLENBQUMsSUFBSSxDQUFDLENBQUM7U0FDZjthQUFNO1lBQ0wsTUFBTSxLQUFLLEdBQUcsSUFBSSxDQUFDLEtBQW1CLENBQUM7WUFDdkMsT0FBTyxLQUFLLENBQUMsS0FBSztpQkFDZixHQUFHLENBQUMsQ0FBQyxJQUFJLEVBQUUsRUFBRTtnQkFDWixJQUFJLElBQUksWUFBWSxJQUFJLEVBQUU7b0JBQ3hCLE9BQU8sT0FBTyxJQUFJLENBQUMsTUFBTSxDQUFDLE9BQU8sSUFBSSxJQUFJLENBQUMsTUFBTSxDQUFDLE9BQU8sSUFBSSxJQUFJLENBQUMsR0FBRyxFQUFFLENBQUM7aUJBQ3hFO3FCQUFNO29CQUNMLE9BQU8sT0FBTyxJQUFJLENBQUMsTUFBTSxDQUFDLE9BQU8sSUFBSSxJQUFJLENBQUMsTUFBTSxDQUFDLE9BQU8sRUFBRSxDQUFDO2lCQUM1RDtZQUNILENBQUMsQ0FBQztpQkFDRCxJQUFJLENBQUMsSUFBSSxDQUFDLENBQUM7U0FDZjtJQUNILENBQUM7SUFFRCxJQUFXLE9BQU87UUFDaEIsT0FBTyxJQUFJLENBQUMsUUFBUSxDQUFDLElBQUksQ0FBQyxTQUFTLENBQUMsQ0FBQztJQUN2QyxDQUFDO0NBQ0YifQ==