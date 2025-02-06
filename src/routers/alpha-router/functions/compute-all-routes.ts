import { TPool } from '@uniswap/router-sdk/dist/utils/TPool';
import { ChainId, Currency, Token } from '@uniswap/sdk-core';
import { Pair } from '@uniswap/v2-sdk';
import { Pool as V3Pool } from '@uniswap/v3-sdk';
import { Pool as V4Pool } from '@uniswap/v4-sdk';

import { getAddressLowerCase, nativeOnChain } from '../../../util';
import { log } from '../../../util/log';
import { V4_ETH_WETH_FAKE_POOL } from '../../../util/pool';
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
  // only add fake v4 pool, if we see there's a native v4 pool in the candidate pool
  const containsV4NativePools =
    parts.filter(
      (pool) =>
        pool instanceof V4Pool &&
        pool.v4InvolvesToken(nativeOnChain(currencyIn.chainId))
    ).length > 0;
  const amendedPools = containsV4NativePools
    ? parts.concat(V4_ETH_WETH_FAKE_POOL[currencyIn.chainId as ChainId])
    : parts;
  // NOTE: we added a fake v4 pool, in order for mixed route to connect the v3 weth pool with v4 eth pool
  const routesRaw = computeAllRoutes<TPool, MixedRoute, Currency>(
    currencyIn,
    currencyOut,
    (route: TPool[], currencyIn: Currency, currencyOut: Currency) => {
      // we only retake the fake v4 pool if the route contains a native v4 pool
      return new MixedRoute(
        route,
        currencyIn,
        currencyOut,
        containsV4NativePools
      );
    },
    (pool: TPool, currency: Currency) => {
      return currency.isNative
        ? (pool as V4Pool).involvesToken(currency)
        : pool.involvesToken(currency);
    },
    amendedPools,
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
    const currentRouteContainsFakeV4Pool =
      currentRoute.filter(
        (pool) =>
          pool instanceof V4Pool &&
          pool.tickSpacing ===
            V4_ETH_WETH_FAKE_POOL[tokenIn.chainId as ChainId].tickSpacing
      ).length > 0;
    const amendedMaxHops = currentRouteContainsFakeV4Pool
      ? maxHops + 1
      : maxHops;

    // amendedMaxHops is the maxHops + 1 if the current route contains a fake v4 pool
    // b/c we want to allow the route to go through the fake v4 pool
    // also gas wise, if a route goes through the fake v4 pool, mixed quoter will add the wrap/unwrap gas cost:
    // https://github.com/Uniswap/mixed-quoter/pull/41/files#diff-a4d1289f264d1da22aac20cc55a9d01c8ba9cccd76ce1af8f952ec9034e7e1aaR189
    // and SOR will use the gas cost from the mixed quoter:
    // https://github.com/Uniswap/smart-order-router/blob/17da523f1af050e6430afb866d96681346c8fb8b/src/routers/alpha-router/gas-models/mixedRoute/mixed-route-heuristic-gas-model.ts#L222
    if (currentRoute.length > amendedMaxHops) {
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
