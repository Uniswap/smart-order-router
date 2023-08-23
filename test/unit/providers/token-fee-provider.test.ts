import { ChainId, Token } from '@uniswap/sdk-core';
import { BigNumber } from '@ethersproject/bignumber';
import _ from 'lodash';
import sinon from 'sinon';
import NodeCache from 'node-cache';
import {
  NodeJSCache,
  TokenFeeProvider,
  TokenFeeResult,
  UniswapMulticallProvider
} from '../../../src';

describe('token fee provider', () => {
  let cache: NodeJSCache<TokenFeeResult>;
  let mockMulticallProvider: sinon.SinonStubbedInstance<UniswapMulticallProvider>;

  let tokenFeeProvider: TokenFeeProvider;

  const CACHE_KEY = (chainId: ChainId, address: string) =>
    `token-${chainId}-${address}`;

  beforeEach(async () => {
    cache = new NodeJSCache(new NodeCache({ stdTTL: 3600, useClones: false }));
    mockMulticallProvider = sinon.createStubInstance(UniswapMulticallProvider);

    tokenFeeProvider = new TokenFeeProvider(
      ChainId.MAINNET,
      mockMulticallProvider,
      cache
    );
  });

  describe('get token fees by address', () => {
    test('succeeds to get token fee and updates cache', async () => {
      const token = new Token(1, '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48', 18);

      mockMulticallProvider.callSameFunctionOnContractWithMultipleParams.callsFake(async function(params: any) {
        return {
          blockNumber: BigNumber.from(100),
          approxGasUsedPerSuccessCall: 100,
          results: params.functionParams.map(([_address, _base, _amount]: [string, string, string]) => ({
            success: true,
            result: [{
              buyFeeBps: BigNumber.from(213),
              sellFeeBps: BigNumber.from(800),
            }]
          }))
        };
      });

      expect(await cache.get(CACHE_KEY(ChainId.MAINNET, token.address.toLowerCase()))).toBeUndefined();
      const { getFeesByToken } = await tokenFeeProvider.validateTokens([token]);
      const fees = getFeesByToken(token);
      expect(fees?.buyFeeBps).toEqual(BigNumber.from(213));
      expect(fees?.sellFeeBps).toEqual(BigNumber.from(800));

      expect(await cache.get(CACHE_KEY(ChainId.MAINNET, token.address.toLowerCase()))).toBeDefined();
    });

    test.only('succeeds to get token fee cache hit', async () => {
      const token = new Token(1, '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48', 18);

      mockMulticallProvider.callSameFunctionOnContractWithMultipleParams.callsFake(async function(params: any) {
        return {
          blockNumber: BigNumber.from(100),
          approxGasUsedPerSuccessCall: 100,
          results: params.functionParams.map(([_address, _base, _amount]: [string, string, string]) => ({
            success: true,
            result: [{
              buyFeeBps: BigNumber.from(213),
              sellFeeBps: BigNumber.from(800),
            }]
          }))
        };
      });

      let { getFeesByToken } = await tokenFeeProvider.validateTokens([token]);
      let fees = getFeesByToken(token);
      expect(fees?.buyFeeBps).toEqual(BigNumber.from(213));
      expect(fees?.sellFeeBps).toEqual(BigNumber.from(800));

      // Checks cache, then sets it with the token.
      expect(await cache.get(CACHE_KEY(ChainId.MAINNET, token.address.toLowerCase()))).toBeDefined();
      sinon.assert.calledOnce(mockMulticallProvider.callSameFunctionOnContractWithMultipleParams);

      ({ getFeesByToken } = await tokenFeeProvider.validateTokens([token]));
      fees = getFeesByToken(token);
      expect(fees?.buyFeeBps).toEqual(BigNumber.from(213));
      expect(fees?.sellFeeBps).toEqual(BigNumber.from(800));

      // set and multicall should not be called again
      expect(await cache.get(CACHE_KEY(ChainId.MAINNET, token.address.toLowerCase()))).toBeDefined();
      sinon.assert.calledOnce(mockMulticallProvider.callSameFunctionOnContractWithMultipleParams);
    });

    test.only('succeeds to get token allowlist', async () => {
      const token = new Token(1, '0x777E2ae845272a2F540ebf6a3D03734A5a8f618e', 18);

      mockMulticallProvider.callSameFunctionOnContractWithMultipleParams.callsFake(async function(params: any) {
        return {
          blockNumber: BigNumber.from(100),
          approxGasUsedPerSuccessCall: 100,
          results: params.functionParams.map(([_address, _base, _amount]: [string, string, string]) => ({
            success: true,
            result: [{
              buyFeeBps: BigNumber.from(213),
              sellFeeBps: BigNumber.from(800),
            }]
          }))
        };
      });

      let { getFeesByToken } = await tokenFeeProvider.validateTokens([token]);
      let fees = getFeesByToken(token);
      expect(fees?.buyFeeBps).toEqual(BigNumber.from(0));
      expect(fees?.sellFeeBps).toEqual(BigNumber.from(0));

      sinon.assert.notCalled(mockMulticallProvider.callSameFunctionOnContractWithMultipleParams);
    });

    test('succeeds to get token fee in batch', async () => {
      const token1 = new Token(1, '0x0000000000000000000000000000000000000012', 18);
      const token2 = new Token(1, '0x0000000000000000000000000000000000000034', 18);
      const token3 = new Token(1, '0x0000000000000000000000000000000000000056', 18);

      mockMulticallProvider.callSameFunctionOnContractWithMultipleParams.callsFake(async function(params: any) {
        return {
          blockNumber: BigNumber.from(100),
          approxGasUsedPerSuccessCall: 100,
          results: params.functionParams.map(([address, _base, _amount]: [string, string, string]) => ({
            success: true,
            result: [{
              buyFeeBps: BigNumber.from(parseInt(address[address.length - 1]!)),
              sellFeeBps: BigNumber.from(parseInt(address[address.length - 2]!)),
            }]
          }))
        };
      });

      const { getFeesByToken } = await tokenFeeProvider.validateTokens([token1, token2, token3]);
      expect(getFeesByToken(token1)).toEqual({ buyFeeBps: BigNumber.from(2), sellFeeBps: BigNumber.from(1) });
      expect(getFeesByToken(token2)).toEqual({ buyFeeBps: BigNumber.from(4), sellFeeBps: BigNumber.from(3) });
      expect(getFeesByToken(token3)).toEqual({ buyFeeBps: BigNumber.from(6), sellFeeBps: BigNumber.from(5) });
    });

    test('skips failing detection', async () => {
      const token = new Token(1, '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48', 18);

      mockMulticallProvider.callSameFunctionOnContractWithMultipleParams.callsFake(async function(params: any) {
        return {
          blockNumber: BigNumber.from(100),
          approxGasUsedPerSuccessCall: 100,
          results: params.functionParams.map(([_address, _base, _amount]: [string, string, string]) => ({
            success: false,
            result: [{
              buyFeeBps: BigNumber.from(213),
              sellFeeBps: BigNumber.from(800),
            }]
          }))
        };
      });

      const { getFeesByToken } = await tokenFeeProvider.validateTokens([token]);
      expect(getFeesByToken(token)).toBeUndefined();
    });
  });
});
