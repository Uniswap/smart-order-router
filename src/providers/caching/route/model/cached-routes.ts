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
  private readonly _routes: CachedRoute<V3Route | V2Route | MixedRoute>[];
  private readonly _chainId: ChainId;
  private readonly _tokenIn: Token;
  private readonly _tokenOut: Token;
  private readonly _protocolsCovered: Protocol[];
  private readonly _blockNumber: number;
  private _blocksToLive = 0;
  private readonly _tradeType: TradeType;

  private constructor(
    routes: CachedRoute<V3Route | V2Route | MixedRoute>[],
    chainId: ChainId,
    tokenIn: Token,
    tokenOut: Token,
    protocolsCovered: Protocol[],
    blockNumber: number,
    tradeType: TradeType,
  ) {
    this._routes = routes;
    this._chainId = chainId;
    this._tokenIn = tokenIn;
    this._tokenOut = tokenOut;
    this._protocolsCovered = protocolsCovered;
    this._blockNumber = blockNumber;
    this._tradeType = tradeType;
  }

  public get routes(): CachedRoute<V3Route | V2Route | MixedRoute>[] {
    return this._routes;
  }

  public get chainId(): ChainId {
    return this._chainId;
  }

  public get tokenIn(): Token {
    return this._tokenIn;
  }

  public get tokenOut(): Token {
    return this._tokenOut;
  }

  public get protocolsCovered(): Protocol[] {
    return this._protocolsCovered;
  }

  public get blockNumber(): number {
    return this._blockNumber;
  }

  public get tradeType(): TradeType {
    return this._tradeType;
  }

  public get blocksToLive(): number {
    return this._blocksToLive;
  }

  public set blocksToLive(blocksToLive: number) {
    this._blocksToLive = blocksToLive;
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