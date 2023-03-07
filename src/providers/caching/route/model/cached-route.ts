import { Protocol } from '@uniswap/router-sdk';
import { Token } from '@uniswap/sdk-core';

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

  public get chainId(): number {
    return this.route.input.chainId;
  }

  public get tokenIn(): Token {
    return this.route.input;
  }

  public get tokenOut(): Token {
    return this.route.output;
  }

  public get tokenPairSymbol(): string {
    return `${this.tokenIn.symbol}/${this.tokenOut.symbol}`;
  }

  public get tokenPairSymbolChainId(): string {
    return `${this.tokenPairSymbol}/${this.chainId}`;
  }
}