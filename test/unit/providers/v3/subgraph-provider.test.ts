import { ChainId } from '@uniswap/sdk-core';
import dotenv from 'dotenv';
import { GraphQLClient } from 'graphql-request';
import sinon from 'sinon';
import { V3SubgraphProvider } from '../../../../src';

dotenv.config();

describe('SubgraphProvider V3', () => {
  function constructPool(id: string, liquidity: string, totalValueLockedETH: string) {
    return {
      id: id,
      token0: {
        id: '0xToken0',
        symbol: 'TOKEN0'
      },
      token1: { id: '0xToken1', symbol: 'TOKEN1' },
      feeTier: '3000',
      liquidity: liquidity,
      totalValueLockedUSD: '1000.0',
      totalValueLockedETH: totalValueLockedETH,
    };
  }

  let requestStub: sinon.SinonStub;
  let subgraphProvider: V3SubgraphProvider;

  beforeEach(() => {});

  afterEach(() => {
    sinon.restore();
  });

  it('fetches subgraph pools if totalValueLockedETH is above threshold', async () => {
    requestStub = sinon.stub(GraphQLClient.prototype, 'request');
    subgraphProvider = new V3SubgraphProvider(ChainId.MAINNET, 2, 30000, true, 0.01, Number.MAX_VALUE, 'test_url');

    const highTrackedETHResponse = {
      pools: [constructPool('0xAddress1', '1000000', '1.0')], // High tracked ETH
    };
    const emptyResponse = { pools: [] };

    // For V3, we expect 2 queries: High tracked ETH, V3 zero ETH pools
    requestStub.resolves(emptyResponse); // Default response for most queries
    requestStub.onCall(0).resolves(highTrackedETHResponse); // High tracked ETH query
    requestStub.onCall(1).resolves(emptyResponse); // V3 zero ETH pools query

    const pools = await subgraphProvider.getPools();
    expect(pools.length).toEqual(1);
    expect(pools[0]!.tvlETH).toEqual(1.0);
  });

  it('fetches 0 subgraph pools if totalValueLockedETH is below threshold and liquidity is 0', async () => {
    requestStub = sinon.stub(GraphQLClient.prototype, 'request');
    subgraphProvider = new V3SubgraphProvider(ChainId.MAINNET, 2, 30000, true, 0.01, Number.MAX_VALUE, 'test_url');

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

  it('fetches subgraph pools with liquidity > 0 AND totalValueLockedETH = 0 (V3 specific)', async () => {
    requestStub = sinon.stub(GraphQLClient.prototype, 'request');
    subgraphProvider = new V3SubgraphProvider(ChainId.MAINNET, 2, 30000, true, 0.01, Number.MAX_VALUE, 'test_url');

    const v3ZeroETHResponse = {
      pools: [constructPool('0xAddress3', '1000000', '0')], // High liquidity, zero tracked ETH (V3 specific)
    };
    const emptyResponse = { pools: [] };

    requestStub.resolves(emptyResponse);
    requestStub.onCall(1).resolves(v3ZeroETHResponse); // V3 zero ETH pools query

    const pools = await subgraphProvider.getPools();
    expect(pools.length).toEqual(1);
    expect(pools[0]!.liquidity).toEqual('1000000');
    expect(pools[0]!.tvlETH).toEqual(0);
  });

  it('fetches 0 subgraph pools if liquidity is 0', async () => {
    requestStub = sinon.stub(GraphQLClient.prototype, 'request');
    subgraphProvider = new V3SubgraphProvider(ChainId.MAINNET, 2, 30000, true, 0.01, Number.MAX_VALUE, 'test_url');

    const zeroLiquidityResponse = {
      pools: [constructPool('0xAddress4', '0', '0.001')], // Zero liquidity
    };
    const emptyResponse = { pools: [] };

    requestStub.resolves(emptyResponse);
    requestStub.onCall(1).resolves(zeroLiquidityResponse); // V3 zero ETH pools query

    const pools = await subgraphProvider.getPools();
    expect(pools.length).toEqual(0);
  });

  it('fetches 0 subgraph pools if liquidity > 0 but totalValueLockedETH > 0 (not V3 zero ETH condition)', async () => {
    requestStub = sinon.stub(GraphQLClient.prototype, 'request');
    subgraphProvider = new V3SubgraphProvider(ChainId.MAINNET, 2, 30000, true, 0.01, Number.MAX_VALUE, 'test_url');

    const highLiquidityNonZeroETHResponse = {
      pools: [constructPool('0xAddress5', '1000000', '0.001')], // High liquidity, non-zero tracked ETH
    };
    const emptyResponse = { pools: [] };

    requestStub.resolves(emptyResponse);
    requestStub.onCall(1).resolves(highLiquidityNonZeroETHResponse); // V3 zero ETH pools query

    const pools = await subgraphProvider.getPools();
    expect(pools.length).toEqual(0);
  });

  it('deduplicates pools that match multiple criteria', async () => {
    requestStub = sinon.stub(GraphQLClient.prototype, 'request');
    subgraphProvider = new V3SubgraphProvider(ChainId.MAINNET, 2, 30000, true, 0.01, Number.MAX_VALUE, 'test_url');

    const samePool = constructPool('0xAddress6', '1000000', '1.0'); // Pool with high liquidity and high tracked ETH
    const highTrackedETHResponse = { pools: [samePool] };
    const v3ZeroETHResponse = { pools: [samePool] }; // Same pool returned by different query
    const emptyResponse = { pools: [] };

    requestStub.resolves(emptyResponse);
    requestStub.onCall(0).resolves(highTrackedETHResponse); // High tracked ETH query
    requestStub.onCall(1).resolves(v3ZeroETHResponse); // V3 zero ETH pools query

    const pools = await subgraphProvider.getPools();
    expect(pools.length).toEqual(1); // Should be deduplicated
    expect(pools[0]!.tvlETH).toEqual(1.0);
    expect(pools[0]!.liquidity).toEqual('1000000');
  });

  it('correctly maps V3-specific fields', async () => {
    requestStub = sinon.stub(GraphQLClient.prototype, 'request');
    subgraphProvider = new V3SubgraphProvider(ChainId.MAINNET, 2, 30000, true, 0.01, Number.MAX_VALUE, 'test_url');

    const v3PoolResponse = {
      pools: [{
        id: '0xAddress7',
        token0: { id: '0xToken0', symbol: 'TOKEN0' },
        token1: { id: '0xToken1', symbol: 'TOKEN1' },
        feeTier: '500',
        liquidity: '500000',
        totalValueLockedUSD: '2000.0',
        totalValueLockedETH: '2.0',
      }],
    };
    const emptyResponse = { pools: [] };

    requestStub.resolves(emptyResponse);
    requestStub.onCall(0).resolves(v3PoolResponse); // High tracked ETH query

    const pools = await subgraphProvider.getPools();
    expect(pools.length).toEqual(1);
    expect(pools[0]!.id).toEqual('0xAddress7');
    expect(pools[0]!.feeTier).toEqual('500');
    expect(pools[0]!.liquidity).toEqual('500000');
    expect(pools[0]!.tvlUSD).toEqual(2000.0);
    expect(pools[0]!.tvlETH).toEqual(2.0);
  });

  it('handles empty responses from all queries', async () => {
    requestStub = sinon.stub(GraphQLClient.prototype, 'request');
    subgraphProvider = new V3SubgraphProvider(ChainId.MAINNET, 2, 30000, true, 0.01, Number.MAX_VALUE, 'test_url');

    const emptyResponse = { pools: [] };

    // All queries return empty
    requestStub.resolves(emptyResponse);

    const pools = await subgraphProvider.getPools();
    expect(pools.length).toEqual(0);
  });

  it('handles multiple pools from different queries', async () => {
    requestStub = sinon.stub(GraphQLClient.prototype, 'request');
    subgraphProvider = new V3SubgraphProvider(ChainId.MAINNET, 2, 30000, true, 0.01, Number.MAX_VALUE, 'test_url');

    const highTrackedETHResponse = {
      pools: [constructPool('0xAddress8', '1000000', '1.0')],
    };
    const v3ZeroETHResponse = {
      pools: [constructPool('0xAddress9', '2000000', '0')], // V3 zero ETH pool
    };
    const emptyResponse = { pools: [] };

    // Mock responses for the two V3 queries
    let callCount = 0;
    requestStub.callsFake(() => {
      callCount++;
      // High tracked ETH query returns one pool
      if (callCount === 1) return Promise.resolve(highTrackedETHResponse);
      if (callCount === 2) return Promise.resolve(emptyResponse); // End pagination for first query
      // V3 zero ETH pools query returns another pool
      if (callCount === 3) return Promise.resolve(v3ZeroETHResponse);
      if (callCount === 4) return Promise.resolve(emptyResponse); // End pagination for second query
      // Default for any other calls
      return Promise.resolve(emptyResponse);
    });

    const pools = await subgraphProvider.getPools();
    expect(pools.length).toEqual(2);
    expect(pools[0]!.tvlETH).toEqual(1.0);
    expect(pools[1]!.tvlETH).toEqual(0);
    expect(pools[1]!.liquidity).toEqual('2000000');
  });

  it('correctly filters V3 pools based on V3-specific logic', async () => {
    requestStub = sinon.stub(GraphQLClient.prototype, 'request');
    subgraphProvider = new V3SubgraphProvider(ChainId.MAINNET, 2, 30000, true, 0.01, Number.MAX_VALUE, 'test_url');

    // Test the V3-specific filtering logic:
    // - Include pools with liquidity > 0 AND totalValueLockedETH = 0
    // - Include pools with totalValueLockedETH > threshold
    const highTrackedETHResponse = {
      pools: [constructPool('0xAddress10', '1000000', '1.0')], // High tracked ETH
    };
    const v3ZeroETHResponse = {
      pools: [constructPool('0xAddress11', '500000', '0')], // V3 zero ETH pool
    };
    const emptyResponse = { pools: [] };

    requestStub.resolves(emptyResponse);
    requestStub.onCall(0).resolves(highTrackedETHResponse); // High tracked ETH query
    requestStub.onCall(1).resolves(v3ZeroETHResponse); // V3 zero ETH pools query

    const pools = await subgraphProvider.getPools();
    expect(pools.length).toEqual(2);

    // First pool should have high tracked ETH
    expect(pools[0]!.tvlETH).toEqual(1.0);
    expect(pools[0]!.liquidity).toEqual('1000000');

    // Second pool should be V3 zero ETH pool
    expect(pools[1]!.tvlETH).toEqual(0);
    expect(pools[1]!.liquidity).toEqual('500000');
  });
});
