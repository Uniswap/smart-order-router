import { ID_TO_PROVIDER, UniswapMulticallProvider, V4PoolProvider } from '../../../../src';
import { ChainId, Currency, Token } from '@uniswap/sdk-core';
import { JsonRpcProvider } from '@ethersproject/providers';
import { ADDRESS_ZERO, FeeAmount } from '@uniswap/v3-sdk';
import dotenv from 'dotenv';

dotenv.config();

describe('PoolProvider', () => {
  it('can fetch pool state', async () => {
    const chainProvider = ID_TO_PROVIDER(ChainId.SEPOLIA);
    const provider = new JsonRpcProvider(chainProvider, ChainId.SEPOLIA);
    const multicallProvider = new UniswapMulticallProvider(ChainId.SEPOLIA, provider);

    const poolProvider = new V4PoolProvider(ChainId.SEPOLIA, multicallProvider);
    const USDC_SEPOLIA = new Token(
      ChainId.SEPOLIA,
      '0xbe2a7f5acecdc293bf34445a0021f229dd2edd49',
      18,
      'USDC',
      'USDC Token'
    );
    const OP_SEPOLIA = new Token(
      ChainId.SEPOLIA,
      '0xc268035619873d85461525f5fdb792dd95982161',
      18,
      'USDC',
      'USDC Token'
    );
    const currencyPairs: Array<[Currency, Currency, number, number, string]> = new Array([USDC_SEPOLIA, OP_SEPOLIA, FeeAmount.LOW, 10, ADDRESS_ZERO]);
    const poolAccessor = await poolProvider.getPools(currencyPairs, { blockNumber: 6534459});
    poolAccessor.getAllPools().forEach(pool => {
      expect(pool.poolId).toEqual('0xa40318dea5fabf21971f683f641b54d6d7d86f5b083cd6f0af9332c5c7a9ec06');
      expect(pool.liquidity.toString()).toEqual('10000000000000000000000');
      expect(pool.hooks).toEqual('0x0000000000000000000000000000000000000000');
      expect(pool.tickCurrent).toEqual(19);
    });
  })
})
