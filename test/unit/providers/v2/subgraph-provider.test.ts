import { ChainId } from '@uniswap/sdk-core';
import dotenv from 'dotenv';
import { GraphQLClient } from 'graphql-request';
import sinon from 'sinon';
import { V2SubgraphProvider } from '../../../../src';

dotenv.config();

describe('SubgraphProvider V2', () => {

  const virtualTokenAddress = '0x0b3e328455c4059eeb9e3f84b5543f74e24e7e1b';
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
          constructPool(false, '1'),
        ],
      };
    const subsequentCallsResponse = { pairs: [] };

    // Configure the stub: return mock data on the first call, empty array on subsequent calls
    requestStubBase.onCall(0).resolves(firstCallResponse);
    requestStubBase.onCall(1).resolves(subsequentCallsResponse);

    const pools = await subgraphProviderBase.getPools();
    expect(pools.length).toEqual(1);
    expect(pools[0]!.token0.id).not.toEqual(virtualTokenAddress);
  });

  it('fetches 0 subgraph pools if trackedReserveETH is below 0.025 threshold on Base', async () => {
    requestStubBase = sinon.stub(GraphQLClient.prototype, 'request');
    subgraphProviderBase = new V2SubgraphProvider(ChainId.BASE, 2, 30000, true, 1000, 0.01, Number.MAX_VALUE, 'test_url');

    const firstCallResponse = {
      pairs: [
        constructPool(false, '0.001'),
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
        constructPool(true, '0.001'),
      ],
    };
    const subsequentCallsResponse = { pairs: [] };

    // Configure the stub: return mock data on the first call, empty array on subsequent calls
    requestStubBase.onCall(0).resolves(firstCallResponse);
    requestStubBase.onCall(1).resolves(subsequentCallsResponse);

    const pools = await subgraphProviderBase.getPools();
    expect(pools.length).toEqual(1);
    expect(pools[0]!.token0.id).toEqual(virtualTokenAddress);
  });


  it('fetches subgraph pools if trackedReserveETH is above 0.025 threshold on Mainnet', async () => {
    requestStubMainnet = sinon.stub(GraphQLClient.prototype, 'request');
    subgraphProviderMainnet = new V2SubgraphProvider(ChainId.MAINNET, 2, 30000, true, 1000, 0.01, Number.MAX_VALUE, 'test_url');

    const firstCallResponse = {
      pairs: [
        constructPool(false, '1'),
      ],
    };
    const subsequentCallsResponse = { pairs: [] };

    // Configure the stub: return mock data on the first call, empty array on subsequent calls
    requestStubMainnet.onCall(0).resolves(firstCallResponse);
    requestStubMainnet.onCall(1).resolves(subsequentCallsResponse);

    const pools = await subgraphProviderMainnet.getPools();
    expect(pools.length).toEqual(1);
    expect(pools[0]!.token0.id).not.toEqual(virtualTokenAddress);
  });

  it('fetches 0 subgraph pools if trackedReserveETH is below 0.025 threshold on Mainnet', async () => {
    requestStubMainnet = sinon.stub(GraphQLClient.prototype, 'request');
    subgraphProviderMainnet = new V2SubgraphProvider(ChainId.MAINNET, 2, 30000, true, 1000, 0.01, Number.MAX_VALUE, 'test_url');

    const firstCallResponse = {
      pairs: [
        constructPool(false, '0.001'),
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
        constructPool(true, '0.001'),
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
    expect(mainnetSubgraphProviderV2.isVirtualPairBaseV2Pool(constructPool(true, '1'))).toBe(false);
    expect(mainnetSubgraphProviderV2.isVirtualPairBaseV2Pool(constructPool(false, '1'))).toBe(false);

    // virtual pair address on base succeeds / non-virtual fails
    const baseSubgraphProviderV2 = new V2SubgraphProvider(ChainId.BASE, 2, 30000, true, 1000, 0.01, Number.MAX_VALUE, 'test_url');
    expect(baseSubgraphProviderV2.isVirtualPairBaseV2Pool(constructPool(true, '1'))).toBe(true);
    expect(baseSubgraphProviderV2.isVirtualPairBaseV2Pool(constructPool(false, '1'))).toBe(false);
  });
})
