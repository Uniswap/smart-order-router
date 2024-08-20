import dotenv from 'dotenv';
import { V4SubgraphPool, V4SubgraphProvider } from '../../../../src';
import { ChainId } from '@uniswap/sdk-core';

dotenv.config();

describe('SubgraphProvider', () => {
  it('can fetch subgraph pools', async () => {
    const subgraphProvider = new V4SubgraphProvider(ChainId.MAINNET, 2, 30000, true, 0.01, Number.MAX_VALUE, process.env.SUBGRAPH_URL_SEPOLIA);
    const pools = await subgraphProvider.getPools();
    pools.filter(pool => (pool as V4SubgraphPool).id === '0xa40318dea5fabf21971f683f641b54d6d7d86f5b083cd6f0af9332c5c7a9ec06')
      .forEach(pool => {
        expect(pool.id).toEqual('0xa40318dea5fabf21971f683f641b54d6d7d86f5b083cd6f0af9332c5c7a9ec06');
        expect(pool.liquidity.toString()).toEqual('10000000000000000000000');
      })
  })
})
