import Logger from 'bunyan';
import { providers } from 'ethers';
import { ETHGasStationInfoProvider } from '../providers/gas-price-provider';
import { Multicall2Provider } from '../providers/multicall2-provider';
import { PoolProvider } from '../providers/pool-provider';
import { QuoteProvider } from '../providers/quote-provider';
import { SubgraphProvider } from '../providers/subgraph-provider';
import { TokenProvider } from '../providers/token-provider';
import { ChainId } from '../util/chains';
import { AlphaRouter } from './alpha-router/alpha-router';
import { HeuristicGasModelFactory } from './alpha-router/gas-models/heuristic-gas-model';
import { LegacyRouter } from './legacy-router/legacy-router';
import { MetricLogger } from './metric';
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
  tokenProvider: TokenProvider,
  log: Logger
): IRouter<any> => {
  const metricLogger = new MetricLogger(log);
  const multicall2Provider = new Multicall2Provider(provider, log);

  switch (routerStr) {
    case RouterId.Alpha:
      return new AlphaRouter({
        chainId,
        subgraphProvider: new SubgraphProvider(log),
        multicall2Provider: new Multicall2Provider(provider, log),
        poolProvider: new PoolProvider(multicall2Provider, log),
        quoteProvider: new QuoteProvider(multicall2Provider, log),
        gasPriceProvider: new ETHGasStationInfoProvider(log),
        gasModelFactory: new HeuristicGasModelFactory(log),
        tokenProvider,
        metricLogger,
        log,
      });
    case RouterId.Legacy:
      return new LegacyRouter({
        chainId,
        multicall2Provider,
        poolProvider: new PoolProvider(multicall2Provider, log),
        quoteProvider: new QuoteProvider(multicall2Provider, log),
        tokenProvider,
        log,
      });

    default:
      throw new Error(`Implementation of router ${routerStr} not found.`);
  }
};
