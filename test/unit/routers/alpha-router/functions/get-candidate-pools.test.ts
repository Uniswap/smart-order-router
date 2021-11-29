import { TradeType } from '@uniswap/sdk-core';
import { FeeAmount } from '@uniswap/v3-sdk';
import _ from 'lodash';
import sinon from 'sinon';
import {
  AlphaRouterConfig,
  CachingTokenListProvider,
  ChainId,
  DAI_MAINNET as DAI,
  TokenProvider,
  USDC_MAINNET as USDC,
  USDT_MAINNET as USDT,
  V3PoolProvider,
  V3SubgraphPool,
  V3SubgraphProvider,
  WETH9,
} from '../../../../../src';
import { getV3CandidatePools } from '../../../../../src/routers/alpha-router/functions/get-candidate-pools';
import {
  buildMockTokenAccessor,
  buildMockV3PoolAccessor,
  DAI_USDT_LOW,
  poolToV3SubgraphPool,
  USDC_DAI_LOW,
  USDC_DAI_MEDIUM,
  USDC_WETH_LOW,
  WETH9_USDT_LOW,
} from '../../../test-util/mock-data';

describe('get candidate pools', () => {
  let mockTokenProvider: sinon.SinonStubbedInstance<TokenProvider>;
  let mockV3PoolProvider: sinon.SinonStubbedInstance<V3PoolProvider>;
  let mockV3SubgraphProvider: sinon.SinonStubbedInstance<V3SubgraphProvider>;
  let mockBlockTokenListProvider: sinon.SinonStubbedInstance<CachingTokenListProvider>;

  const ROUTING_CONFIG: AlphaRouterConfig = {
    v3PoolSelection: {
      topN: 0,
      topNDirectSwaps: 0,
      topNTokenInOut: 0,
      topNSecondHop: 0,
      topNWithEachBaseToken: 0,
      topNWithBaseToken: 0,
    },
    v2PoolSelection: {
      topN: 0,
      topNDirectSwaps: 0,
      topNTokenInOut: 0,
      topNSecondHop: 0,
      topNWithEachBaseToken: 0,
      topNWithBaseToken: 0,
    },
    maxSwapsPerPath: 3,
    minSplits: 1,
    maxSplits: 3,
    distributionPercent: 5,
    forceCrossProtocol: false,
  };

  beforeEach(() => {
    mockTokenProvider = sinon.createStubInstance(TokenProvider);
    mockV3PoolProvider = sinon.createStubInstance(V3PoolProvider);
    mockV3SubgraphProvider = sinon.createStubInstance(V3SubgraphProvider);
    mockBlockTokenListProvider = sinon.createStubInstance(
      CachingTokenListProvider
    );

    const mockTokens = [USDC, DAI, WETH9[1], USDT];
    const mockPools = [
      USDC_DAI_LOW,
      USDC_DAI_MEDIUM,
      USDC_WETH_LOW,
      WETH9_USDT_LOW,
      DAI_USDT_LOW,
    ];
    const mockSubgraphPools: V3SubgraphPool[] = _.map(
      mockPools,
      poolToV3SubgraphPool
    );

    mockV3SubgraphProvider.getPools.resolves(mockSubgraphPools);
    mockV3PoolProvider.getPools.resolves(buildMockV3PoolAccessor(mockPools));
    mockTokenProvider.getTokens.resolves(buildMockTokenAccessor(mockTokens));
  });

  test('succeeds to get top pools by liquidity', async () => {
    await getV3CandidatePools({
      tokenIn: USDC,
      tokenOut: DAI,
      routeType: TradeType.EXACT_INPUT,
      routingConfig: {
        ...ROUTING_CONFIG,
        v3PoolSelection: {
          ...ROUTING_CONFIG.v3PoolSelection,
          topN: 2,
        },
      },
      poolProvider: mockV3PoolProvider,
      subgraphProvider: mockV3SubgraphProvider,
      tokenProvider: mockTokenProvider,
      blockedTokenListProvider: mockBlockTokenListProvider,
      chainId: ChainId.MAINNET,
    });

    expect(
      mockV3PoolProvider.getPools.calledWithExactly([
        [USDC, WETH9[1], FeeAmount.LOW],
        [WETH9[1], USDT, FeeAmount.LOW],
      ])
    ).toBeTruthy();
  });

  test('succeeds to get top pools directly swapping token in for token out', async () => {
    await getV3CandidatePools({
      tokenIn: USDC,
      tokenOut: DAI,
      routeType: TradeType.EXACT_INPUT,
      routingConfig: {
        ...ROUTING_CONFIG,
        v3PoolSelection: {
          ...ROUTING_CONFIG.v3PoolSelection,
          topNDirectSwaps: 2,
        },
      },
      poolProvider: mockV3PoolProvider,
      subgraphProvider: mockV3SubgraphProvider,
      tokenProvider: mockTokenProvider,
      blockedTokenListProvider: mockBlockTokenListProvider,
      chainId: ChainId.MAINNET,
    });

    expect(
      mockV3PoolProvider.getPools.calledWithExactly([
        [DAI, USDC, FeeAmount.LOW],
        [DAI, USDC, FeeAmount.MEDIUM],
      ])
    ).toBeTruthy();
  });

  test('succeeds to get top pools involving token in or token out', async () => {
    await getV3CandidatePools({
      tokenIn: USDC,
      tokenOut: DAI,
      routeType: TradeType.EXACT_INPUT,
      routingConfig: {
        ...ROUTING_CONFIG,
        v3PoolSelection: {
          ...ROUTING_CONFIG.v3PoolSelection,
          topNTokenInOut: 1,
        },
      },
      poolProvider: mockV3PoolProvider,
      subgraphProvider: mockV3SubgraphProvider,
      tokenProvider: mockTokenProvider,
      blockedTokenListProvider: mockBlockTokenListProvider,
      chainId: ChainId.MAINNET,
    });

    expect(
      mockV3PoolProvider.getPools.calledWithExactly([
        [USDC, WETH9[1], FeeAmount.LOW],
        [DAI, USDC, FeeAmount.LOW],
      ])
    ).toBeTruthy();
  });
});
