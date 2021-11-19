import { Token } from '@uniswap/sdk-core';
import { Pair } from '@uniswap/v2-sdk';
import { Pool } from '@uniswap/v3-sdk';
import { log } from '../../../util/log';
import { routeToString } from '../../../util/routes';
import { V2Route, V3Route } from '../../router';

export function computeAllV3Routes(
  tokenIn: Token,
  tokenOut: Token,
  pools: Pool[],
  maxHops: number
): V3Route[] {
  return computeAllRoutes<Pool, V3Route>(
    tokenIn,
    tokenOut,
    (route: Pool[], tokenIn: Token, tokenOut: Token) => {
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

export function computeAllRoutes<
  TPool extends Pair | Pool,
  TRoute extends V3Route | V2Route
>(
  tokenIn: Token,
  tokenOut: Token,
  buildRoute: (route: TPool[], tokenIn: Token, tokenOut: Token) => TRoute,
  pools: TPool[],
  maxHops: number
): TRoute[] {
  const poolsUsed = Array<Boolean>(pools.length).fill(false);
  const routes: TRoute[] = [];

  const computeRoutes = (
    tokenIn: Token,
    tokenOut: Token,
    currentRoute: TPool[],
    poolsUsed: Boolean[],
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

      currentRoute.push(curPool);
      poolsUsed[i] = true;
      computeRoutes(
        tokenIn,
        tokenOut,
        currentRoute,
        poolsUsed,
        currentTokenOut
      );
      poolsUsed[i] = false;
      currentRoute.pop();
    }
  };

  computeRoutes(tokenIn, tokenOut, [], poolsUsed);

  log.info(
    { routes: routes.map(routeToString) },
    `Computed ${routes.length} possible routes.`
  );

  return routes;
}
