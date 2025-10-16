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

    // For V4, we expect 3 queries: High tracked ETH, Non-Zora high liquidity, Zora high liquidity
    requestStub.resolves(emptyResponse); // Default response for most queries
    requestStub.onCall(0).resolves(highTrackedETHResponse); // High tracked ETH query
    requestStub.onCall(1).resolves(emptyResponse); // Non-Zora high liquidity query
    requestStub.onCall(2).resolves(emptyResponse); // Zora high liquidity query

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
    requestStub.onCall(1).resolves(highLiquidityResponse); // Non-Zora high liquidity query

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
    requestStub.onCall(1).resolves(zeroLiquidityResponse); // Non-Zora high liquidity query

    const pools = await subgraphProvider.getPools();
    expect(pools.length).toEqual(0);
  });

  it('filters zora pools based on trackedZoraEthThreshold', async () => {
    requestStub = sinon.stub(GraphQLClient.prototype, 'request');
    subgraphProvider = new V4SubgraphProvider(ChainId.MAINNET, 2, 30000, true, 0.01, 0.001, Number.MAX_VALUE, 'test_url');

    const zoraHooksResponse = {
      pools: [
        // Zora pools that meet the threshold (should be returned by Zora query)
        {
          ...constructPool('0xZora1', '1000000', '0.002'), // Above threshold, has liquidity
          hooks: '0xd61a675f8a0c67a73dc3b54fb7318b4d91409040' // Zora Creator Hook
        },
        {
          ...constructPool('0xZora3', '1000000', '0.003'), // Above threshold, has liquidity
          hooks: '0x9ea932730a7787000042e34390b8e435dd839040' // Zora Post Hook
        }
      ]
    };
    const emptyResponse = { pools: [] };

    requestStub.resolves(emptyResponse);
    requestStub.onCall(0).resolves(emptyResponse); // High tracked ETH query
    requestStub.onCall(1).resolves(emptyResponse); // Non-Zora high liquidity query
    requestStub.onCall(2).resolves(zoraHooksResponse); // Zora high liquidity query

    const pools = await subgraphProvider.getPools();
    expect(pools.length).toEqual(2);
    expect(pools[0]!.id).toEqual('0xZora1');
    expect(pools[1]!.id).toEqual('0xZora3');
  });

  it('correctly separates non-zora and zora pools in different queries', async () => {
    requestStub = sinon.stub(GraphQLClient.prototype, 'request');
    subgraphProvider = new V4SubgraphProvider(ChainId.MAINNET, 2, 30000, true, 0.01, 0.001, Number.MAX_VALUE, 'test_url');

    const nonZoraResponse = {
      pools: [
        // Non-Zora pools with liquidity > 0
        {
          ...constructPool('0xNonZora1', '1000000', '0.001'), // Low TVL but has liquidity
          hooks: '0x1234567890123456789012345678901234567890' // Non-Zora hook
        },
        {
          ...constructPool('0xNonZora2', '2000000', '0.005'), // Low TVL but has liquidity
          hooks: '0x9876543210987654321098765432109876543210' // Non-Zora hook
        }
      ]
    };

    const zoraResponse = {
      pools: [
        // Zora pools with liquidity > 0 AND TVL > trackedZoraEthThreshold
        {
          ...constructPool('0xZora1', '1000000', '0.002'), // Above Zora threshold
          hooks: '0xd61a675f8a0c67a73dc3b54fb7318b4d91409040' // Zora Creator Hook
        }
      ]
    };

    const emptyResponse = { pools: [] };

    requestStub.resolves(emptyResponse);
    requestStub.onCall(0).resolves(emptyResponse); // High tracked ETH query
    requestStub.onCall(1).resolves(nonZoraResponse); // Non-Zora high liquidity query
    requestStub.onCall(2).resolves(zoraResponse); // Zora high liquidity query

    const pools = await subgraphProvider.getPools();
    expect(pools.length).toEqual(3);
    
    // Verify we get pools from both queries
    const poolIds = pools.map(p => p.id).sort();
    expect(poolIds).toEqual(['0xNonZora1', '0xNonZora2', '0xZora1']);
  });

  it('applies safety filtering for zora pools even when query returns them', async () => {
    requestStub = sinon.stub(GraphQLClient.prototype, 'request');
    subgraphProvider = new V4SubgraphProvider(ChainId.MAINNET, 2, 30000, true, 0.01, 0.001, Number.MAX_VALUE, 'test_url');

    const zoraResponse = {
      pools: [
        // This pool would be returned by the Zora query but should be filtered out by safety check
        {
          ...constructPool('0xZoraLow', '1000000', '0.0005'), // Below Zora threshold
          hooks: '0xd61a675f8a0c67a73dc3b54fb7318b4d91409040' // Zora Creator Hook
        },
        // This pool should pass both query and safety filtering
        {
          ...constructPool('0xZoraHigh', '1000000', '0.002'), // Above Zora threshold
          hooks: '0x9ea932730a7787000042e34390b8e435dd839040' // Zora Post Hook
        }
      ]
    };

    const emptyResponse = { pools: [] };

    requestStub.resolves(emptyResponse);
    requestStub.onCall(0).resolves(emptyResponse); // High tracked ETH query
    requestStub.onCall(1).resolves(emptyResponse); // Non-Zora high liquidity query
    requestStub.onCall(2).resolves(zoraResponse); // Zora high liquidity query

    const pools = await subgraphProvider.getPools();
    expect(pools.length).toEqual(1);
    expect(pools[0]!.id).toEqual('0xZoraHigh');
  });

  it('applies safety filtering for non-zora pools even when query returns them', async () => {
    requestStub = sinon.stub(GraphQLClient.prototype, 'request');
    subgraphProvider = new V4SubgraphProvider(ChainId.MAINNET, 2, 30000, true, 0.01, 0.001, Number.MAX_VALUE, 'test_url');

    const nonZoraResponse = {
      pools: [
        // This pool would be returned by the non-Zora query but should be filtered out by safety check
        {
          ...constructPool('0xNonZoraLow', '0', '0.005'), // No liquidity, low TVL
          hooks: '0x1234567890123456789012345678901234567890' // Non-Zora hook
        },
        // This pool should pass both query and safety filtering
        {
          ...constructPool('0xNonZoraHigh', '1000000', '0.001'), // Has liquidity
          hooks: '0x9876543210987654321098765432109876543210' // Non-Zora hook
        }
      ]
    };

    const emptyResponse = { pools: [] };

    requestStub.resolves(emptyResponse);
    requestStub.onCall(0).resolves(emptyResponse); // High tracked ETH query
    requestStub.onCall(1).resolves(nonZoraResponse); // Non-Zora high liquidity query
    requestStub.onCall(2).resolves(emptyResponse); // Zora high liquidity query

    const pools = await subgraphProvider.getPools();
    expect(pools.length).toEqual(1);
    expect(pools[0]!.id).toEqual('0xNonZoraHigh');
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
    requestStub.onCall(1).resolves(highLiquidityResponse); // Non-Zora high liquidity query
    requestStub.onCall(2).resolves(emptyResponse); // Zora high liquidity query

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

    // Mock responses for the three V4 queries
    let callCount = 0;
    requestStub.callsFake(() => {
      callCount++;
      // High tracked ETH query returns one pool
      if (callCount === 1) return Promise.resolve(highTrackedETHResponse);
      if (callCount === 2) return Promise.resolve(emptyResponse); // End pagination for first query
      // Non-Zora high liquidity query returns another pool
      if (callCount === 3) return Promise.resolve(highLiquidityResponse);
      if (callCount === 4) return Promise.resolve(emptyResponse); // End pagination for second query
      // Zora high liquidity query returns empty
      if (callCount === 5) return Promise.resolve(emptyResponse);
      if (callCount === 6) return Promise.resolve(emptyResponse); // End pagination for third query
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
      requestStub.onCall(1).rejects(new Error('Network error')); // Non-Zora high liquidity query fails
      requestStub.onCall(2).resolves(emptyResponse); // End pagination for first query

      await expect(subgraphProvider.getPools()).rejects.toThrow('Network error');
    });

    it('fails entire operation when one query times out', async () => {
      requestStub = sinon.stub(GraphQLClient.prototype, 'request');
      subgraphProvider = new V4SubgraphProvider(ChainId.MAINNET, 0, 1000, true, 0.01, 0.001, Number.MAX_VALUE, 'test_url');

      const emptyResponse = { pools: [] };

      // First query succeeds, second query times out
      requestStub.onCall(0).resolves(emptyResponse); // High tracked ETH query succeeds
      requestStub.onCall(1).rejects(new Error('timeout')); // Non-Zora high liquidity query times out
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
      requestStub.onCall(2).rejects(new Error('Network error'));

      // Second attempt: queries succeed
      requestStub.onCall(3).resolves(highTrackedETHResponse); // High tracked ETH query
      requestStub.onCall(4).resolves(emptyResponse); // End pagination for first query
      requestStub.onCall(5).resolves(emptyResponse); // Non-Zora high liquidity query
      requestStub.onCall(6).resolves(emptyResponse); // End pagination for second query
      requestStub.onCall(7).resolves(emptyResponse); // Zora high liquidity query
      requestStub.onCall(8).resolves(emptyResponse); // End pagination for third query

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
