import { Protocol } from '@uniswap/router-sdk';
import { Token } from '@uniswap/sdk-core';
import { Pool } from '@uniswap/v3-sdk';

import { MixedRoute, V2Route, V3Route } from '../../../../routers';

interface CachedRouteParams<Route extends V3Route | V2Route | MixedRoute> {
  route: Route;
  percent: number;
}

/**
 * Class defining the route to cache
 *
 * @export
 * @class CachedRoute
 */
export class CachedRoute<Route extends V3Route | V2Route | MixedRoute> {
  public readonly route: Route;
  public readonly percent: number;
  // Helper function used to generate the routeId
  private hashCode = (str: string) => [...str].reduce((s, c) => Math.imul(31, s) + c.charCodeAt(0) | 0, 0);

  /**
   * @param route
   * @param percent
   */
  constructor({ route, percent }: CachedRouteParams<Route>) {
    this.route = route;
    this.percent = percent;
  }

  public get protocol(): Protocol {
    return this.route.protocol;
  }

  public get tokenIn(): Token {
    return this.route.input;
  }

  public get tokenOut(): Token {
    return this.route.output;
  }

  public get routePath(): string {
    if (this.protocol == Protocol.V3) {
      const route = this.route as V3Route;
      return route.pools.map(pool => `${pool.token0.address}/${pool.token1.address}/${pool.fee}`).join('->');
    } else if (this.protocol == Protocol.V2) {
      const route = this.route as V2Route;
      return route.path.map(token => token.address).join('->');
    } else {
      const route = this.route as MixedRoute;
      return route.pools.map(pool => {
        if (pool instanceof Pool) {
          return `[V3]${pool.token0.address}/${pool.token1.address}/${pool.fee}`;
        } else {
          return `[V2]${pool.token0.address}/${pool.token1.address}`;
        }
      }).join('->');
    }
  }

  public get routeId(): number {
    return this.hashCode(this.routePath);
  }
}
