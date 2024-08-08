import { ADDRESS_ZERO, Protocol } from '@uniswap/router-sdk';
import { Currency, Percent } from '@uniswap/sdk-core';
import { Pair } from '@uniswap/v2-sdk';
import { Pool as V3Pool } from '@uniswap/v3-sdk';
import { Pool as V4Pool } from '@uniswap/v4-sdk';
import _ from 'lodash';

import { RouteWithValidQuote } from '../routers/alpha-router';
import { SupportedRoutes } from '../routers/router';

import { V3_CORE_FACTORY_ADDRESSES } from './addresses';

import { CurrencyAmount } from '.';

export const routeToTokens = (
  route: SupportedRoutes
): Currency[] => {
  switch (route.protocol) {
    case Protocol.V4:
      return route.currencyPath
    case Protocol.V3:
      return route.tokenPath
    case Protocol.V2:
    case Protocol.MIXED:
      return route.path
    default:
      throw new Error(`Unsupported route ${JSON.stringify(route)}`)
  }
}

export const routeToPools = (
  route: SupportedRoutes
): (V4Pool | V3Pool | Pair)[] => {
  switch (route.protocol) {
    case Protocol.V4:
    case Protocol.V3:
    case Protocol.MIXED:
      return route.pools
    case Protocol.V2:
      return route.pairs
    default:
      throw new Error(`Unsupported route ${JSON.stringify(route)}`)
  }
}

export const poolToString = (
  pool: V4Pool | V3Pool | Pair
): string => {
  if (pool instanceof V4Pool) {
    return ` -- ${pool.fee / 10000}% [${V4Pool.getPoolId(
      pool.token0,
      pool.token1,
      pool.fee,
      0,
      ADDRESS_ZERO
    )}]`
  } else if (pool instanceof V3Pool) {
    return ` -- ${pool.fee / 10000}% [${V3Pool.getAddress(
      pool.token0,
      pool.token1,
      pool.fee,
      undefined,
      V3_CORE_FACTORY_ADDRESSES[pool.chainId]
    )}]`
  } else if (pool instanceof Pair) {
    return ` -- [${Pair.getAddress(
      (pool as Pair).token0,
      (pool as Pair).token1
    )}]`
  } else {
    throw new Error(`Unsupported pool ${JSON.stringify(pool)}`)
  }
}

export const routeToString = (
  route: SupportedRoutes
): string => {
  const routeStr = [];
  const tokens = routeToTokens(route);
  const tokenPath = _.map(tokens, (token) => `${token.symbol}`);
  const pools = routeToPools(route);
  const poolFeePath = _.map(pools, (pool) => {
    if (pool instanceof Pair) {
      return ` -- [${Pair.getAddress(
        (pool as Pair).token0,
        (pool as Pair).token1
      )}]`;
    } else if (pool instanceof V3Pool) {
      return ` -- ${pool.fee / 10000}% [${V3Pool.getAddress(
        pool.token0,
        pool.token1,
        pool.fee,
        undefined,
        V3_CORE_FACTORY_ADDRESSES[pool.chainId]
      )}]`;
    } else if (pool instanceof V4Pool) {
      return ` -- ${pool.fee / 10000}% [${V4Pool.getPoolId(
        pool.token0,
        pool.token1,
        pool.fee,
        0,
        ADDRESS_ZERO
      )}]`;
    } else {
      throw new Error(`Unsupported pool ${JSON.stringify(pool)}`);
    }

    return `${poolToString(pool)} --> `;
  });

  for (let i = 0; i < tokenPath.length; i++) {
    routeStr.push(tokenPath[i]);
    if (i < poolFeePath.length) {
      routeStr.push(poolFeePath[i]);
    }
  }

  return routeStr.join('');
};

export const routeAmountsToString = (
  routeAmounts: RouteWithValidQuote[]
): string => {
  const total = _.reduce(
    routeAmounts,
    (total: CurrencyAmount, cur: RouteWithValidQuote) => {
      return total.add(cur.amount);
    },
    CurrencyAmount.fromRawAmount(routeAmounts[0]!.amount.currency, 0)
  );

  const routeStrings = _.map(routeAmounts, ({ protocol, route, amount }) => {
    const portion = amount.divide(total);
    const percent = new Percent(portion.numerator, portion.denominator);
    /// @dev special case for MIXED routes we want to show user friendly V2+V3 instead
    return `[${
      protocol == Protocol.MIXED ? 'V2 + V3' : protocol
    }] ${percent.toFixed(2)}% = ${routeToString(route)}`;
  });

  return _.join(routeStrings, ', ');
};
