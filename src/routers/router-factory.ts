import { IRouter } from './router';
import { V3InterfaceRouter } from './v3-interface-router/v3-interface-router';
import { providers } from 'ethers';
import Logger from 'bunyan';
import { Multicall2Provider } from '../providers/multicall';
import { PoolProvider } from '../providers/pool-provider';
import { QuoteProvider } from '../providers/quote-provider';
import { ChainId } from '@uniswap/sdk-core';
import { TokenProvider } from '../util/tokens';

export enum RouterId {
  V3Interface = 'V3Interface',
}

export const ROUTER_IDS_LIST = Object.values(RouterId) as string[];

export const RouterFactory = (
  routerStr: string,
  chainId: ChainId,
  provider: providers.BaseProvider,
  tokenProvider: TokenProvider,
  log: Logger
): IRouter => {
  switch (routerStr) {
    case RouterId.V3Interface:
      const multicall2Provider = new Multicall2Provider(provider, log);
      const poolProvider = new PoolProvider(multicall2Provider, log);
      const quoteProvider = new QuoteProvider(multicall2Provider, log);

      const router = new V3InterfaceRouter({
        chainId,
        multicall2Provider,
        poolProvider,
        quoteProvider,
        tokenProvider,
        log,
      });

      return router;
    default:
      throw new Error(`Implementation of router ${routerStr} not found.`);
  }
};
