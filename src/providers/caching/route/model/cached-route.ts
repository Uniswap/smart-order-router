import { Protocol } from '@uniswap/router-sdk';

import { MixedRoute, V2Route, V3Route } from '../../../../routers';

/**
 * Class defining the route to cache
 *
 * @export
 * @class CachedRoute
 */
export class CachedRoute<Route extends V3Route | V2Route | MixedRoute> {
  public route: Route;
  public percent: number;

  constructor(
    route: Route,
    percent: number,
  ) {
    this.route = route;
    this.percent = percent;
  }

  public protocol(): Protocol {
    return this.route.protocol;
  }

  public chainId(): number {
    return this.route.input.chainId;
  }

  public tokenIn(): string {
    return this.route.input.address;
  }

  public tokenOut(): string {
    return this.route.output.address;
  }
}