import { ChainId, Token, WETH9 } from '@uniswap/sdk-core';
import NodeCache from 'node-cache';
import sinon from 'sinon';
import {
  ITokenFeeFetcher,
  OnChainTokenFeeFetcher,
  TokenFeeMap
} from '../../../src/providers/token-fee-fetcher';
import { BigNumber } from '@ethersproject/bignumber';
import {
  NodeJSCache,
  POSITIVE_CACHE_ENTRY_TTL,
  NEGATIVE_CACHE_ENTRY_TTL,
  TokenPropertiesProvider,
  TokenPropertiesResult,
  TokenValidationResult,
  USDC_MAINNET, ID_TO_PROVIDER
} from '../../../src';
import dotenv from 'dotenv';
import { JsonRpcProvider } from '@ethersproject/providers';
import { BITBOY } from '../../test-util/mock-data';

dotenv.config();

describe('TokenPropertiesProvider', () => {
  let mockTokenFeeFetcher: sinon.SinonStubbedInstance<ITokenFeeFetcher>

  const CACHE_KEY = (chainId: ChainId, address: string) =>
    `token-properties-${chainId}-${address}`;

  beforeEach(async () => {
    mockTokenFeeFetcher = sinon.createStubInstance(OnChainTokenFeeFetcher)

    mockTokenFeeFetcher.fetchFees.callsFake(async (addresses) => {
      const tokenToResult: TokenFeeMap = {};
      addresses.forEach((address) => tokenToResult[address] = {
        buyFeeBps: BigNumber.from(213),
        sellFeeBps: BigNumber.from(800)
      })

      return tokenToResult
    })
  })

  describe('get token fees by address', () => {
    it('succeeds to get token fee and updates cache', async () => {
      const underlyingCache: NodeCache = new NodeCache({ stdTTL: 3600, useClones: false })
      const tokenPropertiesResultCache: NodeJSCache<TokenPropertiesResult> = new NodeJSCache(underlyingCache);
      const tokenPropertiesProvider = new TokenPropertiesProvider(
        ChainId.MAINNET,
        tokenPropertiesResultCache,
        mockTokenFeeFetcher,
      )

      const token = USDC_MAINNET
      const currentEpochTimeInSeconds = Math.floor(Date.now() / 1000);

      expect(await tokenPropertiesResultCache.get(CACHE_KEY(ChainId.MAINNET, token.address.toLowerCase()))).toBeUndefined();
      const tokenPropertiesMap = await tokenPropertiesProvider.getTokensProperties([token], { enableFeeOnTransferFeeFetching: true });
      expect(tokenPropertiesMap[token.address.toLowerCase()]).toBeDefined();
      assertExpectedTokenProperties(tokenPropertiesMap[token.address.toLowerCase()], BigNumber.from(213), BigNumber.from(800), TokenValidationResult.FOT);

      const cachedTokenProperties = await tokenPropertiesResultCache.get(CACHE_KEY(ChainId.MAINNET, token.address.toLowerCase()))
      expect(cachedTokenProperties).toBeDefined();
      assertExpectedTokenProperties(cachedTokenProperties, BigNumber.from(213), BigNumber.from(800), TokenValidationResult.FOT);

      underlyingCache.getTtl(CACHE_KEY(ChainId.MAINNET, token.address.toLowerCase()))
      expect(Math.floor((underlyingCache.getTtl(CACHE_KEY(ChainId.MAINNET, token.address.toLowerCase())) ?? 0) / 1000)).toEqual(currentEpochTimeInSeconds + POSITIVE_CACHE_ENTRY_TTL);
    })

    it('succeeds to get token fee cache hit and second token fee fetcher call is skipped', async function() {
      const underlyingCache: NodeCache = new NodeCache({ stdTTL: 3600, useClones: false })
      const tokenPropertiesResultCache: NodeJSCache<TokenPropertiesResult> = new NodeJSCache(underlyingCache);
      const tokenPropertiesProvider = new TokenPropertiesProvider(
        ChainId.MAINNET,
        tokenPropertiesResultCache,
        mockTokenFeeFetcher,
      )

      const token = USDC_MAINNET
      const currentEpochTimeInSeconds = Math.floor(Date.now() / 1000);

      expect(await tokenPropertiesResultCache.get(CACHE_KEY(ChainId.MAINNET, token.address.toLowerCase()))).toBeUndefined();
      const tokenPropertiesMap = await tokenPropertiesProvider.getTokensProperties([token], { enableFeeOnTransferFeeFetching: true });
      expect(tokenPropertiesMap[token.address.toLowerCase()]).toBeDefined();
      assertExpectedTokenProperties(tokenPropertiesMap[token.address.toLowerCase()], BigNumber.from(213), BigNumber.from(800), TokenValidationResult.FOT);
      sinon.assert.calledOnce(mockTokenFeeFetcher.fetchFees)

      const cachedTokenProperties = await tokenPropertiesResultCache.get(CACHE_KEY(ChainId.MAINNET, token.address.toLowerCase()))
      expect(cachedTokenProperties).toBeDefined();
      assertExpectedTokenProperties(cachedTokenProperties, BigNumber.from(213), BigNumber.from(800), TokenValidationResult.FOT);
      sinon.assert.calledOnce(mockTokenFeeFetcher.fetchFees)

      underlyingCache.getTtl(CACHE_KEY(ChainId.MAINNET, token.address.toLowerCase()))
      expect(Math.floor((underlyingCache.getTtl(CACHE_KEY(ChainId.MAINNET, token.address.toLowerCase())) ?? 0) / 1000)).toEqual(currentEpochTimeInSeconds + POSITIVE_CACHE_ENTRY_TTL);
    });

    it('succeeds to get token allowlist with no on-chain calls nor caching', async function() {
      const underlyingCache: NodeCache = new NodeCache({ stdTTL: 3600, useClones: false })
      const tokenPropertiesResultCache: NodeJSCache<TokenPropertiesResult> = new NodeJSCache(underlyingCache);
      const tokenPropertiesProvider = new TokenPropertiesProvider(
        ChainId.MAINNET,
        tokenPropertiesResultCache,
        mockTokenFeeFetcher,
      )

      const allowListToken = new Token(1, '0x777E2ae845272a2F540ebf6a3D03734A5a8f618e', 18);
      const tokenPropertiesMap = await tokenPropertiesProvider.getTokensProperties([allowListToken], { enableFeeOnTransferFeeFetching: true });

      expect(tokenPropertiesMap[allowListToken.address.toLowerCase()]).toBeDefined();
      expect(tokenPropertiesMap[allowListToken.address.toLowerCase()]?.tokenFeeResult).toBeUndefined();
      assertExpectedTokenProperties(tokenPropertiesMap[allowListToken.address.toLowerCase()], undefined, undefined, TokenValidationResult.UNKN);

      expect(await tokenPropertiesResultCache.get(CACHE_KEY(ChainId.MAINNET, allowListToken.address.toLowerCase()))).toBeUndefined();
    });

    it('succeeds to get token properties in a single batch', async function() {
      const underlyingCache: NodeCache = new NodeCache({ stdTTL: 3600, useClones: false })
      const tokenPropertiesResultCache: NodeJSCache<TokenPropertiesResult> = new NodeJSCache(underlyingCache);
      const tokenPropertiesProvider = new TokenPropertiesProvider(
        ChainId.MAINNET,
        tokenPropertiesResultCache,
        mockTokenFeeFetcher,
      )
      const currentEpochTimeInSeconds = Math.floor(Date.now() / 1000);

      const token1 = new Token(1, '0x0000000000000000000000000000000000000012', 18);
      const token2 = new Token(1, '0x0000000000000000000000000000000000000034', 18);
      const token3 = new Token(1, '0x0000000000000000000000000000000000000056', 18);

      const tokens = [token1, token2, token3]

      mockTokenFeeFetcher.fetchFees.callsFake(async (addresses) => {
        const tokenToResult: TokenFeeMap = {};
        addresses.forEach((address) => {
          tokenToResult[address] = {
            buyFeeBps: BigNumber.from(parseInt(address[address.length - 2]!)),
            sellFeeBps: BigNumber.from(parseInt(address[address.length - 1]!))
          }
        });

        return tokenToResult
      });

      const tokenPropertiesMap = await tokenPropertiesProvider.getTokensProperties(tokens, { enableFeeOnTransferFeeFetching: true });

      for (const token of tokens) {
        const address = token.address.toLowerCase()
        expect(tokenPropertiesMap[address]).toBeDefined();
        expect(tokenPropertiesMap[address]?.tokenFeeResult).toBeDefined();
        const expectedBuyFeeBps = tokenPropertiesMap[address]?.tokenFeeResult?.buyFeeBps
        const expectedSellFeeBps = tokenPropertiesMap[address]?.tokenFeeResult?.sellFeeBps
        assertExpectedTokenProperties(tokenPropertiesMap[address], expectedBuyFeeBps, expectedSellFeeBps, TokenValidationResult.FOT);

        const cachedTokenProperties = await tokenPropertiesResultCache.get(CACHE_KEY(ChainId.MAINNET, token.address.toLowerCase()))
        expect(cachedTokenProperties).toBeDefined();
        assertExpectedTokenProperties(cachedTokenProperties, expectedBuyFeeBps, expectedSellFeeBps, TokenValidationResult.FOT);

        underlyingCache.getTtl(CACHE_KEY(ChainId.MAINNET, token.address.toLowerCase()))
        expect(Math.floor((underlyingCache.getTtl(CACHE_KEY(ChainId.MAINNET, token.address.toLowerCase())) ?? 0) / 1000)).toEqual(currentEpochTimeInSeconds + POSITIVE_CACHE_ENTRY_TTL);
      }
    });

    it('all token fee fetch failed', async function() {
      const underlyingCache: NodeCache = new NodeCache({ stdTTL: 3600, useClones: false })
      const tokenPropertiesResultCache: NodeJSCache<TokenPropertiesResult> = new NodeJSCache(underlyingCache);
      const tokenPropertiesProvider = new TokenPropertiesProvider(
        ChainId.MAINNET,
        tokenPropertiesResultCache,
        mockTokenFeeFetcher,
      )
      const currentEpochTimeInSeconds = Math.floor(Date.now() / 1000);

      const token1 = new Token(1, '0x0000000000000000000000000000000000000012', 18);
      const token2 = new Token(1, '0x0000000000000000000000000000000000000034', 18);
      const token3 = new Token(1, '0x0000000000000000000000000000000000000056', 18);

      const tokens = [token1, token2, token3]

      mockTokenFeeFetcher.fetchFees.withArgs(tokens.map(token => token.address)).throws(new Error('Failed to fetch fees for token 1'));

      const tokenPropertiesMap = await tokenPropertiesProvider.getTokensProperties(tokens, { enableFeeOnTransferFeeFetching: true });

      for (const token of tokens) {
        const address = token.address.toLowerCase()
        expect(tokenPropertiesMap[address]).toBeDefined();
        expect(tokenPropertiesMap[address]?.tokenFeeResult).toBeUndefined();
        expect(tokenPropertiesMap[address]?.tokenValidationResult).toBeUndefined();

        const cachedTokenProperties = await tokenPropertiesResultCache.get(CACHE_KEY(ChainId.MAINNET, token.address.toLowerCase()))
        expect(cachedTokenProperties).toBeDefined();
        expect(cachedTokenProperties?.tokenFeeResult).toBeUndefined();
        expect(cachedTokenProperties?.tokenValidationResult).toBeUndefined();

        underlyingCache.getTtl(CACHE_KEY(ChainId.MAINNET, token.address.toLowerCase()))
        expect(Math.floor((underlyingCache.getTtl(CACHE_KEY(ChainId.MAINNET, token.address.toLowerCase())) ?? 0) / 1000)).toEqual(currentEpochTimeInSeconds + NEGATIVE_CACHE_ENTRY_TTL);
      }
    });

    it('real ETH and BITBOY token fee fetch, only BITBOY fetched', async function() {
      const chain = ChainId.MAINNET;
      const chainProvider = ID_TO_PROVIDER(chain);
      const provider = new JsonRpcProvider(chainProvider, chain);
      const tokenFeeFetcher = new OnChainTokenFeeFetcher(chain, provider);

      const underlyingCache: NodeCache = new NodeCache({ stdTTL: 3600, useClones: false })
      const tokenPropertiesResultCache: NodeJSCache<TokenPropertiesResult> = new NodeJSCache(underlyingCache);
      const tokenPropertiesProvider = new TokenPropertiesProvider(
        ChainId.MAINNET,
        tokenPropertiesResultCache,
        tokenFeeFetcher,
      )
      const currentEpochTimeInSeconds = Math.floor(Date.now() / 1000);

      const tokens = [WETH9[ChainId.MAINNET]!, BITBOY]

      const tokenPropertiesMap = await tokenPropertiesProvider.getTokensProperties(tokens, { enableFeeOnTransferFeeFetching: true });

      expect(tokenPropertiesMap[WETH9[ChainId.MAINNET]!.address.toLowerCase()]).toBeDefined()
      expect(tokenPropertiesMap[WETH9[ChainId.MAINNET]!.address.toLowerCase()]?.tokenFeeResult).toBeUndefined()
      expect(tokenPropertiesMap[WETH9[ChainId.MAINNET]!.address.toLowerCase()]?.tokenValidationResult).toBeUndefined()

      expect(tokenPropertiesMap[BITBOY.address.toLowerCase()]).toBeDefined();
      expect(tokenPropertiesMap[BITBOY.address.toLowerCase()]?.tokenFeeResult).toBeDefined();
      expect(tokenPropertiesMap[BITBOY.address.toLowerCase()]?.tokenValidationResult).toBeDefined();
      assertExpectedTokenProperties(tokenPropertiesMap[BITBOY.address.toLowerCase()],
        BITBOY?.buyFeeBps,
        BITBOY?.sellFeeBps,
        TokenValidationResult.FOT);

      const cachedTokenProperties = await tokenPropertiesResultCache.get(CACHE_KEY(ChainId.MAINNET, BITBOY.address.toLowerCase()))
      expect(cachedTokenProperties).toBeDefined();
      assertExpectedTokenProperties(cachedTokenProperties, BITBOY?.buyFeeBps, BITBOY?.sellFeeBps, TokenValidationResult.FOT);

      underlyingCache.getTtl(CACHE_KEY(ChainId.MAINNET, BITBOY.address.toLowerCase()))

      const ttlUpperBoundBuffer = 1 // in seconds
      expect(Math.floor((underlyingCache.getTtl(CACHE_KEY(ChainId.MAINNET, BITBOY.address.toLowerCase())) ?? 0) / 1000)).toBeGreaterThanOrEqual(currentEpochTimeInSeconds + POSITIVE_CACHE_ENTRY_TTL);
      expect(Math.floor((underlyingCache.getTtl(CACHE_KEY(ChainId.MAINNET, BITBOY.address.toLowerCase())) ?? 0) / 1000)).toBeLessThanOrEqual(currentEpochTimeInSeconds + POSITIVE_CACHE_ENTRY_TTL + ttlUpperBoundBuffer);
    });
  });

  function assertExpectedTokenProperties(
    tokenProperties?: TokenPropertiesResult,
    expectedBuyFeeBps?: BigNumber,
    expectedSellFeeBps?: BigNumber,
    expectedTokenValidationResult?: TokenValidationResult
  ): void {
    if (expectedBuyFeeBps) {
      expect(tokenProperties?.tokenFeeResult?.buyFeeBps?.eq(expectedBuyFeeBps)).toBeTruthy();
    } else {
      expect(tokenProperties?.tokenFeeResult?.buyFeeBps).toBeUndefined();
    }

    if (expectedSellFeeBps) {
      expect(tokenProperties?.tokenFeeResult?.sellFeeBps?.eq(expectedSellFeeBps)).toBeTruthy();
    } else {
      expect(tokenProperties?.tokenFeeResult?.sellFeeBps).toBeUndefined();
    }

    expect(tokenProperties?.tokenValidationResult).toEqual(expectedTokenValidationResult);
  }
});
