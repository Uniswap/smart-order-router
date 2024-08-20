import dotenv from 'dotenv';
import {
  ID_TO_PROVIDER,
  UniswapMulticallProvider,
  USDC_MAINNET,
  V3PoolProvider,
  WRAPPED_NATIVE_CURRENCY,
} from '../../../../src';
import { ChainId, Token } from '@uniswap/sdk-core';
import { JsonRpcProvider } from '@ethersproject/providers';
import { FeeAmount } from '@uniswap/v3-sdk';

dotenv.config();

describe('PoolProvider', () => {
  it('can fetch pool state', async () => {
    const chainProvider = ID_TO_PROVIDER(ChainId.MAINNET);
    const provider = new JsonRpcProvider(chainProvider, ChainId.MAINNET);
    const multicallProvider = new UniswapMulticallProvider(ChainId.MAINNET, provider);

    const poolProvider = new V3PoolProvider(ChainId.MAINNET, multicallProvider);
    const currencyPairs: Array<[Token, Token, number]> = new Array([USDC_MAINNET, WRAPPED_NATIVE_CURRENCY[ChainId.MAINNET], FeeAmount.LOW]);
    const poolAccessor = await poolProvider.getPools(currencyPairs, { blockNumber: 20567408});
    poolAccessor.getAllPools().forEach(pool => {
      expect(pool.liquidity.toString()).toEqual('7978446294123224544');
      expect(pool.tickCurrent).toEqual(197428);
      expect(pool.sqrtRatioX96.toString()).toEqual('1533812393003003350263816133080409')
    });
  })
})
