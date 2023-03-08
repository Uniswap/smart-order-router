import { Protocol } from '@uniswap/router-sdk';

import { MixedRoute, V2Route, V3Route } from '../../../../routers';

/**
 * Class defining the route to cache
 *
 * @export
 * @class CachedRoute
 */
export class CachedRoute<Route extends V3Route | V2Route | MixedRoute> {
  private readonly _route: Route;
  private readonly _percent: number;

  constructor(
    route: Route,
    percent: number,
  ) {
    this._route = route;
    this._percent = percent;
  }

  public get route(): Route {
    return this._route;
  }

  public get percent(): number {
    return this._percent;
  }

  public get protocol(): Protocol {
    return this.route.protocol;
  }
}