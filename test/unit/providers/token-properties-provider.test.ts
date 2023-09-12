import { ChainId, Token } from '@uniswap/sdk-core';
import NodeCache from 'node-cache';
import sinon from 'sinon';
import {
  ITokenFeeFetcher,
  OnChainTokenFeeFetcher,
  TokenFeeMap
} from '../../../src/providers/token-fee-fetcher';
import { BigNumber } from '@ethersproject/bignumber';
import {
  CallSameFunctionOnContractWithMultipleParams,
  ICache,
  IMulticallProvider,
  ITokenPropertiesProvider,
  ITokenValidatorProvider,
  NodeJSCache,
  TokenPropertiesProvider,
  TokenPropertiesResult,
  TokenValidationResult,
  TokenValidatorProvider,
  UniswapMulticallConfig,
  UniswapMulticallProvider,
  USDC_MAINNET
} from '../../../src';

describe('TokenPropertiesProvider', () => {
  let tokenPropertiesProvider: ITokenPropertiesProvider
  let tokenValidatorProvider: ITokenValidatorProvider
  let tokenPropertiesResultCache: ICache<TokenPropertiesResult>
  let tokenValidationResultCache: ICache<TokenValidationResult>
  let mockMulticall2Provider: sinon.SinonStubbedInstance<IMulticallProvider<UniswapMulticallConfig>>
  let mockTokenFeeFetcher: sinon.SinonStubbedInstance<ITokenFeeFetcher>

  const CACHE_KEY = (chainId: ChainId, address: string) =>
    `token-properties-${chainId}-${address}`;

  beforeEach(async () => {
    tokenPropertiesResultCache = new NodeJSCache(new NodeCache({ stdTTL: 3600, useClones: false }));
    tokenValidationResultCache = new NodeJSCache(new NodeCache({ stdTTL: 3600, useClones: false }));
    mockTokenFeeFetcher = sinon.createStubInstance(OnChainTokenFeeFetcher)
    mockMulticall2Provider = sinon.createStubInstance(UniswapMulticallProvider)

    tokenValidatorProvider = new TokenValidatorProvider(
      ChainId.MAINNET,
      mockMulticall2Provider,
      tokenValidationResultCache,
    )

    tokenPropertiesProvider = new TokenPropertiesProvider(
      ChainId.MAINNET,
      tokenValidatorProvider,
      tokenPropertiesResultCache,
      mockTokenFeeFetcher,
    )

    type functionParams = [string, string[], string][]
    mockMulticall2Provider.callSameFunctionOnContractWithMultipleParams.callsFake(async (
      params: CallSameFunctionOnContractWithMultipleParams<functionParams | undefined, UniswapMulticallConfig>) => {
      return {
        blockNumber: BigNumber.from(100),
        approxGasUsedPerSuccessCall: 100,
        results: params.functionParams.map((_?: functionParams) => {
          return ({
            success: true,
            result: [TokenValidationResult.FOT]
          })
        })
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

      expect(await tokenPropertiesResultCache.get(CACHE_KEY(ChainId.MAINNET, token.address.toLowerCase()))).toBeUndefined();
      const tokenPropertiesMap = await tokenPropertiesProvider.getTokensProperties([token], { enableFeeOnTransferFeeFetching: true });
      expect(tokenPropertiesMap[token.address.toLowerCase()]).toBeDefined();
      assertExpectedTokenProperties(tokenPropertiesMap[token.address.toLowerCase()], BigNumber.from(213), BigNumber.from(800), TokenValidationResult.FOT);

      const cachedTokenProperties = await tokenPropertiesResultCache.get(CACHE_KEY(ChainId.MAINNET, token.address.toLowerCase()))
      expect(cachedTokenProperties).toBeDefined();
      assertExpectedTokenProperties(cachedTokenProperties, BigNumber.from(213), BigNumber.from(800), TokenValidationResult.FOT);
    })

    it('succeeds to get token fee cache hit and second token fee fetcher call is skipped', async function() {
      const token = USDC_MAINNET

      expect(await tokenPropertiesResultCache.get(CACHE_KEY(ChainId.MAINNET, token.address.toLowerCase()))).toBeUndefined();
      const tokenPropertiesMap = await tokenPropertiesProvider.getTokensProperties([token], { enableFeeOnTransferFeeFetching: true });
      expect(tokenPropertiesMap[token.address.toLowerCase()]).toBeDefined();
      assertExpectedTokenProperties(tokenPropertiesMap[token.address.toLowerCase()], BigNumber.from(213), BigNumber.from(800), TokenValidationResult.FOT);
      sinon.assert.calledOnce(mockTokenFeeFetcher.fetchFees)

      const cachedTokenProperties = await tokenPropertiesResultCache.get(CACHE_KEY(ChainId.MAINNET, token.address.toLowerCase()))
      expect(cachedTokenProperties).toBeDefined();
      assertExpectedTokenProperties(cachedTokenProperties, BigNumber.from(213), BigNumber.from(800), TokenValidationResult.FOT);
      sinon.assert.calledOnce(mockTokenFeeFetcher.fetchFees)
    });

    it('succeeds to get token allowlist with no on-chain calls nor caching', async function() {
      const allowListToken = new Token(1, '0x777E2ae845272a2F540ebf6a3D03734A5a8f618e', 18);
      const tokenPropertiesMap = await tokenPropertiesProvider.getTokensProperties([allowListToken], { enableFeeOnTransferFeeFetching: true });

      expect(tokenPropertiesMap[allowListToken.address.toLowerCase()]).toBeDefined();
      expect(tokenPropertiesMap[allowListToken.address.toLowerCase()]?.tokenFeeResult).toBeUndefined();
      assertExpectedTokenProperties(tokenPropertiesMap[allowListToken.address.toLowerCase()], undefined, undefined, TokenValidationResult.UNKN);

      expect(await tokenPropertiesResultCache.get(CACHE_KEY(ChainId.MAINNET, allowListToken.address.toLowerCase()))).toBeUndefined();
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
      }
    });

    it('all tokens in the batch failed to get token validation result, no fees fetched', async function() {
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

      type functionParams = [string, string[], string][]
      mockMulticall2Provider.callSameFunctionOnContractWithMultipleParams.callsFake(async (
        params: CallSameFunctionOnContractWithMultipleParams<functionParams | undefined, UniswapMulticallConfig>) => {
        return {
          blockNumber: BigNumber.from(100),
          approxGasUsedPerSuccessCall: 100,
          results: params.functionParams.map(() => {
            return { success: false, returnData: 'Not FOT' }
          })
        };
      })

      const tokenPropertiesMap = await tokenPropertiesProvider.getTokensProperties(tokens, { enableFeeOnTransferFeeFetching: true });

      for (const token of tokens) {
        const address = token.address.toLowerCase()
        expect(tokenPropertiesMap[address]).toBeDefined();
        expect(tokenPropertiesMap[address]?.tokenFeeResult).toBeUndefined();
        assertExpectedTokenProperties(tokenPropertiesMap[address], undefined, undefined, undefined);

        const cachedTokenProperties = await tokenPropertiesResultCache.get(CACHE_KEY(ChainId.MAINNET, token.address.toLowerCase()))
        expect(cachedTokenProperties).toBeUndefined();
      }
    });

    it('all token fee fetch failed', async function() {
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
        assertExpectedTokenProperties(tokenPropertiesMap[address], undefined, undefined, TokenValidationResult.FOT);

        const cachedTokenProperties = await tokenPropertiesResultCache.get(CACHE_KEY(ChainId.MAINNET, token.address.toLowerCase()))
        expect(cachedTokenProperties).toBeUndefined();

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


