import { ChainId } from '@uniswap/sdk-core';
import dotenv from 'dotenv';
import { GraphQLClient } from 'graphql-request';
import sinon from 'sinon';
import { V2SubgraphProvider } from '../../../../src';

dotenv.config();

describe('SubgraphProvider V2', () => {

  const virtualTokenAddress = '0x0b3e328455c4059eeb9e3f84b5543f74e24e7e1b';
  const FEI = '0x956f47f50a910163d8bf957cf5846d573e7f87ca';
  
  function constructPool(withVirtualToken: boolean, trackedReservedEth: string) {
    return {
      id: '0xAddress1',
      token0: {
        id: withVirtualToken ? virtualTokenAddress : '0xToken0',
        symbol: withVirtualToken ? 'VIRTUAL' : 'TOKEN0'
      },
      token1: { id: '0xToken1', symbol: 'TOKEN1' },
      totalSupply: '100000',
      trackedReserveETH: trackedReservedEth,
      reserveETH: trackedReservedEth,
      reserveUSD: '0.001',
    };
  }

  function constructFEIPool(isToken0: boolean, trackedReservedEth: string) {
    return {
      id: '0xAddress2',
      token0: {
        id: isToken0 ? FEI : '0xToken0',
        symbol: isToken0 ? 'FEI' : 'TOKEN0'
      },
      token1: { 
        id: isToken0 ? '0xToken1' : FEI, 
        symbol: isToken0 ? 'TOKEN1' : 'FEI' 
      },
      totalSupply: '100000',
      trackedReserveETH: trackedReservedEth,
      reserveETH: trackedReservedEth,
      reserveUSD: '0.001',
    };
  }

  let requestStubMainnet: sinon.SinonStub;
  let requestStubBase: sinon.SinonStub;
  let subgraphProviderMainnet: V2SubgraphProvider;
  let subgraphProviderBase: V2SubgraphProvider;

  beforeEach(() => {});

  afterEach(() => {
    sinon.restore();
  });

  it('fetches subgraph pools if trackedReserveETH is above threshold on Base', async () => {
    requestStubBase = sinon.stub(GraphQLClient.prototype, 'request');
    subgraphProviderBase = new V2SubgraphProvider(ChainId.BASE, 2, 30000, true, 1000, 0.01, Number.MAX_VALUE, 'test_url');

    const highTrackedReserveResponse = {
      pairs: [constructPool(false, '1')],
    };
    const emptyResponse = { pairs: [] };

    // Stub all the different query types that will be made
    // For BASE chain, we expect 6 queries: FEI (token0), FEI (token1), Virtual (token0), Virtual (token1), High tracked reserve, High USD
    requestStubBase.resolves(emptyResponse); // Default response for most queries
    requestStubBase.onCall(4).resolves(highTrackedReserveResponse); // High tracked reserve query
    requestStubBase.onCall(5).resolves(emptyResponse); // High USD query

    const pools = await subgraphProviderBase.getPools();
    expect(pools.length).toEqual(1);
    expect(pools[0]!.token0.id).not.toEqual(virtualTokenAddress);
  });

  it('fetches 0 subgraph pools if trackedReserveETH is below threshold on Base', async () => {
    requestStubBase = sinon.stub(GraphQLClient.prototype, 'request');
    subgraphProviderBase = new V2SubgraphProvider(ChainId.BASE, 2, 30000, true, 1000, 0.01, Number.MAX_VALUE, 'test_url');

    const lowTrackedReserveResponse = {
      pairs: [constructPool(false, '0.001')],
    };
    const emptyResponse = { pairs: [] };

    // All queries return empty except one that returns a pool with low tracked reserve
    requestStubBase.resolves(emptyResponse);
    requestStubBase.onCall(4).resolves(lowTrackedReserveResponse); // High tracked reserve query

    const pools = await subgraphProviderBase.getPools();
    expect(pools.length).toEqual(0);
  });

  it('fetches 1 subgraph pools if trackedReserveETH is below threshold but Virtual pair on Base', async () => {
    requestStubBase = sinon.stub(GraphQLClient.prototype, 'request');
    subgraphProviderBase = new V2SubgraphProvider(ChainId.BASE, 2, 30000, true, 1000, 0.01, Number.MAX_VALUE, 'test_url');

    const virtualPoolResponse = {
      pairs: [constructPool(true, '0.001')],
    };
    const emptyResponse = { pairs: [] };

    // Virtual token query returns the pool
    requestStubBase.resolves(emptyResponse);
    requestStubBase.onCall(2).resolves(virtualPoolResponse); // Virtual (token0) query

    const pools = await subgraphProviderBase.getPools();
    expect(pools.length).toEqual(1);
    expect(pools[0]!.token0.id).toEqual(virtualTokenAddress);
  });

  it('fetches subgraph pools if trackedReserveETH is above threshold on Mainnet', async () => {
    requestStubMainnet = sinon.stub(GraphQLClient.prototype, 'request');
    subgraphProviderMainnet = new V2SubgraphProvider(ChainId.MAINNET, 2, 30000, true, 1000, 0.01, Number.MAX_VALUE, 'test_url');

    const highTrackedReserveResponse = {
      pairs: [constructPool(false, '1')],
    };
    const emptyResponse = { pairs: [] };

    // For MAINNET chain, we expect 4 queries: FEI (token0), FEI (token1), High tracked reserve, High USD
    requestStubMainnet.resolves(emptyResponse);
    requestStubMainnet.onCall(2).resolves(highTrackedReserveResponse); // High tracked reserve query
    requestStubMainnet.onCall(3).resolves(emptyResponse); // High USD query

    const pools = await subgraphProviderMainnet.getPools();
    expect(pools.length).toEqual(1);
    expect(pools[0]!.token0.id).not.toEqual(virtualTokenAddress);
  });

  it('fetches 0 subgraph pools if trackedReserveETH is below threshold on Mainnet', async () => {
    requestStubMainnet = sinon.stub(GraphQLClient.prototype, 'request');
    subgraphProviderMainnet = new V2SubgraphProvider(ChainId.MAINNET, 2, 30000, true, 1000, 0.01, Number.MAX_VALUE, 'test_url');

    const lowTrackedReserveResponse = {
      pairs: [constructPool(false, '0.001')],
    };
    const emptyResponse = { pairs: [] };

    requestStubMainnet.resolves(emptyResponse);
    requestStubMainnet.onCall(2).resolves(lowTrackedReserveResponse); // High tracked reserve query

    const pools = await subgraphProviderMainnet.getPools();
    expect(pools.length).toEqual(0);
  });

  it('fetches 0 subgraph pools if trackedReserveETH is below threshold but Virtual pair on Mainnet', async () => {
    requestStubMainnet = sinon.stub(GraphQLClient.prototype, 'request');
    subgraphProviderMainnet = new V2SubgraphProvider(ChainId.MAINNET, 2, 30000, true, 1000, 0.01, Number.MAX_VALUE, 'test_url');

    const emptyResponse = { pairs: [] };

    // Virtual token queries don't exist on Mainnet, so this should return 0
    requestStubMainnet.resolves(emptyResponse);

    const pools = await subgraphProviderMainnet.getPools();
    expect(pools.length).toEqual(0);
  });

  it('fetches FEI token pools correctly', async () => {
    requestStubMainnet = sinon.stub(GraphQLClient.prototype, 'request');
    subgraphProviderMainnet = new V2SubgraphProvider(ChainId.MAINNET, 2, 30000, true, 1000, 0.01, Number.MAX_VALUE, 'test_url');

    const feiPoolResponse = {
      pairs: [constructFEIPool(true, '0.001')], // FEI as token0
    };
    const emptyResponse = { pairs: [] };

    requestStubMainnet.resolves(emptyResponse);
    requestStubMainnet.onCall(0).resolves(feiPoolResponse); // FEI (token0) query

    const pools = await subgraphProviderMainnet.getPools();
    expect(pools.length).toEqual(1);
    expect(pools[0]!.token0.id).toEqual(FEI.toLowerCase());
  });

  it('fetches high USD reserve pools correctly', async () => {
    requestStubMainnet = sinon.stub(GraphQLClient.prototype, 'request');
    subgraphProviderMainnet = new V2SubgraphProvider(ChainId.MAINNET, 2, 30000, true, 1000, 0.01, 0.0001, 'test_url'); // Low USD threshold

    const highUSDPoolResponse = {
      pairs: [{
        id: '0xAddress3',
        token0: { id: '0xToken0', symbol: 'TOKEN0' },
        token1: { id: '0xToken1', symbol: 'TOKEN1' },
        totalSupply: '100000',
        trackedReserveETH: '0.001',
        reserveETH: '0.001',
        reserveUSD: '1.0', // High USD value
      }],
    };
    const emptyResponse = { pairs: [] };

    requestStubMainnet.resolves(emptyResponse);
    requestStubMainnet.onCall(3).resolves(highUSDPoolResponse); // High USD query

    const pools = await subgraphProviderMainnet.getPools();
    expect(pools.length).toEqual(1);
    expect(pools[0]!.reserveUSD).toEqual(1.0);
  });

  it('deduplicates pools that match multiple criteria', async () => {
    requestStubMainnet = sinon.stub(GraphQLClient.prototype, 'request');
    subgraphProviderMainnet = new V2SubgraphProvider(ChainId.MAINNET, 2, 30000, true, 1000, 0.01, Number.MAX_VALUE, 'test_url');

    const samePool = constructFEIPool(true, '1.0'); // FEI pool with high tracked reserve
    const feiPoolResponse = { pairs: [samePool] };
    const highTrackedReserveResponse = { pairs: [samePool] }; // Same pool returned by different query
    const emptyResponse = { pairs: [] };

    requestStubMainnet.resolves(emptyResponse);
    requestStubMainnet.onCall(0).resolves(feiPoolResponse); // FEI (token0) query
    requestStubMainnet.onCall(2).resolves(highTrackedReserveResponse); // High tracked reserve query

    const pools = await subgraphProviderMainnet.getPools();
    expect(pools.length).toEqual(1); // Should be deduplicated
    expect(pools[0]!.token0.id).toEqual(FEI.toLowerCase());
  });

  it('isVirtualPairBaseV2Pool tests', async () => {
    // virtual / non-virtual pair address on mainnet fails
    const mainnetSubgraphProviderV2 = new V2SubgraphProvider(ChainId.MAINNET, 2, 30000, true, 1000, 0.01, Number.MAX_VALUE, 'test_url');
    expect(mainnetSubgraphProviderV2.isVirtualPairBaseV2Pool(constructPool(true, '1'))).toBe(false);
    expect(mainnetSubgraphProviderV2.isVirtualPairBaseV2Pool(constructPool(false, '1'))).toBe(false);

    // virtual pair address on base succeeds / non-virtual fails
    const baseSubgraphProviderV2 = new V2SubgraphProvider(ChainId.BASE, 2, 30000, true, 1000, 0.01, Number.MAX_VALUE, 'test_url');
    expect(baseSubgraphProviderV2.isVirtualPairBaseV2Pool(constructPool(true, '1'))).toBe(true);
    expect(baseSubgraphProviderV2.isVirtualPairBaseV2Pool(constructPool(false, '1'))).toBe(false);
  });

  describe('parallel query error handling', () => {
    it('fails entire operation when one query throws an error', async () => {
      requestStubMainnet = sinon.stub(GraphQLClient.prototype, 'request');
      subgraphProviderMainnet = new V2SubgraphProvider(ChainId.MAINNET, 0, 1000, true, 1000, 0.01, Number.MAX_VALUE, 'test_url');

      const highTrackedReserveResponse = {
        pairs: [constructPool(false, '1')],
      };
      const emptyResponse = { pairs: [] };

      // First query succeeds, second query fails
      requestStubMainnet.onCall(0).resolves(highTrackedReserveResponse); // FEI (token0) query succeeds
      requestStubMainnet.onCall(1).rejects(new Error('Network error')); // FEI (token1) query fails
      requestStubMainnet.onCall(2).resolves(emptyResponse); // High tracked reserve query
      requestStubMainnet.onCall(3).resolves(emptyResponse); // High USD query

      await expect(subgraphProviderMainnet.getPools()).rejects.toThrow('Network error');
    });

    it('fails entire operation when one query times out', async () => {
      requestStubMainnet = sinon.stub(GraphQLClient.prototype, 'request');
      subgraphProviderMainnet = new V2SubgraphProvider(ChainId.MAINNET, 0, 1000, true, 1000, 0.01, Number.MAX_VALUE, 'test_url');

      const emptyResponse = { pairs: [] };

      // First query succeeds, second query times out
      requestStubMainnet.onCall(0).resolves(emptyResponse); // FEI (token0) query succeeds
      requestStubMainnet.onCall(1).rejects(new Error('timeout')); // FEI (token1) query times out
      requestStubMainnet.onCall(2).resolves(emptyResponse); // High tracked reserve query
      requestStubMainnet.onCall(3).resolves(emptyResponse); // High USD query

      await expect(subgraphProviderMainnet.getPools()).rejects.toThrow('timeout');
    });

    it('retries entire operation when parallel queries fail', async () => {
      requestStubMainnet = sinon.stub(GraphQLClient.prototype, 'request');
      subgraphProviderMainnet = new V2SubgraphProvider(ChainId.MAINNET, 1, 1000, true, 1000, 0.01, Number.MAX_VALUE, 'test_url');

      const highTrackedReserveResponse = {
        pairs: [constructPool(false, '1')],
      };
      const emptyResponse = { pairs: [] };

      // First attempt: all queries fail
      requestStubMainnet.onCall(0).rejects(new Error('Network error'));
      requestStubMainnet.onCall(1).rejects(new Error('Network error'));
      requestStubMainnet.onCall(2).rejects(new Error('Network error'));
      requestStubMainnet.onCall(3).rejects(new Error('Network error'));

      // Second attempt: queries succeed
      requestStubMainnet.onCall(4).resolves(emptyResponse); // FEI (token0) query
      requestStubMainnet.onCall(5).resolves(emptyResponse); // FEI (token1) query
      requestStubMainnet.onCall(6).resolves(highTrackedReserveResponse); // High tracked reserve query
      requestStubMainnet.onCall(7).resolves(emptyResponse); // High USD query
      requestStubMainnet.onCall(8).resolves(emptyResponse); // End pagination for first query
      requestStubMainnet.onCall(9).resolves(emptyResponse); // End pagination for second query
      requestStubMainnet.onCall(10).resolves(emptyResponse); // End pagination for third query
      requestStubMainnet.onCall(11).resolves(emptyResponse); // End pagination for fourth query

      const pools = await subgraphProviderMainnet.getPools();
      expect(pools.length).toEqual(1);
      expect(pools[0]!.reserve).toEqual(1);
    });

    it('fails after all retries when parallel queries consistently fail', async () => {
      requestStubMainnet = sinon.stub(GraphQLClient.prototype, 'request');
      subgraphProviderMainnet = new V2SubgraphProvider(ChainId.MAINNET, 0, 1000, true, 1000, 0.01, Number.MAX_VALUE, 'test_url'); // No retries

      // All attempts fail
      requestStubMainnet.rejects(new Error('Persistent network error'));

      await expect(subgraphProviderMainnet.getPools()).rejects.toThrow('Persistent network error');
    });
  });
})
