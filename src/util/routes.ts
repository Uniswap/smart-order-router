import { Percent } from '@uniswap/sdk-core';
import { Pair } from '@uniswap/v2-sdk';
import { Pool } from '@uniswap/v3-sdk';
import _ from 'lodash';
import { CurrencyAmount } from '.';
import { RouteWithValidQuote } from '../routers/alpha-router';
import { MixedRoute, V2Route, V3Route } from '../routers/router';

export const routeToString = (
  route: V3Route | V2Route | MixedRoute
): string => {
  const routeStr = [];
  const tokens =
    route instanceof V3Route || route instanceof MixedRoute
      ? route.tokenPath
      : // V2Route only has path
        route.path;
  const tokenPath = _.map(tokens, (token) => `${token.symbol}`);
  const parts =
    route instanceof MixedRoute
      ? route.pools
      : route instanceof V3Route
      ? route.pools
      : route.pairs;
  const partFeeMap = _.map(parts, (part) => {
    return `${
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
