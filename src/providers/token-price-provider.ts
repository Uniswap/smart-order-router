import { ChainId, Currency } from '@uniswap/sdk-core';

import { getAddressLowerCase, log, metric, MetricLoggerUnit } from '../util';

import { ICache } from './cache';
import { ProviderConfig } from './provider';

export type TokenPriceResult = {
  price: number | undefined;
};

export const DEFAULT_TOKEN_PRICE_RESULT: TokenPriceResult = {
  price: undefined,
};

export const POSITIVE_TOKEN_PRICE_CACHE_ENTRY_TTL = 60 * 5; // 5 minutes in seconds
export const NEGATIVE_TOKEN_PRICE_CACHE_ENTRY_TTL = 60 * 5; // 5 minutes in seconds

type Address = string;
export type TokenPricesMap = Record<Address, TokenPriceResult>;

export interface ITokenPriceFetcher {
  fetchPrices(
    addresses: Address[],
    providerConfig?: ProviderConfig
  ): Promise<TokenPricesMap>;
}

export interface ITokenPricesProvider {
  getTokensPrices(
    currencies: Currency[],
    providerConfig?: ProviderConfig
  ): Promise<TokenPricesMap>;
}

export class TokenPriceProvider implements ITokenPricesProvider {
  private CACHE_KEY = (chainId: ChainId, address: string) =>
    `token-price-${chainId}-${address}`;

  constructor(
    private chainId: ChainId,
    private tokenPricesCache: ICache<TokenPriceResult>,
    private tokenPriceFetcher: ITokenPriceFetcher,
    private positiveCacheEntryTTL = POSITIVE_TOKEN_PRICE_CACHE_ENTRY_TTL,
    private negativeCacheEntryTTL = NEGATIVE_TOKEN_PRICE_CACHE_ENTRY_TTL
  ) {}

  public async getTokensPrices(
    currencies: Currency[],
    providerConfig?: ProviderConfig
  ): Promise<TokenPricesMap> {
    const tokenToResult: TokenPricesMap = {};

    const addressesToFetchPricesOnchain: string[] = [];
    const addressesRaw = this.buildAddressesRaw(currencies);
    const addressesCacheKeys = this.buildAddressesCacheKeys(currencies);

    const tokenPrices = await this.tokenPricesCache.batchGet(
      addressesCacheKeys
    );

    // Check if we have cached token prices for any tokens
    for (const address of addressesRaw) {
      const cachedValue =
        tokenPrices[this.CACHE_KEY(this.chainId, address.toLowerCase())];
      if (cachedValue) {
        metric.putMetric(
          'TokenPriceProviderBatchGetCacheHit',
          1,
          MetricLoggerUnit.Count
        );

        if (cachedValue.price) {
          metric.putMetric(
            'TokenPriceProviderCacheHitPriceExists',
            1,
            MetricLoggerUnit.Count
          );
        } else {
          metric.putMetric(
            'TokenPriceProviderCacheHitPriceNotExists',
            1,
            MetricLoggerUnit.Count
          );
        }

        tokenToResult[address] = cachedValue;
      } else {
        addressesToFetchPricesOnchain.push(address);
      }
    }

    if (addressesToFetchPricesOnchain.length > 0) {
      let tokenPriceMap: TokenPricesMap = {};

      try {
        tokenPriceMap = await this.tokenPriceFetcher.fetchPrices(
          addressesToFetchPricesOnchain,
          providerConfig
        );
      } catch (err) {
        log.error(
          { err },
          `Error fetching prices for tokens ${addressesToFetchPricesOnchain}`
        );
      }

      await Promise.all(
        addressesToFetchPricesOnchain.map((address) => {
          const tokenPrice = tokenPriceMap[address];

          if (tokenPrice?.price) {
            metric.putMetric(
              'TokenPriceProviderPriceCacheMissExists',
              1,
              MetricLoggerUnit.Count
            );

            tokenToResult[address] = tokenPrice;

            metric.putMetric(
              'TokenPriceProviderBatchGetCacheMiss',
              1,
              MetricLoggerUnit.Count
            );

            // Update cache concurrently
            return this.tokenPricesCache.set(
              this.CACHE_KEY(this.chainId, address),
              tokenPrice,
              this.positiveCacheEntryTTL
            );
          } else {
            metric.putMetric(
              'TokenPriceProviderPriceCacheMissNotExists',
              1,
              MetricLoggerUnit.Count
            );

            const emptyPriceResult = {
              price: undefined,
            };
            tokenToResult[address] = emptyPriceResult;

            return this.tokenPricesCache.set(
              this.CACHE_KEY(this.chainId, address),
              emptyPriceResult,
              this.negativeCacheEntryTTL
            );
          }
        })
      );
    }

    return tokenToResult;
  }

  private buildAddressesRaw(currencies: Currency[]): Set<string> {
    const addressesRaw = new Set<string>();

    for (const currency of currencies) {
      const address = getAddressLowerCase(currency);
      if (!addressesRaw.has(address)) {
        addressesRaw.add(address);
      }
    }

    return addressesRaw;
  }

  private buildAddressesCacheKeys(currencies: Currency[]): Set<string> {
    const addressesCacheKeys = new Set<string>();

    for (const currency of currencies) {
      const addressCacheKey = this.CACHE_KEY(
        this.chainId,
        getAddressLowerCase(currency)
      );
      if (!addressesCacheKeys.has(addressCacheKey)) {
        addressesCacheKeys.add(addressCacheKey);
      }
    }

    return addressesCacheKeys;
  }
}
