import { Protocol } from '@uniswap/router-sdk';
import { Token, TradeType } from '@uniswap/sdk-core';
import _ from 'lodash';

import { MixedRoute, RouteWithValidQuote, V2Route, V3Route } from '../../../../routers';
import { ChainId } from '../../../../util';

import { CachedRoute } from './cached-route';

/**
 * Class defining the route to cache
 *
 * @export
 * @class CachedRoute
 */
export class CachedRoutes {
  public readonly routes: CachedRoute<V3Route | V2Route | MixedRoute>[];
  public readonly chainId: ChainId;
  public readonly tokenIn: Token;
  public readonly tokenOut: Token;
  public readonly protocolsCovered: Protocol[];
  public readonly blockNumber: number;
  public readonly tradeType: TradeType;

  public blocksToLive = 0;

  private constructor(
    routes: CachedRoute<V3Route | V2Route | MixedRoute>[],
    chainId: ChainId,
    tokenIn: Token,
    tokenOut: Token,
    protocolsCovered: Protocol[],
    blockNumber: number,
    tradeType: TradeType,
  ) {
    this.routes = routes;
    this.chainId = chainId;
    this.tokenIn = tokenIn;
    this.tokenOut = tokenOut;
    this.protocolsCovered = protocolsCovered;
    this.blockNumber = blockNumber;
    this.tradeType = tradeType;
  }

  /**
   * Factory method that creates a `CachedRoutes` object from an array of RouteWithValidQuote.
   *
   * @public
   * @static
   * @param routes
   * @param chainId
   * @param tokenIn
   * @param tokenOut
   * @param protocolsCovered
   * @param blockNumber
   * @param tradeType
   */
  public static fromRoutesWithValidQuotes(
    routes: RouteWithValidQuote[],
    chainId: ChainId,
    tokenIn: Token,
    tokenOut: Token,
    protocolsCovered: Protocol[],
    blockNumber: number,
    tradeType: TradeType,
  ): CachedRoutes | undefined {
    if (routes.length == 0) return undefined;

    const cachedRoutes = _.map(routes, (route: RouteWithValidQuote) =>
      new CachedRoute(route.route, route.percent)
    );

    return new CachedRoutes(cachedRoutes, chainId, tokenIn, tokenOut, protocolsCovered, blockNumber, tradeType);
  }

  /**
   * Function to determine if, given a block number, the CachedRoute is expired or not.
   *
   * @param currentBlockNumber
   */
  public notExpired(currentBlockNumber: number): boolean {
    return (currentBlockNumber - this.blockNumber) <= this.blocksToLive;
  }
}
