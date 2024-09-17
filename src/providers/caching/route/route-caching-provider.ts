/**
 * Provider for getting currency data from a currency List.
 *
 * @export
 * @interface IRouteCachingProvider
 */
import { Protocol } from '@uniswap/router-sdk';
import {
  ChainId,
  Currency,
  CurrencyAmount,
  TradeType,
} from '@uniswap/sdk-core';

import { CacheMode } from './model';
import { CachedRoutes } from './model/cached-routes';

/**
 * Abstract class for a RouteCachingProvider.
 * Defines the base methods of how to interact with this interface, but not the implementation of how to cache.
 */
export abstract class IRouteCachingProvider {
  /**
   * Final implementation of the public `getCachedRoute` method, this is how code will interact with the implementation
   *
   * @public
   * @readonly
   * @param chainId
   * @param amount
   * @param quoteCurrency
   * @param tradeType
   * @param protocols
   * @param blockNumber
   */
  public readonly getCachedRoute = async (
    // Defined as a readonly member instead of a regular function to make it final.
    chainId: number,
    amount: CurrencyAmount<Currency>,
    quoteCurrency: Currency,
    tradeType: TradeType,
    protocols: Protocol[],
    blockNumber: number,
    optimistic = false
  ): Promise<CachedRoutes | undefined> => {
    if (
      (await this.getCacheMode(
        chainId,
        amount,
        quoteCurrency,
        tradeType,
        protocols
      )) == CacheMode.Darkmode
    ) {
      return undefined;
    }

    const cachedRoute = await this._getCachedRoute(
      chainId,
      amount,
      quoteCurrency,
      tradeType,
      protocols,
      blockNumber,
      optimistic
    );

    return this.filterExpiredCachedRoutes(cachedRoute, blockNumber, optimistic);
  };

  /**
   * Final implementation of the public `setCachedRoute` method.
   * This method will set the blockToLive in the CachedRoutes object before calling the internal method to insert in cache.
   *
   * @public
   * @readonly
   * @param cachedRoutes The route to cache.
   * @returns Promise<boolean> Indicates if the route was inserted into cache.
   */
  public readonly setCachedRoute = async (
    // Defined as a readonly member instead of a regular function to make it final.
    cachedRoutes: CachedRoutes,
    amount: CurrencyAmount<Currency>
  ): Promise<boolean> => {
    if (
      (await this.getCacheModeFromCachedRoutes(cachedRoutes, amount)) ==
      CacheMode.Darkmode
    ) {
      return false;
    }

    cachedRoutes.blocksToLive = await this._getBlocksToLive(
      cachedRoutes,
      amount
    );

    return this._setCachedRoute(cachedRoutes, amount);
  };

  /**
   * Returns the CacheMode for the given cachedRoutes and amount
   *
   * @param cachedRoutes
   * @param amount
   */
  public getCacheModeFromCachedRoutes(
    cachedRoutes: CachedRoutes,
    amount: CurrencyAmount<Currency>
  ): Promise<CacheMode> {
    const quoteCurrency =
      cachedRoutes.tradeType == TradeType.EXACT_INPUT
        ? cachedRoutes.currencyOut
        : cachedRoutes.currencyIn;

    return this.getCacheMode(
      cachedRoutes.chainId,
      amount,
      quoteCurrency,
      cachedRoutes.tradeType,
      cachedRoutes.protocolsCovered
    );
  }

  /**
   * Returns the CacheMode for the given combination of chainId, currencyIn, currencyOut and tradetype
   *
   * @public
   * @abstract
   * @param chainId
   * @param amount
   * @param tradeType
   */
  public abstract getCacheMode(
    chainId: ChainId,
    amount: CurrencyAmount<Currency>,
    quoteCurrency: Currency,
    tradeType: TradeType,
    protocols: Protocol[]
  ): Promise<CacheMode>;

  protected filterExpiredCachedRoutes(
    cachedRoutes: CachedRoutes | undefined,
    blockNumber: number,
    optimistic: boolean
  ): CachedRoutes | undefined {
    return cachedRoutes?.notExpired(blockNumber, optimistic)
      ? cachedRoutes
      : undefined;
  }

  /**
   * Internal function to fetch the CachedRoute from the cache.
   * Must be implemented.
   *
   * @param chainId
   * @param amount
   * @param quoteCurrency
   * @param tradeType
   * @param protocols
   * @protected
   */
  protected abstract _getCachedRoute(
    chainId: ChainId,
    amount: CurrencyAmount<Currency>,
    quoteCurrency: Currency,
    tradeType: TradeType,
    protocols: Protocol[],
    currentBlockNumber: number,
    optimistic: boolean
  ): Promise<CachedRoutes | undefined>;

  /**
   * Internal function to insert the CachedRoute into cache.
   * Must be implemented.
   *
   * @param cachedRoutes
   * @param amount
   * @protected
   */
  protected abstract _setCachedRoute(
    cachedRoutes: CachedRoutes,
    amount: CurrencyAmount<Currency>
  ): Promise<boolean>;

  /**
   * Internal function to getBlocksToLive for a given cachedRoute.
   * This function is called before attempting to insert the route into cache.
   * Must be implemented.
   *
   * @param cachedRoutes
   * @param amount
   * @protected
   */
  protected abstract _getBlocksToLive(
    cachedRoutes: CachedRoutes,
    amount: CurrencyAmount<Currency>
  ): Promise<number>;
}
