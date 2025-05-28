import { Protocol } from '@uniswap/router-sdk';
import { ChainId, Currency, TradeType } from '@uniswap/sdk-core';
import _ from 'lodash';

import { RouteWithValidQuote, SupportedRoutes } from '../../../../routers';

import { CachedRoute } from './cached-route';

interface CachedRoutesParams {
  routes: CachedRoute<SupportedRoutes>[];
  chainId: ChainId;
  currencyIn: Currency;
  currencyOut: Currency;
  protocolsCovered: Protocol[];
  blockNumber: number;
  tradeType: TradeType;
  originalAmount: string;
  blocksToLive?: number;
}

/**
 * Class defining the route to cache
 *
 * @export
 * @class CachedRoute
 */
export class CachedRoutes {
  public readonly routes: CachedRoute<SupportedRoutes>[];
  public readonly chainId: ChainId;
  public readonly currencyIn: Currency;
  public readonly currencyOut: Currency;
  public readonly protocolsCovered: Protocol[];
  public readonly blockNumber: number;
  public readonly tradeType: TradeType;
  public readonly originalAmount: string;

  public blocksToLive: number;

  /**
   * @param routes
   * @param chainId
   * @param currencyIn
   * @param currencyOut
   * @param protocolsCovered
   * @param blockNumber
   * @param tradeType
   * @param originalAmount
   * @param blocksToLive
   */
  constructor({
    routes,
    chainId,
    currencyIn,
    currencyOut,
    protocolsCovered,
    blockNumber,
    tradeType,
    originalAmount,
    blocksToLive = 0,
  }: CachedRoutesParams) {
    this.routes = routes;
    this.chainId = chainId;
    this.currencyIn = currencyIn;
    this.currencyOut = currencyOut;
    this.protocolsCovered = protocolsCovered;
    this.blockNumber = blockNumber;
    this.tradeType = tradeType;
    this.originalAmount = originalAmount;
    this.blocksToLive = blocksToLive;
  }

  /**
   * Factory method that creates a `CachedRoutes` object from an array of RouteWithValidQuote.
   *
   * @public
   * @static
   * @param routes
   * @param chainId
   * @param currencyIn
   * @param currencyOut
   * @param protocolsCovered
   * @param blockNumber
   * @param tradeType
   * @param originalAmount
   */
  public static fromRoutesWithValidQuotes(
    routes: RouteWithValidQuote[],
    chainId: ChainId,
    currencyIn: Currency,
    currencyOut: Currency,
    protocolsCovered: Protocol[],
    blockNumber: number,
    tradeType: TradeType,
    originalAmount: string
  ): CachedRoutes | undefined {
    if (routes.length == 0) return undefined;

    const cachedRoutes = _.map(
      routes,
      (route: RouteWithValidQuote) =>
        new CachedRoute({ route: route.route, percent: route.percent })
    );

    return new CachedRoutes({
      routes: cachedRoutes,
      chainId,
      currencyIn,
      currencyOut,
      protocolsCovered,
      blockNumber,
      tradeType,
      originalAmount,
    });
  }

  /**
   * Function to determine if, given a block number, the CachedRoute is expired or not.
   *
   * @param currentBlockNumber
   * @param optimistic
   */
  public notExpired(currentBlockNumber: number, optimistic = false): boolean {
    // When it's not optimistic, we only allow the route of the existing block.
    const blocksToLive = optimistic ? this.blocksToLive : 0;
    const blocksDifference = currentBlockNumber - this.blockNumber;

    return blocksDifference <= blocksToLive;
  }
}
