import { TPool } from '@uniswap/router-sdk/dist/utils/TPool';
import { Currency, Token } from '@uniswap/sdk-core';
import { Pair } from '@uniswap/v2-sdk';
import { Pool as V3Pool } from '@uniswap/v3-sdk';
import { Pool as V4Pool } from '@uniswap/v4-sdk';

import { getAddressLowerCase } from '../../../util';
import { log } from '../../../util/log';
import { poolToString, routeToString } from '../../../util/routes';
import {
  MixedRoute,
  SupportedRoutes,
  V2Route,
  V3Route,
  V4Route,
} from '../../router';

export function computeAllV4Routes(
  currencyIn: Currency,
  currencyOut: Currency,
  pools: V4Pool[],
  maxHops: number
): V4Route[] {
  return computeAllRoutes<V4Pool, V4Route, Currency>(
    currencyIn,
    currencyOut,
    (route: V4Pool[], currencyIn: Currency, currencyOut: Currency) => {
      return new V4Route(route, currencyIn, currencyOut);
    },
    (pool: V4Pool, currency: Currency) => pool.involvesToken(currency),
    pools,
    maxHops
  );
}

export function computeAllV3Routes(
  tokenIn: Token,
  tokenOut: Token,
  pools: V3Pool[],
  maxHops: number
): V3Route[] {
  return computeAllRoutes<V3Pool, V3Route, Token>(
    tokenIn,
    tokenOut,
    (route: V3Pool[], tokenIn: Token, tokenOut: Token) => {
      return new V3Route(route, tokenIn, tokenOut);
    },
    (pool: V3Pool, token: Token) => pool.involvesToken(token),
    pools,
    maxHops
  );
}

export function computeAllV2Routes(
  tokenIn: Token,
  tokenOut: Token,
  pools: Pair[],
  maxHops: number
): V2Route[] {
  return computeAllRoutes<Pair, V2Route, Token>(
    tokenIn,
    tokenOut,
    (route: Pair[], tokenIn: Token, tokenOut: Token) => {
      return new V2Route(route, tokenIn, tokenOut);
    },
    (pool: Pair, token: Token) => pool.involvesToken(token),
    pools,
    maxHops
  );
}

export function computeAllMixedRoutes(
  currencyIn: Currency,
  currencyOut: Currency,
  parts: TPool[],
  maxHops: number
): MixedRoute[] {
  const routesRaw = computeAllRoutes<TPool, MixedRoute, Currency>(
    currencyIn,
    currencyOut,
    (route: TPool[], currencyIn: Currency, currencyOut: Currency) => {
      return new MixedRoute(route, currencyIn, currencyOut);
    },
    (pool: TPool, currency: Currency) =>
      currency.isNative
        ? (pool as V4Pool).involvesToken(currency)
        : pool.involvesToken(currency),
    parts,
    maxHops
  );
  /// filter out pure v4 and v3 and v2 routes
  return routesRaw.filter((route) => {
    return (
      !route.pools.every((pool) => pool instanceof V4Pool) &&
      !route.pools.every((pool) => pool instanceof V3Pool) &&
      !route.pools.every((pool) => pool instanceof Pair)
    );
  });
}

export function computeAllRoutes<
  TypePool extends TPool,
  TRoute extends SupportedRoutes,
  TCurrency extends Currency
>(
  tokenIn: TCurrency,
  tokenOut: TCurrency,
  buildRoute: (
    route: TypePool[],
    tokenIn: TCurrency,
    tokenOut: TCurrency
  ) => TRoute,
  involvesToken: (pool: TypePool, token: TCurrency) => boolean,
  pools: TypePool[],
  maxHops: number
): TRoute[] {
  const poolsUsed = Array<boolean>(pools.length).fill(false);
  const routes: TRoute[] = [];

  const computeRoutes = (
    tokenIn: TCurrency,
    tokenOut: TCurrency,
    currentRoute: TypePool[],
    poolsUsed: boolean[],
    tokensVisited: Set<string>,
    _previousTokenOut?: TCurrency
  ) => {
    if (currentRoute.length > maxHops) {
      return;
    }

    if (
      currentRoute.length > 0 &&
      involvesToken(currentRoute[currentRoute.length - 1]!, tokenOut)
    ) {
      routes.push(buildRoute([...currentRoute], tokenIn, tokenOut));
      return;
    }

    for (let i = 0; i < pools.length; i++) {
      if (poolsUsed[i]) {
        continue;
      }

      const curPool = pools[i]!;
      const previousTokenOut = _previousTokenOut ? _previousTokenOut : tokenIn;

      if (!involvesToken(curPool, previousTokenOut)) {
        continue;
      }

      const currentTokenOut = curPool.token0.equals(previousTokenOut)
        ? curPool.token1
        : curPool.token0;

      if (tokensVisited.has(getAddressLowerCase(currentTokenOut))) {
        continue;
      }

      tokensVisited.add(getAddressLowerCase(currentTokenOut));
      currentRoute.push(curPool);
      poolsUsed[i] = true;
      computeRoutes(
        tokenIn,
        tokenOut,
        currentRoute,
        poolsUsed,
        tokensVisited,
        currentTokenOut as TCurrency
      );
      poolsUsed[i] = false;
      currentRoute.pop();
      tokensVisited.delete(getAddressLowerCase(currentTokenOut));
    }
  };

  computeRoutes(
    tokenIn,
    tokenOut,
    [],
    poolsUsed,
    new Set([getAddressLowerCase(tokenIn)])
  );

  log.info(
    {
      routes: routes.map(routeToString),
      pools: pools.map(poolToString),
    },
    `Computed ${routes.length} possible routes for type ${routes[0]?.protocol}.`
  );

  return routes;
}
