import {
  TokenPropertiesProvider,
  UniswapMulticallProvider,
  V2PoolProvider
} from '../../../../build/main';
import { ChainId, Token } from '@uniswap/sdk-core';
import { JsonRpcProvider } from '@ethersproject/providers';
import {
  NodeJSCache,
  usdGasTokensByChain, WRAPPED_NATIVE_CURRENCY
} from '../../../../src';
import NodeCache from 'node-cache';
import {
  OnChainTokenFeeFetcher
} from '../../../../src/providers/token-fee-fetcher';
import _ from 'lodash';

describe('PoolProvider',  () => {
  it('pools', async () => {
    const chain = ChainId.ARBITRUM_ONE;
    const provider = new JsonRpcProvider('https://arbitrum-mainnet.infura.io/v3/1251f92fb3044883b08bd8913471ba6e', chain);
    const multicallProvider = new UniswapMulticallProvider(chain, provider);
    const tokenFeeFetcher = new OnChainTokenFeeFetcher(
      ChainId.MAINNET,
      provider
    )
    const tokenPropertiesProvider = new TokenPropertiesProvider(
      ChainId.MAINNET,
      new NodeJSCache(new NodeCache({ stdTTL: 360, useClones: false })),
      tokenFeeFetcher
    )
    const poolProvider = new V2PoolProvider(
      ChainId.ARBITRUM_ONE,
      multicallProvider,
      tokenPropertiesProvider
    );

    const usdTokens = usdGasTokensByChain[chain];
    const usdPools = _.map<Token, [Token, Token]>(usdTokens, (usdToken) => [
      usdToken,
      WRAPPED_NATIVE_CURRENCY[chain]!,
    ]);

    const poolsAccessor = await poolProvider.getPools(usdPools)
    const poolsRaw = poolsAccessor.getAllPools();
    const pools = _.filter(
      poolsRaw,
      (pool) =>
        pool.reserve0.greaterThan(0) &&
        pool.reserve1.greaterThan(0) &&
        // this case should never happen in production, but when we mock the pool provider it may return non native pairs
        (pool.token0.equals(WRAPPED_NATIVE_CURRENCY[chain]!) ||
          pool.token1.equals(WRAPPED_NATIVE_CURRENCY[chain]!))
    );
    console.log(`pools ${JSON.stringify(pools)}`);
  })
});
