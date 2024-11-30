import dotenv from 'dotenv';
import { GraphQLClient } from 'graphql-request';
import sinon from 'sinon';
import {
  V2SubgraphProvider,
} from '../../../../src';
import { ChainId } from '@uniswap/sdk-core';

dotenv.config();

describe('SubgraphProvider V2', () => {

  // VIRTUAL / AIXBT v2 pool
  const virtualPairAddress = '0x7464850cc1cfb54a2223229b77b1bca2f888d946';
  // Random non-virtual pair address
  const nonVirtualPairAddress = '0x7464850cc1cfb54a2223229b77b1bca2f888d947';

  let requestStubMainnet: sinon.SinonStub;
  let requestStubBase: sinon.SinonStub;
  let subgraphProviderMainnet: V2SubgraphProvider;
  let subgraphProviderBase: V2SubgraphProvider;

  beforeEach(() => {});

  afterEach(() => {
    sinon.restore();
  });

  it('fetches subgraph pools if trackedReserveETH is above 0.025 threshold on Base', async () => {
    requestStubBase = sinon.stub(GraphQLClient.prototype, 'request');
    subgraphProviderBase = new V2SubgraphProvider(ChainId.BASE, 2, 30000, true, 1000, 0.01, Number.MAX_VALUE, 'test_url');

    const firstCallResponse = {
        pairs: [
          {
            id: nonVirtualPairAddress,
            token0: { id: '0xToken0', symbol: 'TOKEN0' },
            token1: { id: '0xToken1', symbol: 'TOKEN1' },
            totalSupply: '100000',
            trackedReserveETH: '1',
            reserveETH: '1',
            reserveUSD: '0.001',
          },
        ],
      };
    const subsequentCallsResponse = { pairs: [] };

    // Configure the stub: return mock data on the first call, empty array on subsequent calls
    requestStubBase.onCall(0).resolves(firstCallResponse);
    requestStubBase.onCall(1).resolves(subsequentCallsResponse);

    const pools = await subgraphProviderBase.getPools();
    expect(pools.length).toEqual(1);
    expect(pools[0]!.id).toEqual(nonVirtualPairAddress);
  });

  it('fetches 0 subgraph pools if trackedReserveETH is below 0.025 threshold on Base', async () => {
    requestStubBase = sinon.stub(GraphQLClient.prototype, 'request');
    subgraphProviderBase = new V2SubgraphProvider(ChainId.BASE, 2, 30000, true, 1000, 0.01, Number.MAX_VALUE, 'test_url');

    const firstCallResponse = {
      pairs: [
        {
          id: nonVirtualPairAddress,
          token0: { id: '0xToken0', symbol: 'TOKEN0' },
          token1: { id: '0xToken1', symbol: 'TOKEN1' },
          totalSupply: '100000',
          trackedReserveETH: '0.001',
          reserveETH: '0.001',
          reserveUSD: '0.001',
        },
      ],
    };
    const subsequentCallsResponse = { pairs: [] };

    // Configure the stub: return mock data on the first call, empty array on subsequent calls
    requestStubBase.onCall(0).resolves(firstCallResponse);
    requestStubBase.onCall(1).resolves(subsequentCallsResponse);

    const pools = await subgraphProviderBase.getPools();
    expect(pools.length).toEqual(0);
  });

  it('fetches 1 subgraph pools if trackedReserveETH is below 0.025 threshold but Virtual pair on Base', async () => {
    requestStubBase = sinon.stub(GraphQLClient.prototype, 'request');
    subgraphProviderBase = new V2SubgraphProvider(ChainId.BASE, 2, 30000, true, 1000, 0.01, Number.MAX_VALUE, 'test_url');

    const firstCallResponse = {
      pairs: [
        {
          id: virtualPairAddress,
          token0: { id: '0xToken0', symbol: 'TOKEN0' },
          token1: { id: '0xToken1', symbol: 'TOKEN1' },
          totalSupply: '100000',
          trackedReserveETH: '0.001',
          reserveETH: '0.001',
          reserveUSD: '0.001',
        },
      ],
    };
    const subsequentCallsResponse = { pairs: [] };

    // Configure the stub: return mock data on the first call, empty array on subsequent calls
    requestStubBase.onCall(0).resolves(firstCallResponse);
    requestStubBase.onCall(1).resolves(subsequentCallsResponse);

    const pools = await subgraphProviderBase.getPools();
    expect(pools.length).toEqual(1);
    expect(pools[0]!.id).toEqual(virtualPairAddress);
  });


  it('fetches subgraph pools if trackedReserveETH is above 0.025 threshold on Mainnet', async () => {
    requestStubMainnet = sinon.stub(GraphQLClient.prototype, 'request');
    subgraphProviderMainnet = new V2SubgraphProvider(ChainId.MAINNET, 2, 30000, true, 1000, 0.01, Number.MAX_VALUE, 'test_url');

    const firstCallResponse = {
      pairs: [
        {
          id: nonVirtualPairAddress,
          token0: { id: '0xToken0', symbol: 'TOKEN0' },
          token1: { id: '0xToken1', symbol: 'TOKEN1' },
          totalSupply: '100000',
          trackedReserveETH: '1',
          reserveETH: '1',
          reserveUSD: '0.001',
        },
      ],
    };
    const subsequentCallsResponse = { pairs: [] };

    // Configure the stub: return mock data on the first call, empty array on subsequent calls
    requestStubMainnet.onCall(0).resolves(firstCallResponse);
    requestStubMainnet.onCall(1).resolves(subsequentCallsResponse);

    const pools = await subgraphProviderMainnet.getPools();
    expect(pools.length).toEqual(1);
    expect(pools[0]!.id).toEqual(nonVirtualPairAddress);
  });

  it('fetches 0 subgraph pools if trackedReserveETH is below 0.025 threshold on Mainnet', async () => {
    requestStubMainnet = sinon.stub(GraphQLClient.prototype, 'request');
    subgraphProviderMainnet = new V2SubgraphProvider(ChainId.MAINNET, 2, 30000, true, 1000, 0.01, Number.MAX_VALUE, 'test_url');

    const firstCallResponse = {
      pairs: [
        {
          id: nonVirtualPairAddress,
          token0: { id: '0xToken0', symbol: 'TOKEN0' },
          token1: { id: '0xToken1', symbol: 'TOKEN1' },
          totalSupply: '100000',
          trackedReserveETH: '0.001',
          reserveETH: '0.001',
          reserveUSD: '0.001',
        },
      ],
    };
    const subsequentCallsResponse = { pairs: [] };

    // Configure the stub: return mock data on the first call, empty array on subsequent calls
    requestStubMainnet.onCall(0).resolves(firstCallResponse);
    requestStubMainnet.onCall(1).resolves(subsequentCallsResponse);

    const pools = await subgraphProviderMainnet.getPools();
    expect(pools.length).toEqual(0);
  });

  it('fetches 0 subgraph pools if trackedReserveETH is below 0.025 threshold but Virtual pair on Mainnet', async () => {
    requestStubMainnet = sinon.stub(GraphQLClient.prototype, 'request');
    subgraphProviderMainnet = new V2SubgraphProvider(ChainId.MAINNET, 2, 30000, true, 1000, 0.01, Number.MAX_VALUE, 'test_url');

    const firstCallResponse = {
      pairs: [
        {
          id: virtualPairAddress,
          token0: { id: '0xToken0', symbol: 'TOKEN0' },
          token1: { id: '0xToken1', symbol: 'TOKEN1' },
          totalSupply: '100000',
          trackedReserveETH: '0.001',
          reserveETH: '0.001',
          reserveUSD: '0.001',
        },
      ],
    };
    const subsequentCallsResponse = { pairs: [] };

    // Configure the stub: return mock data on the first call, empty array on subsequent calls
    requestStubMainnet.onCall(0).resolves(firstCallResponse);
    requestStubMainnet.onCall(1).resolves(subsequentCallsResponse);

    const pools = await subgraphProviderMainnet.getPools();
    expect(pools.length).toEqual(0);
  });

  it('isVirtualPairBaseV2Pool tests', async () => {
    // virtual / non-virtual pair address on mainnet fails
    const mainnetSubgraphProviderV2 = new V2SubgraphProvider(ChainId.MAINNET, 2, 30000, true, 1000, 0.01, Number.MAX_VALUE, 'test_url');
    expect(mainnetSubgraphProviderV2.isVirtualPairBaseV2Pool(virtualPairAddress)).toBe(false);
    expect(mainnetSubgraphProviderV2.isVirtualPairBaseV2Pool(nonVirtualPairAddress)).toBe(false);

    // virtual pair address on base succeeds / non-virtual fails
    const baseSubgraphProviderV2 = new V2SubgraphProvider(ChainId.BASE, 2, 30000, true, 1000, 0.01, Number.MAX_VALUE, 'test_url');
    expect(baseSubgraphProviderV2.isVirtualPairBaseV2Pool(virtualPairAddress)).toBe(true);
    expect(baseSubgraphProviderV2.isVirtualPairBaseV2Pool(nonVirtualPairAddress)).toBe(false);
  });
})
