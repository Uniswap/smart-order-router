import { Pool } from '@uniswap/v3-sdk';
import _ from 'lodash';
import { RouteSOR, RouteAmount } from '../routers/router';

export const routeToString = (route: RouteSOR): string => {
  const routeStr = [];
  const tokenPath = _.map(route.tokenPath, (token) => `${token.symbol}`);
  const poolFeePath = _.map(
    route.pools,
    (pool) => ` -- ${pool.fee / 10000}% --> `
  );

  for (let i = 0; i < tokenPath.length; i++) {
    routeStr.push(tokenPath[i]);
    if (i < poolFeePath.length) {
      routeStr.push(poolFeePath[i]);
    }
  }

  return routeStr.join('');
};

export const routeAmountToString = (routeAmount: RouteAmount): string => {
  const { route, percentage } = routeAmount;
  return `${percentage}% = ${routeToString(route)}`;
};

export const poolToString = (p: Pool): string => {
  return `${p.token0.symbol}/${p.token1.symbol}/${p.fee / 10000}%`;
};
