import { Percent } from '@uniswap/sdk-core';
import { Pair } from '@uniswap/v2-sdk';
import { Pool } from '@uniswap/v3-sdk';
import _ from 'lodash';
import { CurrencyAmount } from '.';
import { RouteWithValidQuote } from '../routers/alpha-router';
import { MixedRoute, V2Route, V3Route } from '../routers/router';

export const routeToString = (route: V3Route | V2Route): string => {
  const isV3Route = (route: V3Route | V2Route): route is V3Route =>
    (route as V3Route).pools != undefined;
  const routeStr = [];
  const tokens = isV3Route(route) ? route.tokenPath : route.path;
  const tokenPath = _.map(tokens, (token) => `${token.symbol}`);
  const pools = isV3Route(route) ? route.pools : route.pairs;
  const poolFeePath = _.map(
    pools,
    (pool) =>
      `${
        pool instanceof Pool
          ? ` -- ${pool.fee / 10000}% [${Pool.getAddress(
              pool.token0,
              pool.token1,
              pool.fee
            )}]`
          : ` -- [${Pair.getAddress(
              (pool as Pair).token0,
              (pool as Pair).token1
            )}]`
      } --> `
  );

  for (let i = 0; i < tokenPath.length; i++) {
    routeStr.push(tokenPath[i]);
    if (i < poolFeePath.length) {
      routeStr.push(poolFeePath[i]);
    }
  }

  return routeStr.join('');
};

export const mixedRouteToString = (route: MixedRoute): string => {
  const routeStr = [];
  const tokens = route.tokenPath;

  const tokenPath = _.map(tokens, (token) => `${token.symbol}`);
  const partFeeMap = _.map(route.parts, (part) => {
    `${
      part instanceof Pool
        ? ` -- ${part.fee / 10000}% [${Pool.getAddress(
            part.token0,
            part.token1,
            part.fee
          )}]`
        : ` -- [${Pair.getAddress(
            (part as Pair).token0,
            (part as Pair).token1
          )}]`
    } --> `;
  });

  for (let i = 0; i < tokenPath.length; i++) {
    routeStr.push(tokenPath[i]);
    if (i < partFeeMap.length) {
      routeStr.push(partFeeMap[i]);
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
    return `[${protocol}] ${percent.toFixed(2)}% = ${routeToString(route)}`;
  });

  return _.join(routeStrings, ', ');
};

export const routeAmountToString = (
  routeAmount: RouteWithValidQuote
): string => {
  const { route, amount } = routeAmount;
  return `${amount.toExact()} = ${routeToString(route)}`;
};

export const poolToString = (p: Pool | Pair): string => {
  return `${p.token0.symbol}/${p.token1.symbol}${
    p instanceof Pool ? `/${p.fee / 10000}%` : ``
  }`;
};
