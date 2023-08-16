import { metric, MetricLoggerUnit, SwapRoute } from '../routers';
import { ChainId, Token, TradeType } from '@uniswap/sdk-core';
import { Protocol } from '@uniswap/router-sdk';
import { log } from './log';
import { CurrencyAmount } from './amounts';

export const getDistribution = (distributionPercent: number) => {
  const percents: Array<number> = new Array<number>();

  for (let i = 1; i <= 100 / distributionPercent; i++) {
    percents.push(i * distributionPercent);
  }

  return percents;
};

export const measureDistributionPercentChangeImpact = (distributionPercentBefore: number,
                                                       distributionPercentAfter: number,
                                                       bestSwapRoute: SwapRoute,
                                                       tokenIn: Token,
                                                       tokenOut: Token,
                                                       tradeType: TradeType,
                                                       chainId: ChainId,
                                                       amount: CurrencyAmount) => {
  if (chainId !== ChainId.MAINNET) {
    // starts with mainnet impact measurement only
    return;
  }

  const routesImpacted: Array<string> = new Array<string>();

  const percentDistributionBefore = getDistribution(distributionPercentBefore);
  const percentDistributionAfter = getDistribution(distributionPercentAfter);

  bestSwapRoute.route.forEach((route) => {
    switch (route.protocol) {
      case Protocol.MIXED:
      case Protocol.V3:
        if (percentDistributionBefore.includes(route.percent) && !percentDistributionAfter.includes(route.percent)) {
          routesImpacted.push(route.toString());
        }
        break;
      case Protocol.V2:
        // if it's v2, there's no distribution, skip the current route
        break;
    }
  })

  if (routesImpacted.length > 0) {
    // intentionally use log.info so 10% sampling
    log.info(`Distribution percent change impacted the routes ${routesImpacted.join(',')},
      for currency ${tokenIn.symbol}
      amount ${amount.toExact()}
      quote currency ${tokenOut.symbol}
      trade type ${tradeType}
      chain id ${chainId}`);
    metric.putMetric("BEST_SWAP_ROUTE_DISTRIBUTION_PERCENT_CHANGE_IMPACTED", 1, MetricLoggerUnit.Count);
    metric.putMetric("ROUTES_WITH_VALID_QUOTE_DISTRIBUTION_PERCENT_CHANGE_IMPACTED", routesImpacted.length, MetricLoggerUnit.Count);
  }
}
