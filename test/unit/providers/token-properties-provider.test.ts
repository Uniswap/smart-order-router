import { ChainId, Token } from '@uniswap/sdk-core';
import NodeCache from 'node-cache';
import sinon from 'sinon';
import { ITokenFeeFetcher, OnChainTokenFeeFetcher, TokenFeeMap } from '../../../src/providers/token-fee-fetcher';
import { BigNumber } from '@ethersproject/bignumber';
import {
  ITokenPropertiesProvider,
  ITokenValidatorProvider,
  TokenPropertiesProvider,
  TokenPropertiesResult,
  TokenValidationResult,
  TokenValidatorProvider
} from '../../../src';
import { NodeJSCache } from '../../../src';
import { ICache } from '../../../src';
import { USDC_MAINNET } from '../../../src';

describe('TokenPropertiesProvider', () => {
  let tokenPropertiesProvider: ITokenPropertiesProvider
  let mockTokenValidatorProvider: sinon.SinonStubbedInstance<ITokenValidatorProvider>
  let cache: ICache<TokenPropertiesResult>
  let mockTokenFeeFetcher: sinon.SinonStubbedInstance<ITokenFeeFetcher>

  const CACHE_KEY = (chainId: ChainId, address: string) =>
    `token-properties-${chainId}-${address}`;

  beforeEach(async () => {
    cache = new NodeJSCache(new NodeCache({ stdTTL: 3600, useClones: false }));
    mockTokenFeeFetcher = sinon.createStubInstance(OnChainTokenFeeFetcher)
    mockTokenValidatorProvider = sinon.createStubInstance(TokenValidatorProvider)

    tokenPropertiesProvider = new TokenPropertiesProvider(
      ChainId.MAINNET,
      mockTokenValidatorProvider,
      cache,
      mockTokenFeeFetcher,
    )

    mockTokenValidatorProvider.validateTokens.callsFake(async (tokens) => {
      const tokenToResult: { [tokenAddress: string]: TokenValidationResult } = {};
      tokens.forEach((token) => tokenToResult[token.address.toLowerCase()] = TokenValidationResult.FOT)
      return {
        getValidationByToken: (token: Token) =>
          tokenToResult[token.address.toLowerCase()],
      };
    })

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
      const token = USDC_MAINNET

      expect(await cache.get(CACHE_KEY(ChainId.MAINNET, token.address.toLowerCase()))).toBeUndefined();
      const tokenPropertiesMap = await tokenPropertiesProvider.getTokensProperties([token]);
      expect(tokenPropertiesMap[token.address.toLowerCase()]).toBeDefined();
      assertExpectedTokenProperties(tokenPropertiesMap[token.address.toLowerCase()], BigNumber.from(213), BigNumber.from(800), TokenValidationResult.FOT);

      const cachedTokenProperties = await cache.get(CACHE_KEY(ChainId.MAINNET, token.address.toLowerCase()))
      expect(cachedTokenProperties).toBeDefined();
      assertExpectedTokenProperties(cachedTokenProperties, BigNumber.from(213), BigNumber.from(800), TokenValidationResult.FOT);
    })

    it('succeeds to get token fee cache hit and second token fee fetcher call is skipped', async function() {
      const token = USDC_MAINNET

      expect(await cache.get(CACHE_KEY(ChainId.MAINNET, token.address.toLowerCase()))).toBeUndefined();
      const tokenPropertiesMap = await tokenPropertiesProvider.getTokensProperties([token]);
      expect(tokenPropertiesMap[token.address.toLowerCase()]).toBeDefined();
      assertExpectedTokenProperties(tokenPropertiesMap[token.address.toLowerCase()], BigNumber.from(213), BigNumber.from(800), TokenValidationResult.FOT);
      sinon.assert.calledOnce(mockTokenFeeFetcher.fetchFees)

      const cachedTokenProperties = await cache.get(CACHE_KEY(ChainId.MAINNET, token.address.toLowerCase()))
      expect(cachedTokenProperties).toBeDefined();
      assertExpectedTokenProperties(cachedTokenProperties, BigNumber.from(213), BigNumber.from(800), TokenValidationResult.FOT);
      sinon.assert.calledOnce(mockTokenFeeFetcher.fetchFees)
    });

    it('succeeds to get token allowlist with no on-chain calls nor caching', async function() {
      const allowListToken = new Token(1, '0x777E2ae845272a2F540ebf6a3D03734A5a8f618e', 18);
      const tokenPropertiesMap = await tokenPropertiesProvider.getTokensProperties([allowListToken]);

      expect(tokenPropertiesMap[allowListToken.address.toLowerCase()]).toBeDefined();
      expect(tokenPropertiesMap[allowListToken.address.toLowerCase()]?.tokenFeeResult).toBeUndefined();
      assertExpectedTokenProperties(tokenPropertiesMap[allowListToken.address.toLowerCase()], undefined, undefined, TokenValidationResult.UNKN);

      expect(await cache.get(CACHE_KEY(ChainId.MAINNET, allowListToken.address.toLowerCase()))).toBeUndefined();
    });

    it('succeeds to get token properties in a single batch', async function() {
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

      const tokenPropertiesMap = await tokenPropertiesProvider.getTokensProperties(tokens);

      for (const token of tokens) {
        const address = token.address.toLowerCase()
        expect(tokenPropertiesMap[address]).toBeDefined();
        expect(tokenPropertiesMap[address]?.tokenFeeResult).toBeDefined();
        const expectedBuyFeeBps = tokenPropertiesMap[address]?.tokenFeeResult?.buyFeeBps
        const expectedSellFeeBps = tokenPropertiesMap[address]?.tokenFeeResult?.sellFeeBps
        assertExpectedTokenProperties(tokenPropertiesMap[address], expectedBuyFeeBps, expectedSellFeeBps, TokenValidationResult.FOT);

        const cachedTokenProperties = await cache.get(CACHE_KEY(ChainId.MAINNET, token.address.toLowerCase()))
        expect(cachedTokenProperties).toBeDefined();
        assertExpectedTokenProperties(cachedTokenProperties, expectedBuyFeeBps, expectedSellFeeBps, TokenValidationResult.FOT);
      }
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


