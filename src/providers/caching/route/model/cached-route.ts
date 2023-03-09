import { Protocol } from '@uniswap/router-sdk';

import { MixedRoute, V2Route, V3Route } from '../../../../routers';

/**
 * Class defining the route to cache
 *
 * @export
 * @class CachedRoute
 */
export class CachedRoute<Route extends V3Route | V2Route | MixedRoute> {
  public readonly route: Route;
  public readonly percent: number;

  constructor(
    route: Route,
    percent: number,
  ) {
    this.route = route;
    this.percent = percent;
  }

  public get protocol(): Protocol {
    return this.route.protocol;
  }
}
