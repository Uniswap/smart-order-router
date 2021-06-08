import { Currency, Token } from '@uniswap/sdk-core';
import { Route as RouteRaw } from '@uniswap/v3-sdk';
import { CurrencyAmount } from '../util/amounts';

export class Route extends RouteRaw<Currency, Currency> {}

export type RouteAmount = {
  route: Route;
  amount: CurrencyAmount;
  percentage: number;
};

export type SwapRoute = {
  quote: CurrencyAmount;
  quoteGasAdjusted: CurrencyAmount;
  routeAmounts: RouteAmount[];
};

export type SwapRoutes = {
  raw: SwapRoute;
  gasAdjusted?: SwapRoute;
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
  ): Promise<SwapRoutes | null>;

  routeExactOut(
    tokenIn: Token,
    tokenOut: Token,
    amountOut: CurrencyAmount
  ): Promise<SwapRoutes | null>;
}
