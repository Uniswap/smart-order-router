import { Currency, Token } from '@uniswap/sdk-core';
import { Pair } from '@uniswap/v2-sdk';
import { Pool as V3Pool } from '@uniswap/v3-sdk';
import { Pool as V4Pool } from '@uniswap/v4-sdk';

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
  tokenIn: Currency,
  tokenOut: Currency,
  pools: V4Pool[],
  maxHops: number
): V4Route[] {
  // TODO: ROUTE-217 - Support native currency routing in V4
  return computeAllRoutes<V4Pool, V4Route>(
    tokenIn.wrapped,
    tokenOut.wrapped,
    (route: V4Pool[], tokenIn: Currency, tokenOut: Currency) => {
      return new V4Route(route, tokenIn, tokenOut);
    },
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
  return computeAllRoutes<V3Pool, V3Route>(
    tokenIn,
    tokenOut,
    (route: V3Pool[], tokenIn: Token, tokenOut: Token) => {
      return new V3Route(route, tokenIn, tokenOut);
    },
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
  return computeAllRoutes<Pair, V2Route>(
    tokenIn,
    tokenOut,
    (route: Pair[], tokenIn: Token, tokenOut: Token) => {
      return new V2Route(route, tokenIn, tokenOut);
    },
    pools,
    maxHops
  );
}

export function computeAllMixedRoutes(
  tokenIn: Token,
  tokenOut: Token,
  parts: (V3Pool | Pair)[],
  maxHops: number
): MixedRoute[] {
  const routesRaw = computeAllRoutes<V3Pool | Pair, MixedRoute>(
    tokenIn,
    tokenOut,
    (route: (V3Pool | Pair)[], tokenIn: Token, tokenOut: Token) => {
      return new MixedRoute(route, tokenIn, tokenOut);
    },
    parts,
    maxHops
  );
  /// filter out pure v3 and v2 routes
  return routesRaw.filter((route) => {
    return (
      !route.pools.every((pool) => pool instanceof V3Pool) &&
      !route.pools.every((pool) => pool instanceof Pair)
    );
  });
}

export function computeAllRoutes<
  TPool extends Pair | V3Pool | V4Pool,
  TRoute extends SupportedRoutes
>(
  tokenIn: Token,
  tokenOut: Token,
  buildRoute: (route: TPool[], tokenIn: Token, tokenOut: Token) => TRoute,
  pools: TPool[],
  maxHops: number
): TRoute[] {
  const poolsUsed = Array<boolean>(pools.length).fill(false);
  const routes: TRoute[] = [];

  const computeRoutes = (
    tokenIn: Token,
    tokenOut: Token,
    currentRoute: TPool[],
    poolsUsed: boolean[],
    tokensVisited: Set<string>,
    _previousTokenOut?: Token
  ) => {
    if (currentRoute.length > maxHops) {
      return;
    }

    if (
      currentRoute.length > 0 &&
      currentRoute[currentRoute.length - 1]!.involvesToken(tokenOut)
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

      if (!curPool.involvesToken(previousTokenOut)) {
        continue;
      }

      const currentTokenOut = curPool.token0.equals(previousTokenOut)
        ? curPool.token1
        : curPool.token0;

      // TODO: ROUTE-217 - Support native currency routing in V4
      if (tokensVisited.has(currentTokenOut.wrapped.address.toLowerCase())) {
        continue;
      }

      tokensVisited.add(currentTokenOut.wrapped.address.toLowerCase());
      currentRoute.push(curPool);
      poolsUsed[i] = true;
      computeRoutes(
        tokenIn,
        tokenOut,
        currentRoute,
        poolsUsed,
        tokensVisited,
        currentTokenOut.wrapped
      );
      poolsUsed[i] = false;
      currentRoute.pop();
      tokensVisited.delete(currentTokenOut.wrapped.address.toLowerCase());
    }
  };

  computeRoutes(
    tokenIn,
    tokenOut,
    [],
    poolsUsed,
    new Set([tokenIn.address.toLowerCase()])
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
