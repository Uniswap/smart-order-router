import { Currency, CurrencyAmount, Token } from '@uniswap/sdk-core';
import { Route as RouteRaw } from '@uniswap/v3-sdk';

export class Route extends RouteRaw<Currency, Currency> {}

export type RouteQuote = {
  route: Route;
  quote: CurrencyAmount;
};

export enum RouteType {
  EXACT_IN,
  EXACT_OUT,
}
export interface IRouter {
  routeExactIn(
    tokenIn: Token,
    tokenOut: Token,
    amountIn: CurrencyAmount
  ): Promise<RouteQuote | null>;

  routeExactOut(
    tokenIn: Token,
    tokenOut: Token,
    amountOut: CurrencyAmount
  ): Promise<RouteQuote | null>;
}
