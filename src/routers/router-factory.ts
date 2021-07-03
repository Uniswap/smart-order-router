import Logger from 'bunyan';
import { providers } from 'ethers';
import { ETHGasStationInfoProvider } from '../providers/gas-price-provider';
import { Multicall2Provider } from '../providers/multicall2-provider';
import { PoolProvider } from '../providers/pool-provider';
import { QuoteProvider } from '../providers/quote-provider';
import { SubgraphProvider } from '../providers/subgraph-provider';
import { TokenListProvider } from '../providers/token-list-provider';
import { TokenProvider } from '../providers/token-provider';
import { ChainId } from '../util/chains';
import { setGlobalLogger } from '../util/log';
import { MetricLogger, setGlobalMetric } from '../util/metric';
import { AlphaRouter } from './alpha-router/alpha-router';
import { HeuristicGasModelFactory } from './alpha-router/gas-models/heuristic-gas-model';
import { LegacyRouter } from './legacy-router/legacy-router';
import { IRouter } from './router';

export enum RouterId {
  Legacy = 'Legacy',
  Alpha = 'Alpha',
}

export const ROUTER_IDS_LIST = Object.values(RouterId) as string[];

export const RouterFactory = (
  routerStr: string,
  chainId: ChainId,
  provider: providers.BaseProvider,
  tokenListProvider: TokenListProvider,
  log: Logger
): IRouter<any> => {
  const metricLogger = new MetricLogger();
  setGlobalMetric(metricLogger);
  setGlobalLogger(log);
  const multicall2Provider = new Multicall2Provider(provider);

  switch (routerStr) {
    case RouterId.Alpha:
      return new AlphaRouter({
        chainId,
        subgraphProvider: new SubgraphProvider(),
        multicall2Provider: new Multicall2Provider(provider),
        poolProvider: new PoolProvider(multicall2Provider),
        quoteProvider: new QuoteProvider(multicall2Provider),
        gasPriceProvider: new ETHGasStationInfoProvider(),
        gasModelFactory: new HeuristicGasModelFactory(),
        tokenProvider: new TokenProvider(chainId, multicall2Provider),
        tokenListProvider,
      });
    case RouterId.Legacy:
      return new LegacyRouter({
        chainId,
        multicall2Provider,
        poolProvider: new PoolProvider(multicall2Provider),
        quoteProvider: new QuoteProvider(multicall2Provider),
        tokenListProvider,
      });

    default:
      throw new Error(`Implementation of router ${routerStr} not found.`);
  }
};
