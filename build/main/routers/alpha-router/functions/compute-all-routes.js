"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.computeAllRoutes = exports.computeAllMixedRoutes = exports.computeAllV2Routes = exports.computeAllV3Routes = void 0;
const v2_sdk_1 = require("@uniswap/v2-sdk");
const v3_sdk_1 = require("@uniswap/v3-sdk");
const log_1 = require("../../../util/log");
const routes_1 = require("../../../util/routes");
const router_1 = require("../../router");
function computeAllV3Routes(tokenIn, tokenOut, pools, maxHops) {
    return computeAllRoutes(tokenIn, tokenOut, (route, tokenIn, tokenOut) => {
        return new router_1.V3Route(route, tokenIn, tokenOut);
    }, pools, maxHops);
}
exports.computeAllV3Routes = computeAllV3Routes;
function computeAllV2Routes(tokenIn, tokenOut, pools, maxHops) {
    return computeAllRoutes(tokenIn, tokenOut, (route, tokenIn, tokenOut) => {
        return new router_1.V2Route(route, tokenIn, tokenOut);
    }, pools, maxHops);
}
exports.computeAllV2Routes = computeAllV2Routes;
function computeAllMixedRoutes(tokenIn, tokenOut, parts, maxHops) {
    const routesRaw = computeAllRoutes(tokenIn, tokenOut, (route, tokenIn, tokenOut) => {
        return new router_1.MixedRoute(route, tokenIn, tokenOut);
    }, parts, maxHops);
    /// filter out pure v3 and v2 routes
    return routesRaw.filter((route) => {
        return (!route.pools.every((pool) => pool instanceof v3_sdk_1.Pool) &&
            !route.pools.every((pool) => pool instanceof v2_sdk_1.Pair));
    });
}
exports.computeAllMixedRoutes = computeAllMixedRoutes;
function computeAllRoutes(tokenIn, tokenOut, buildRoute, pools, maxHops) {
    var _a;
    const poolsUsed = Array(pools.length).fill(false);
    const routes = [];
    const computeRoutes = (tokenIn, tokenOut, currentRoute, poolsUsed, tokensVisited, _previousTokenOut) => {
        if (currentRoute.length > maxHops) {
            return;
        }
        if (currentRoute.length > 0 &&
            currentRoute[currentRoute.length - 1].involvesToken(tokenOut)) {
            routes.push(buildRoute([...currentRoute], tokenIn, tokenOut));
            return;
        }
        for (let i = 0; i < pools.length; i++) {
            if (poolsUsed[i]) {
                continue;
            }
            const curPool = pools[i];
            const previousTokenOut = _previousTokenOut ? _previousTokenOut : tokenIn;
            if (!curPool.involvesToken(previousTokenOut)) {
                continue;
            }
            const currentTokenOut = curPool.token0.equals(previousTokenOut)
                ? curPool.token1
                : curPool.token0;
            if (tokensVisited.has(currentTokenOut.address.toLowerCase())) {
                continue;
            }
            tokensVisited.add(currentTokenOut.address.toLowerCase());
            currentRoute.push(curPool);
            poolsUsed[i] = true;
            computeRoutes(tokenIn, tokenOut, currentRoute, poolsUsed, tokensVisited, currentTokenOut);
            poolsUsed[i] = false;
            currentRoute.pop();
            tokensVisited.delete(currentTokenOut.address.toLowerCase());
        }
    };
    computeRoutes(tokenIn, tokenOut, [], poolsUsed, new Set([tokenIn.address.toLowerCase()]));
    log_1.log.info({
        routes: routes.map(routes_1.routeToString),
        pools: pools.map(routes_1.poolToString),
    }, `Computed ${routes.length} possible routes for type ${(_a = routes[0]) === null || _a === void 0 ? void 0 : _a.protocol}.`);
    return routes;
}
exports.computeAllRoutes = computeAllRoutes;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY29tcHV0ZS1hbGwtcm91dGVzLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiLi4vLi4vLi4vLi4vLi4vc3JjL3JvdXRlcnMvYWxwaGEtcm91dGVyL2Z1bmN0aW9ucy9jb21wdXRlLWFsbC1yb3V0ZXMudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7O0FBQ0EsNENBQXVDO0FBQ3ZDLDRDQUF1QztBQUV2QywyQ0FBd0M7QUFDeEMsaURBQW1FO0FBQ25FLHlDQUE0RDtBQUU1RCxTQUFnQixrQkFBa0IsQ0FDaEMsT0FBYyxFQUNkLFFBQWUsRUFDZixLQUFhLEVBQ2IsT0FBZTtJQUVmLE9BQU8sZ0JBQWdCLENBQ3JCLE9BQU8sRUFDUCxRQUFRLEVBQ1IsQ0FBQyxLQUFhLEVBQUUsT0FBYyxFQUFFLFFBQWUsRUFBRSxFQUFFO1FBQ2pELE9BQU8sSUFBSSxnQkFBTyxDQUFDLEtBQUssRUFBRSxPQUFPLEVBQUUsUUFBUSxDQUFDLENBQUM7SUFDL0MsQ0FBQyxFQUNELEtBQUssRUFDTCxPQUFPLENBQ1IsQ0FBQztBQUNKLENBQUM7QUFmRCxnREFlQztBQUVELFNBQWdCLGtCQUFrQixDQUNoQyxPQUFjLEVBQ2QsUUFBZSxFQUNmLEtBQWEsRUFDYixPQUFlO0lBRWYsT0FBTyxnQkFBZ0IsQ0FDckIsT0FBTyxFQUNQLFFBQVEsRUFDUixDQUFDLEtBQWEsRUFBRSxPQUFjLEVBQUUsUUFBZSxFQUFFLEVBQUU7UUFDakQsT0FBTyxJQUFJLGdCQUFPLENBQUMsS0FBSyxFQUFFLE9BQU8sRUFBRSxRQUFRLENBQUMsQ0FBQztJQUMvQyxDQUFDLEVBQ0QsS0FBSyxFQUNMLE9BQU8sQ0FDUixDQUFDO0FBQ0osQ0FBQztBQWZELGdEQWVDO0FBRUQsU0FBZ0IscUJBQXFCLENBQ25DLE9BQWMsRUFDZCxRQUFlLEVBQ2YsS0FBc0IsRUFDdEIsT0FBZTtJQUVmLE1BQU0sU0FBUyxHQUFHLGdCQUFnQixDQUNoQyxPQUFPLEVBQ1AsUUFBUSxFQUNSLENBQUMsS0FBc0IsRUFBRSxP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