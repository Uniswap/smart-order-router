import { ChainId, Token, WETH9 } from '@uniswap/sdk-core';
import NodeCache from 'node-cache';
import sinon from 'sinon';
import {
  NodeJSCache,
  ITokenPriceFetcher,
  TokenPriceProvider,
  TokenPriceResult,
  TokenPricesMap,
  POSITIVE_TOKEN_PRICE_CACHE_ENTRY_TTL,
  NEGATIVE_TOKEN_PRICE_CACHE_ENTRY_TTL,
  USDC_MAINNET,
  DEFAULT_TOKEN_PRICE_RESULT
} from '../../../src';
import { ProviderConfig } from '../../../src/providers/provider';

// Mock implementation of ITokenPriceFetcher
class MockTokenPriceFetcher implements ITokenPriceFetcher {
  async fetchPrices(
    addresses: string[],
    _providerConfig?: ProviderConfig
  ): Promise<TokenPricesMap> {
    const result: TokenPricesMap = {};
    addresses.forEach(address => {
      result[address] = DEFAULT_TOKEN_PRICE_RESULT;
    });
    return result;
  }
}

describe('TokenPriceProvider', () => {
  let mockTokenPriceFetcher: sinon.SinonStubbedInstance<ITokenPriceFetcher>;

  const CACHE_KEY = (chainId: ChainId, address: string) =>
    `token-price-${chainId}-${address}`;

  beforeEach(async () => {
    mockTokenPriceFetcher = sinon.createStubInstance<ITokenPriceFetcher>(MockTokenPriceFetcher);
    mockTokenPriceFetcher.fetchPrices.callsFake(async (addresses: string[]) => {
      const tokenToResult: TokenPricesMap = {};
      addresses.forEach((address) => tokenToResult[address] = {
        price: 1.23
      });
      return tokenToResult;
    });
  });

  describe('get token prices by address', () => {
    it('succeeds to get token price and updates cache', async () => {
      const underlyingCache: NodeCache = new NodeCache({ stdTTL: 3600, useClones: false });
      const tokenPricesCache: NodeJSCache<TokenPriceResult> = new NodeJSCache(underlyingCache);
      const tokenPriceProvider = new TokenPriceProvider(
        ChainId.MAINNET,
        tokenPricesCache,
        mockTokenPriceFetcher,
      );

      const token = USDC_MAINNET;
      if (!token) throw new Error('USDC_MAINNET token not found');

      const currentEpochTimeInSeconds = Math.floor(Date.now() / 1000);
      const tokenAddress = token.address.toLowerCase();

      expect(await tokenPricesCache.get(CACHE_KEY(ChainId.MAINNET, tokenAddress))).toBeUndefined();
      const tokenPricesMap = await tokenPriceProvider.getTokensPrices([token]);

      const tokenPrice = tokenPricesMap[tokenAddress];
      expect(tokenPrice).toBeDefined();
      assertExpectedTokenPrice(tokenPrice, 1.23);

      const cachedTokenPrice = await tokenPricesCache.get(CACHE_KEY(ChainId.MAINNET, tokenAddress));
      expect(cachedTokenPrice).toBeDefined();
      assertExpectedTokenPrice(cachedTokenPrice, 1.23);

      const ttl = underlyingCache.getTtl(CACHE_KEY(ChainId.MAINNET, tokenAddress));
      expect(Math.floor((ttl ?? 0) / 1000))
        .toEqual(currentEpochTimeInSeconds + POSITIVE_TOKEN_PRICE_CACHE_ENTRY_TTL);
    });

    it('succeeds to get token price cache hit and second price fetcher call is skipped', async () => {
      const underlyingCache: NodeCache = new NodeCache({ stdTTL: 3600, useClones: false });
      const tokenPricesCache: NodeJSCache<TokenPriceResult> = new NodeJSCache(underlyingCache);
      const tokenPriceProvider = new TokenPriceProvider(
        ChainId.MAINNET,
        tokenPricesCache,
        mockTokenPriceFetcher,
      );

      const token = USDC_MAINNET;

      expect(await tokenPricesCache.get(CACHE_KEY(ChainId.MAINNET, token.address.toLowerCase()))).toBeUndefined();
      const tokenPricesMap = await tokenPriceProvider.getTokensPrices([token]);
      expect(tokenPricesMap[token.address.toLowerCase()]).toBeDefined();
      assertExpectedTokenPrice(tokenPricesMap[token.address.toLowerCase()], 1.23);
      sinon.assert.calledOnce(mockTokenPriceFetcher.fetchPrices);

      const cachedTokenPrice = await tokenPricesCache.get(CACHE_KEY(ChainId.MAINNET, token.address.toLowerCase()));
      expect(cachedTokenPrice).toBeDefined();

      // Second call to get token prices should not call price fetcher
      const tokenPricesMapFromSecondCall = await tokenPriceProvider.getTokensPrices([token]);
      assertExpectedTokenPrice(tokenPricesMapFromSecondCall[token.address.toLowerCase()], 1.23);
      sinon.assert.calledOnce(mockTokenPriceFetcher.fetchPrices);
    });

    it('succeeds to get token prices in a single batch', async () => {
      const underlyingCache: NodeCache = new NodeCache({ stdTTL: 3600, useClones: false });
      const tokenPricesCache: NodeJSCache<TokenPriceResult> = new NodeJSCache(underlyingCache);
      const tokenPriceProvider = new TokenPriceProvider(
        ChainId.MAINNET,
        tokenPricesCache,
        mockTokenPriceFetcher,
      );

      const token1 = new Token(1, '0x0000000000000000000000000000000000000012', 18);
      const token2 = new Token(1, '0x0000000000000000000000000000000000000034', 18);
      const token3 = new Token(1, '0x0000000000000000000000000000000000000056', 18);

      const tokens = [token1, token2, token3];

      mockTokenPriceFetcher.fetchPrices.callsFake(async (addresses) => {
        const tokenToResult: TokenPricesMap = {};
        addresses.forEach((address, index) => {
          tokenToResult[address] = {
            price: 1.23 * (index + 1)
          };
        });
        return tokenToResult;
      });

      const tokenPricesMap = await tokenPriceProvider.getTokensPrices(tokens);

      for (let i = 0; i < tokens.length; i++) {
        const token = tokens[i];
        const address = token?.address.toLowerCase();
        if (!address) throw new Error('Token address is undefined');
        expect(tokenPricesMap[address]).toBeDefined();
        assertExpectedTokenPrice(tokenPricesMap[address], 1.23 * (i + 1));

        const cachedTokenPrice = await tokenPricesCache.get(CACHE_KEY(ChainId.MAINNET, address));
        expect(cachedTokenPrice).toBeDefined();
        assertExpectedTokenPrice(cachedTokenPrice, 1.23 * (i + 1));
      }
    });

    it('handles price fetch failure', async () => {
      const underlyingCache: NodeCache = new NodeCache({ stdTTL: 3600, useClones: false });
      const tokenPricesCache: NodeJSCache<TokenPriceResult> = new NodeJSCache(underlyingCache);
      const tokenPriceProvider = new TokenPriceProvider(
        ChainId.MAINNET,
        tokenPricesCache,
        mockTokenPriceFetcher,
      );
      const currentEpochTimeInSeconds = Math.floor(Date.now() / 1000);

      const weth = WETH9[ChainId.MAINNET];
      if (!weth) throw new Error('WETH token not found');

      mockTokenPriceFetcher.fetchPrices.throws(new Error('Failed to fetch price'));

      const tokenPricesMap = await tokenPriceProvider.getTokensPrices([weth]);
      const address = weth.address.toLowerCase();

      const tokenPrice = tokenPricesMap[address];
      expect(tokenPrice).toBeDefined();
      expect(tokenPrice?.price).toBeUndefined();

      const cachedTokenPrice = await tokenPricesCache.get(CACHE_KEY(ChainId.MAINNET, address));
      expect(cachedTokenPrice).toBeDefined();
      expect(cachedTokenPrice?.price).toBeUndefined();

      const ttl = underlyingCache.getTtl(CACHE_KEY(ChainId.MAINNET, address));
      expect(Math.floor((ttl ?? 0) / 1000))
        .toEqual(currentEpochTimeInSeconds + NEGATIVE_TOKEN_PRICE_CACHE_ENTRY_TTL);
    });
  });
});

function assertExpectedTokenPrice(
  tokenPrice: TokenPriceResult | undefined,
  expectedPrice?: number,
): void {
  if (expectedPrice !== undefined) {
    expect(tokenPrice?.price).toEqual(expectedPrice);
  } else {
    expect(tokenPrice?.price).toBeUndefined();
  }
}
