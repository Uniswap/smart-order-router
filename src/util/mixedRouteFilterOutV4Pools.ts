import { Pool as V4Pool } from '@uniswap/v4-sdk';

import { MixedRoute } from '../routers';

export function mixedRouteContainsV4Pools(route: MixedRoute): boolean {
  return route.pools.some((pool) => {
    return pool instanceof V4Pool;
  });
}

export function mixedRouteFilterOutV4Pools(routes: MixedRoute[]): MixedRoute[] {
  return routes.filter((route) => {
    return !mixedRouteContainsV4Pools(route);
  });
}
