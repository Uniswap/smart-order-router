import Logger from 'bunyan';
import { ChainId, Currency, CurrencyAmount, Token } from '@uniswap/sdk-core';
import { Route as RouteRaw } from '@uniswap/v3-sdk';
import { Multicall2Provider } from '../providers/multicall';
import { PoolProvider } from '../providers/pool-provider';
import { QuoteProvider } from '../providers/quote-provider';

export class Route extends RouteRaw<Currency, Currency> {}

export type RouterParams = {
  chainId: ChainId;
  multicall2Provider: Multicall2Provider;
  poolProvider: PoolProvider;
  quoteProvider: QuoteProvider;
  log: Logger;
};

export type RouteQuote = {
  route: Route;
  quote: CurrencyAmount;
};

export abstract class Router {
  protected log: Logger;
  protected chainId: ChainId;
  protected multicall2Provider: Multicall2Provider;
  protected poolProvider: PoolProvider;
  protected quoteProvider: QuoteProvider;

  constructor({
    chainId,
    multicall2Provider,
    poolProvider,
    quoteProvider,
    log,
  }: RouterParams) {
    this.chainId = chainId;
    this.multicall2Provider = multicall2Provider;
    this.poolProvider = poolProvider;
    this.quoteProvider = quoteProvider;
    this.log = log;
  }

  public abstract routeExactIn(
    tokenIn: Token,
    tokenOut: Token,
    amountIn: CurrencyAmount
  ): Promise<RouteQuote | null>;
}
