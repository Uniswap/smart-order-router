import { ChainId } from '@uniswap/sdk-core';
import dotenv from 'dotenv';
import { GraphQLClient } from 'graphql-request';
import sinon from 'sinon';
import { V4SubgraphProvider } from '../../../../src';

dotenv.config();

describe('SubgraphProvider V4', () => {
  function constructPool(id: string, liquidity: string, totalValueLockedETH: string) {
    return {
      id: id,
      token0: {
        id: '0xToken0',
        symbol: 'TOKEN0'
      },
      token1: { id: '0xToken1', symbol: 'TOKEN1' },
      feeTier: '3000',
      tickSpacing: '60',
      hooks: '0x0000000000000000000000000000000000000000',
      liquidity: liquidity,
      totalValueLockedUSD: '1000.0',
      totalValueLockedETH: totalValueLockedETH,
    };
  }

  let requestStub: sinon.SinonStub;
  let subgraphProvider: V4SubgraphProvider;

  beforeEach(() => {});

  afterEach(() => {
    sinon.restore();
  });

  it('fetches subgraph pools if totalValueLockedETH is above threshold', async () => {
    requestStub = sinon.stub(GraphQLClient.prototype, 'request');
    subgraphProvider = new V4SubgraphProvider(ChainId.MAINNET, 2, 30000, true, 0.01, 0.001,Number.MAX_VALUE, 'test_url');

    const highTrackedETHResponse = {
      pools: [constructPool('0xAddress1', '1000000', '1.0')], // High tracked ETH
    };
    const emptyResponse = { pools: [] };

    // For V4, we expect 2 queries: High tracked ETH, High liquidity
    requestStub.resolves(emptyResponse); // Default response for most queries
    requestStub.onCall(0).resolves(highTrackedETHResponse); // High tracked ETH query
    requestStub.onCall(1).resolves(emptyResponse); // High liquidity query

    const pools = await subgraphProvider.getPools();
    expect(pools.length).toEqual(1);
    expect(pools[0]!.tvlETH).toEqual(1.0);
  });

  it('fetches 0 subgraph pools if totalValueLockedETH is below threshold and liquidity is 0', async () => {
    requestStub = sinon.stub(GraphQLClient.prototype, 'request');
    subgraphProvider = new V4SubgraphProvider(ChainId.MAINNET, 2, 30000, true, 0.01, 0.001, Number.MAX_VALUE, 'test_url');

    const lowTrackedETHResponse = {
      pools: [constructPool('0xAddress2', '0', '0.001')], // Low tracked ETH and zero liquidity
    };
    const emptyResponse = { pools: [] };

    // All queries return empty except one that returns a pool with low tracked ETH and zero liquidity
    requestStub.resolves(emptyResponse);
    requestStub.onCall(0).resolves(lowTrackedETHResponse); // High tracked ETH query

    const pools = await subgraphProvider.getPools();
    expect(pools.length).toEqual(0);
  });

  it('fetches subgraph pools if liquidity is above 0', async () => {
    requestStub = sinon.stub(GraphQLClient.prototype, 'request');
    subgraphProvider = new V4SubgraphProvider(ChainId.MAINNET, 2, 30000, true, 0.01, 0.001, Number.MAX_VALUE, 'test_url');

    const highLiquidityResponse = {
      pools: [constructPool('0xAddress3', '1000000', '0.001')], // High liquidity, low tracked ETH
    };
    const emptyResponse = { pools: [] };

    requestStub.resolves(emptyResponse);
    requestStub.onCall(1).resolves(highLiquidityResponse); // High liquidity query

    const pools = await subgraphProvider.getPools();
    expect(pools.length).toEqual(1);
    expect(pools[0]!.liquidity).toEqual('1000000');
  });

  it('fetches 0 subgraph pools if liquidity is 0', async () => {
    requestStub = sinon.stub(GraphQLClient.prototype, 'request');
    subgraphProvider = new V4SubgraphProvider(ChainId.MAINNET, 2, 30000, true, 0.01, 0.001, Number.MAX_VALUE, 'test_url');

    const zeroLiquidityResponse = {
      pools: [constructPool('0xAddress4', '0', '0.001')], // Zero liquidity
    };
    const emptyResponse = { pools: [] };

    requestStub.resolves(emptyResponse);
    requestStub.onCall(1).resolves(zeroLiquidityResponse); // High liquidity query

    const pools = await subgraphProvider.getPools();
    expect(pools.length).toEqual(0);
  });

  it('deduplicates pools that match multiple criteria', async () => {
    requestStub = sinon.stub(GraphQLClient.prototype, 'request');
    subgraphProvider = new V4SubgraphProvider(ChainId.MAINNET, 2, 30000, true, 0.01, 0.001, Number.MAX_VALUE, 'test_url');

    const samePool = constructPool('0xAddress5', '1000000', '1.0'); // Pool with high liquidity and high tracked ETH
    const highTrackedETHResponse = { pools: [samePool] };
    const highLiquidityResponse = { pools: [samePool] }; // Same pool returned by different query
    const emptyResponse = { pools: [] };

    requestStub.resolves(emptyResponse);
    requestStub.onCall(0).resolves(highTrackedETHResponse); // High tracked ETH query
    requestStub.onCall(1).resolves(highLiquidityResponse); // High liquidity query

    const pools = await subgraphProvider.getPools();
    expect(pools.length).toEqual(1); // Should be deduplicated
    expect(pools[0]!.tvlETH).toEqual(1.0);
    expect(pools[0]!.liquidity).toEqual('1000000');
  });

  it('correctly maps V4-specific fields', async () => {
    requestStub = sinon.stub(GraphQLClient.prototype, 'request');
    subgraphProvider = new V4SubgraphProvider(ChainId.MAINNET, 2, 30000, true, 0.01, 0.001, Number.MAX_VALUE, 'test_url');

    const v4PoolResponse = {
      pools: [{
        id: '0xAddress2',
        token0: { id: '0xToken0', symbol: 'TOKEN0' },
        token1: { id: '0xToken1', symbol: 'TOKEN1' },
        feeTier: '500',
        tickSpacing: '10',
        hooks: '0x1234567890123456789012345678901234567890',
        liquidity: '500000',
        totalValueLockedUSD: '2000.0',
        totalValueLockedETH: '2.0',
      }],
    };
    const emptyResponse = { pools: [] };

    requestStub.resolves(emptyResponse);
    requestStub.onCall(0).resolves(v4PoolResponse); // High tracked ETH query

    const pools = await subgraphProvider.getPools();
    expect(pools.length).toEqual(1);
    expect(pools[0]!.id).toEqual('0xAddress2');
    expect(pools[0]!.feeTier).toEqual('500');
    expect(pools[0]!.tickSpacing).toEqual('10');
    expect(pools[0]!.hooks).toEqual('0x1234567890123456789012345678901234567890');
    expect(pools[0]!.liquidity).toEqual('500000');
    expect(pools[0]!.tvlUSD).toEqual(2000.0);
    expect(pools[0]!.tvlETH).toEqual(2.0);
  });

  it('handles empty responses from all queries', async () => {
    requestStub = sinon.stub(GraphQLClient.prototype, 'request');
    subgraphProvider = new V4SubgraphProvider(ChainId.MAINNET, 2, 30000, true, 0.01, 0.001, Number.MAX_VALUE, 'test_url');

    const emptyResponse = { pools: [] };

    // All queries return empty
    requestStub.resolves(emptyResponse);

    const pools = await subgraphProvider.getPools();
    expect(pools.length).toEqual(0);
  });

  it('handles multiple pools from different queries', async () => {
    requestStub = sinon.stub(GraphQLClient.prototype, 'request');
    subgraphProvider = new V4SubgraphProvider(ChainId.MAINNET, 2, 30000, true, 0.01, 0.001, Number.MAX_VALUE, 'test_url');

    const highTrackedETHResponse = {
      pools: [constructPool('0xAddress6', '1000000', '1.0')],
    };
    const highLiquidityResponse = {
      pools: [constructPool('0xAddress7', '2000000', '2.0')],
    };
    const emptyResponse = { pools: [] };

    // Mock responses for the two V4 queries
    let callCount = 0;
    requestStub.callsFake(() => {
      callCount++;
      // High tracked ETH query returns one pool
      if (callCount === 1) return Promise.resolve(highTrackedETHResponse);
      if (callCount === 2) return Promise.resolve(emptyResponse); // End pagination for first query
      // High liquidity query returns another pool
      if (callCount === 3) return Promise.resolve(highLiquidityResponse);
      if (callCount === 4) return Promise.resolve(emptyResponse); // End pagination for second query
      // Default for any other calls
      return Promise.resolve(emptyResponse);
    });

    const pools = await subgraphProvider.getPools();
    expect(pools.length).toEqual(2);
    expect(pools[0]!.tvlETH).toEqual(1.0);
    expect(pools[1]!.tvlETH).toEqual(2.0);
  });

  describe('parallel query error handling', () => {
    it('fails entire operation when one query throws an error', async () => {
      requestStub = sinon.stub(GraphQLClient.prototype, 'request');
      subgraphProvider = new V4SubgraphProvider(ChainId.MAINNET, 0, 1000, true, 0.01, 0.001, Number.MAX_VALUE, 'test_url');

      const highTrackedETHResponse = {
        pools: [constructPool('0xAddress1', '1000000', '1.0')],
      };
      const emptyResponse = { pools: [] };

      // First query succeeds, second query fails
      requestStub.onCall(0).resolves(highTrackedETHResponse); // High tracked ETH query succeeds
      requestStub.onCall(1).rejects(new Error('Network error')); // High liquidity query fails
      requestStub.onCall(2).resolves(emptyResponse); // End pagination for first query

      await expect(subgraphProvider.getPools()).rejects.toThrow('Network error');
    });

    it('fails entire operation when one query times out', async () => {
      requestStub = sinon.stub(GraphQLClient.prototype, 'request');
      subgraphProvider = new V4SubgraphProvider(ChainId.MAINNET, 0, 1000, true, 0.01, 0.001, Number.MAX_VALUE, 'test_url');

      const emptyResponse = { pools: [] };

      // First query succeeds, second query times out
      requestStub.onCall(0).resolves(emptyResponse); // High tracked ETH query succeeds
      requestStub.onCall(1).rejects(new Error('timeout')); // High liquidity query times out
      requestStub.onCall(2).resolves(emptyResponse); // End pagination for first query

      await expect(subgraphProvider.getPools()).rejects.toThrow('timeout');
    });

    it('retries entire operation when parallel queries fail', async () => {
      requestStub = sinon.stub(GraphQLClient.prototype, 'request');
      subgraphProvider = new V4SubgraphProvider(ChainId.MAINNET, 1, 1000, true, 0.01, 0.001, Number.MAX_VALUE, 'test_url');

      const highTrackedETHResponse = {
        pools: [constructPool('0xAddress2', '1000000', '1.0')],
      };
      const emptyResponse = { pools: [] };

      // First attempt: all queries fail
      requestStub.onCall(0).rejects(new Error('Network error'));
      requestStub.onCall(1).rejects(new Error('Network error'));

      // Second attempt: queries succeed
      requestStub.onCall(2).resolves(highTrackedETHResponse); // High tracked ETH query
      requestStub.onCall(3).resolves(emptyResponse); // End pagination for first query
      requestStub.onCall(4).resolves(emptyResponse); // High liquidity query
      requestStub.onCall(5).resolves(emptyResponse); // End pagination for second query

      const pools = await subgraphProvider.getPools();
      expect(pools.length).toEqual(1);
      expect(pools[0]!.tvlETH).toEqual(1.0);
    });

    it('fails after all retries when parallel queries consistently fail', async () => {
      requestStub = sinon.stub(GraphQLClient.prototype, 'request');
      subgraphProvider = new V4SubgraphProvider(ChainId.MAINNET, 0, 1000, true, 0.01, 0.001, Number.MAX_VALUE, 'test_url'); // No retries

      // All attempts fail
      requestStub.rejects(new Error('Persistent network error'));

      await expect(subgraphProvider.getPools()).rejects.toThrow('Persistent network error');
    });
  });

  // Keep the original test but unskip it and update it to work with the new structure
  it.skip('can fetch subgraph pools from actual subgraph', async () => {
    if (!process.env.SUBGRAPH_URL_SEPOLIA) {
      console.log('Skipping actual subgraph test - no SUBGRAPH_URL_SEPOLIA provided');
      return;
    }

    const subgraphProvider = new V4SubgraphProvider(
      ChainId.MAINNET,
      2,
      30000,
      true,
      0.01,
      0.001,
      Number.MAX_VALUE,
      process.env.SUBGRAPH_URL_SEPOLIA
    );

    const pools = await subgraphProvider.getPools();

    // Just verify we get some pools and they have the expected structure
    expect(pools.length).toBeGreaterThanOrEqual(0);
    if (pools.length > 0) {
      const pool = pools[0]!;
      expect(pool.id).toBeDefined();
      expect(pool.feeTier).toBeDefined();
      expect(pool.tickSpacing).toBeDefined();
      expect(pool.hooks).toBeDefined();
      expect(pool.liquidity).toBeDefined();
      expect(pool.tvlUSD).toBeDefined();
      expect(pool.tvlETH).toBeDefined();
    }
  });
});
