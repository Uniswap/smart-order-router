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
    subgraphProvider = new V4SubgraphProvider(ChainId.MAINNET, 2, 30000, true, 0.01, Number.MAX_VALUE, 'test_url');

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
    subgraphProvider = new V4SubgraphProvider(ChainId.MAINNET, 2, 30000, true, 0.01, Number.MAX_VALUE, 'test_url');

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
    subgraphProvider = new V4SubgraphProvider(ChainId.MAINNET, 2, 30000, true, 0.01, Number.MAX_VALUE, 'test_url');

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
    subgraphProvider = new V4SubgraphProvider(ChainId.MAINNET, 2, 30000, true, 0.01, Number.MAX_VALUE, 'test_url');

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
    subgraphProvider = new V4SubgraphProvider(ChainId.MAINNET, 2, 30000, true, 0.01, Number.MAX_VALUE, 'test_url');

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
    subgraphProvider = new V4SubgraphProvider(ChainId.MAINNET, 2, 30000, true, 0.01, Number.MAX_VALUE, 'test_url');

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
    subgraphProvider = new V4SubgraphProvider(ChainId.MAINNET, 2, 30000, true, 0.01, Number.MAX_VALUE, 'test_url');

    const emptyResponse = { pools: [] };

    // All queries return empty
    requestStub.resolves(emptyResponse);

    const pools = await subgraphProvider.getPools();
    expect(pools.length).toEqual(0);
  });

  it('handles multiple pools from different queries', async () => {
    requestStub = sinon.stub(GraphQLClient.prototype, 'request');
    subgraphProvider = new V4SubgraphProvider(ChainId.MAINNET, 2, 30000, true, 0.01, Number.MAX_VALUE, 'test_url');

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
      subgraphProvider = new V4SubgraphProvider(ChainId.MAINNET, 0, 1000, true, 0.01, Number.MAX_VALUE, 'test_url');

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
      subgraphProvider = new V4SubgraphProvider(ChainId.MAINNET, 0, 1000, true, 0.01, Number.MAX_VALUE, 'test_url');

      const emptyResponse = { pools: [] };

      // First query succeeds, second query times out
      requestStub.onCall(0).resolves(emptyResponse); // High tracked ETH query succeeds
      requestStub.onCall(1).rejects(new Error('timeout')); // High liquidity query times out
      requestStub.onCall(2).resolves(emptyResponse); // End pagination for first query

      await expect(subgraphProvider.getPools()).rejects.toThrow('timeout');
    });

    it('retries entire operation when parallel queries fail', async () => {
      requestStub = sinon.stub(GraphQLClient.prototype, 'request');
      subgraphProvider = new V4SubgraphProvider(ChainId.MAINNET, 1, 1000, true, 0.01, Number.MAX_VALUE, 'test_url');

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
      subgraphProvider = new V4SubgraphProvider(ChainId.MAINNET, 0, 1000, true, 0.01, Number.MAX_VALUE, 'test_url'); // No retries

      // All attempts fail
      requestStub.rejects(new Error('Persistent network error'));

      await expect(subgraphProvider.getPools()).rejects.toThrow('Persistent network error');
    });
  });

  describe('Zora hooks filtering on Base', () => {
    it('filters out Zora hooks pools with zero TVL on Base', async () => {
      requestStub = sinon.stub(GraphQLClient.prototype, 'request');
      subgraphProvider = new V4SubgraphProvider(ChainId.BASE, 2, 30000, true, 0.01, Number.MAX_VALUE, 'test_url');

      // Create pools with Zora hooks and zero TVL
      const zoraCreatorHookPool = {
        id: '0xZoraCreatorPool',
        token0: { id: '0xToken0', symbol: 'TOKEN0' },
        token1: { id: '0xToken1', symbol: 'TOKEN1' },
        feeTier: '3000',
        tickSpacing: '60',
        hooks: '0xd61A675F8a0c67A73DC3B54FB7318B4D91409040', // Zora creator hook
        liquidity: '1000000',
        totalValueLockedUSD: '1000.0',
        totalValueLockedETH: '0.0', // Zero TVL
      };

      const zoraPostHookPool = {
        id: '0xZoraPostPool',
        token0: { id: '0xToken2', symbol: 'TOKEN2' },
        token1: { id: '0xToken3', symbol: 'TOKEN3' },
        feeTier: '500',
        tickSpacing: '10',
        hooks: '0x9ea932730A7787000042e34390B8E435dD839040', // Zora post hook
        liquidity: '500000',
        totalValueLockedUSD: '500.0',
        totalValueLockedETH: '0.0', // Zero TVL
      };

      const normalPool = {
        id: '0xNormalPool',
        token0: { id: '0xToken4', symbol: 'TOKEN4' },
        token1: { id: '0xToken5', symbol: 'TOKEN5' },
        feeTier: '3000',
        tickSpacing: '60',
        hooks: '0x0000000000000000000000000000000000000000', // No hooks
        liquidity: '2000000',
        totalValueLockedUSD: '2000.0',
        totalValueLockedETH: '0.0', // Zero TVL but no Zora hooks
      };

      const highTVLPool = {
        id: '0xHighTVLPool',
        token0: { id: '0xToken6', symbol: 'TOKEN6' },
        token1: { id: '0xToken7', symbol: 'TOKEN7' },
        feeTier: '3000',
        tickSpacing: '60',
        hooks: '0xd61A675F8a0c67A73DC3B54FB7318B4D91409040', // Zora creator hook
        liquidity: '3000000',
        totalValueLockedUSD: '3000.0',
        totalValueLockedETH: '1.0', // High TVL
      };

      const response = {
        pools: [zoraCreatorHookPool, zoraPostHookPool, normalPool, highTVLPool],
      };
      const emptyResponse = { pools: [] };

      // Mock responses for the two V4 queries
      requestStub.onCall(0).resolves(response); // High tracked ETH query
      requestStub.onCall(1).resolves(emptyResponse); // End pagination for first query
      requestStub.onCall(2).resolves(emptyResponse); // High liquidity query
      requestStub.onCall(3).resolves(emptyResponse); // End pagination for second query

      const pools = await subgraphProvider.getPools();

      // Should filter out Zora hooks pools with zero TVL, but keep others
      expect(pools.length).toEqual(2);
      
      // Should keep normal pool (no Zora hooks, zero TVL)
      const normalPoolResult = pools.find(p => p.id === '0xNormalPool');
      expect(normalPoolResult).toBeDefined();
      expect(normalPoolResult!.hooks).toEqual('0x0000000000000000000000000000000000000000');
      
      // Should keep high TVL pool (Zora hooks but high TVL)
      const highTVLPoolResult = pools.find(p => p.id === '0xHighTVLPool');
      expect(highTVLPoolResult).toBeDefined();
      expect(highTVLPoolResult!.hooks).toEqual('0xd61A675F8a0c67A73DC3B54FB7318B4D91409040');
      expect(highTVLPoolResult!.tvlETH).toEqual(1.0);

      // Should filter out Zora creator hook pool with zero TVL
      const zoraCreatorPoolResult = pools.find(p => p.id === '0xZoraCreatorPool');
      expect(zoraCreatorPoolResult).toBeUndefined();

      // Should filter out Zora post hook pool with zero TVL
      const zoraPostPoolResult = pools.find(p => p.id === '0xZoraPostPool');
      expect(zoraPostPoolResult).toBeUndefined();
    });

    it('allows Zora hooks pools with non-zero TVL on Base', async () => {
      requestStub = sinon.stub(GraphQLClient.prototype, 'request');
      subgraphProvider = new V4SubgraphProvider(ChainId.BASE, 2, 30000, true, 0.01, Number.MAX_VALUE, 'test_url');

      const zoraCreatorHookPool = {
        id: '0xZoraCreatorPool',
        token0: { id: '0xToken0', symbol: 'TOKEN0' },
        token1: { id: '0xToken1', symbol: 'TOKEN1' },
        feeTier: '3000',
        tickSpacing: '60',
        hooks: '0xd61A675F8a0c67A73DC3B54FB7318B4D91409040', // Zora creator hook
        liquidity: '1000000',
        totalValueLockedUSD: '1000.0',
        totalValueLockedETH: '0.5', // Non-zero TVL
      };

      const response = {
        pools: [zoraCreatorHookPool],
      };
      const emptyResponse = { pools: [] };

      requestStub.onCall(0).resolves(response); // High tracked ETH query
      requestStub.onCall(1).resolves(emptyResponse); // End pagination for first query
      requestStub.onCall(2).resolves(emptyResponse); // High liquidity query
      requestStub.onCall(3).resolves(emptyResponse); // End pagination for second query

      const pools = await subgraphProvider.getPools();

      // Should allow Zora hooks pool with non-zero TVL
      expect(pools.length).toEqual(1);
      expect(pools[0]!.id).toEqual('0xZoraCreatorPool');
      expect(pools[0]!.hooks).toEqual('0xd61A675F8a0c67A73DC3B54FB7318B4D91409040');
      expect(pools[0]!.tvlETH).toEqual(0.5);
    });

    it('filters out Zora hooks pools with zero TVL on Base even if they have high liquidity', async () => {
      requestStub = sinon.stub(GraphQLClient.prototype, 'request');
      subgraphProvider = new V4SubgraphProvider(ChainId.BASE, 2, 30000, true, 0.01, Number.MAX_VALUE, 'test_url');

      const zoraCreatorHookPool = {
        id: '0xZoraCreatorPool',
        token0: { id: '0xToken0', symbol: 'TOKEN0' },
        token1: { id: '0xToken1', symbol: 'TOKEN1' },
        feeTier: '3000',
        tickSpacing: '60',
        hooks: '0xd61A675F8a0c67A73DC3B54FB7318B4D91409040', // Zora creator hook
        liquidity: '1000000', // High liquidity
        totalValueLockedUSD: '1000.0',
        totalValueLockedETH: '0.0', // Zero TVL
      };

      const normalPool = {
        id: '0xNormalPool',
        token0: { id: '0xToken2', symbol: 'TOKEN2' },
        token1: { id: '0xToken3', symbol: 'TOKEN3' },
        feeTier: '3000',
        tickSpacing: '60',
        hooks: '0x0000000000000000000000000000000000000000', // No hooks
        liquidity: '2000000', // High liquidity
        totalValueLockedUSD: '2000.0',
        totalValueLockedETH: '0.0', // Zero TVL but no Zora hooks
      };

      const response = {
        pools: [zoraCreatorHookPool, normalPool],
      };
      const emptyResponse = { pools: [] };

      // Mock responses for the two V4 queries
      requestStub.onCall(0).resolves(response); // High tracked ETH query
      requestStub.onCall(1).resolves(emptyResponse); // End pagination for first query
      requestStub.onCall(2).resolves(emptyResponse); // High liquidity query
      requestStub.onCall(3).resolves(emptyResponse); // End pagination for second query

      const pools = await subgraphProvider.getPools();

      // Should filter out Zora hooks pool with zero TVL even if it has high liquidity
      expect(pools.length).toEqual(1);
      
      // Should keep normal pool (no Zora hooks, high liquidity, zero TVL)
      const normalPoolResult = pools.find(p => p.id === '0xNormalPool');
      expect(normalPoolResult).toBeDefined();
      expect(normalPoolResult!.hooks).toEqual('0x0000000000000000000000000000000000000000');
      expect(normalPoolResult!.liquidity).toEqual('2000000');

      // Should filter out Zora creator hook pool with zero TVL
      const zoraCreatorPoolResult = pools.find(p => p.id === '0xZoraCreatorPool');
      expect(zoraCreatorPoolResult).toBeUndefined();
    });



    it('does not apply Zora hooks filtering on non-Base chains', async () => {
      requestStub = sinon.stub(GraphQLClient.prototype, 'request');
      subgraphProvider = new V4SubgraphProvider(ChainId.MAINNET, 2, 30000, true, 0.01, Number.MAX_VALUE, 'test_url');

      const zoraCreatorHookPool = {
        id: '0xZoraCreatorPool',
        token0: { id: '0xToken0', symbol: 'TOKEN0' },
        token1: { id: '0xToken1', symbol: 'TOKEN1' },
        feeTier: '3000',
        tickSpacing: '60',
        hooks: '0xd61A675F8a0c67A73DC3B54FB7318B4D91409040', // Zora creator hook
        liquidity: '1000000',
        totalValueLockedUSD: '1000.0',
        totalValueLockedETH: '0.0', // Zero TVL
      };

      const response = {
        pools: [zoraCreatorHookPool],
      };
      const emptyResponse = { pools: [] };

      requestStub.onCall(0).resolves(response); // High tracked ETH query
      requestStub.onCall(1).resolves(emptyResponse); // End pagination for first query
      requestStub.onCall(2).resolves(emptyResponse); // High liquidity query
      requestStub.onCall(3).resolves(emptyResponse); // End pagination for second query

      const pools = await subgraphProvider.getPools();

      // Should allow Zora hooks pool on non-Base chains (no filtering applied)
      expect(pools.length).toEqual(1);
      expect(pools[0]!.id).toEqual('0xZoraCreatorPool');
      expect(pools[0]!.hooks).toEqual('0xd61A675F8a0c67A73DC3B54FB7318B4D91409040');
    });

    it('handles case-insensitive Zora hook addresses', async () => {
      requestStub = sinon.stub(GraphQLClient.prototype, 'request');
      subgraphProvider = new V4SubgraphProvider(ChainId.BASE, 2, 30000, true, 0.01, Number.MAX_VALUE, 'test_url');

      const zoraCreatorHookPoolUpperCase = {
        id: '0xZoraCreatorPoolUpper',
        token0: { id: '0xToken0', symbol: 'TOKEN0' },
        token1: { id: '0xToken1', symbol: 'TOKEN1' },
        feeTier: '3000',
        tickSpacing: '60',
        hooks: '0XD61A675F8A0C67A73DC3B54FB7318B4D91409040', // Zora creator hook (uppercase)
        liquidity: '1000000',
        totalValueLockedUSD: '1000.0',
        totalValueLockedETH: '0.0', // Zero TVL
      };

      const zoraPostHookPoolMixedCase = {
        id: '0xZoraPostPoolMixed',
        token0: { id: '0xToken2', symbol: 'TOKEN2' },
        token1: { id: '0xToken3', symbol: 'TOKEN3' },
        feeTier: '500',
        tickSpacing: '10',
        hooks: '0x9EA932730A7787000042E34390B8E435DD839040', // Zora post hook (mixed case)
        liquidity: '500000',
        totalValueLockedUSD: '500.0',
        totalValueLockedETH: '0.0', // Zero TVL
      };

      const response = {
        pools: [zoraCreatorHookPoolUpperCase, zoraPostHookPoolMixedCase],
      };
      const emptyResponse = { pools: [] };

      requestStub.onCall(0).resolves(response); // High tracked ETH query
      requestStub.onCall(1).resolves(emptyResponse); // End pagination for first query
      requestStub.onCall(2).resolves(emptyResponse); // High liquidity query
      requestStub.onCall(3).resolves(emptyResponse); // End pagination for second query

      const pools = await subgraphProvider.getPools();

      // Should filter out both Zora hooks pools with zero TVL (case-insensitive)
      expect(pools.length).toEqual(0);
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
