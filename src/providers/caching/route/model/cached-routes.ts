import { Protocol } from '@uniswap/router-sdk';
import { TradeType } from '@uniswap/sdk-core';
import _ from 'lodash';

import { MixedRoute, RouteWithValidQuote, V2Route, V3Route } from '../../../../routers';

import { CachedRoute } from './cached-route';

/**
 * Class defining the route to cache
 *
 * @export
 * @class CachedRoute
 */
export class CachedRoutes {
  public routes: CachedRoute<V3Route | V2Route | MixedRoute>[];
  public protocolsCovered: Protocol[];
  public blockNumber: number;
  public tradeType: TradeType;

  constructor(
    routes: CachedRoute<V3Route | V2Route | MixedRoute>[],
    protocolsCovered: Protocol[],
    blockNumber: number,
    tradeType: TradeType
  ) {
    this.routes = routes;
    this.protocolsCovered = protocolsCovered;
    this.blockNumber = blockNumber;
    this.tradeType = tradeType;
  }

  public static fromRoutesWithValidQuotes(
    routes: RouteWithValidQuote[],
    protocolsCovered: Protocol[],
    blockNumber: number,
    tradeType: TradeType
  ): CachedRoutes {
    const cachedRoutes = _.map(routes, (route: RouteWithValidQuote) =>
      new CachedRoute(route.route, route.percent)
    );

    return new CachedRoutes(cachedRoutes, protocolsCovered, blockNumber, tradeType);
  }
}