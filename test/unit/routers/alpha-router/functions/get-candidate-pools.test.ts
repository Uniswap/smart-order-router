import { TradeType } from '@uniswap/sdk-core';
import { FeeAmount } from '@uniswap/v3-sdk';
import _ from 'lodash';
import sinon from 'sinon';
import {
  ChainId,
  DAI_MAINNET as DAI,
  PoolProvider,
  SubgraphPool,
  SubgraphProvider,
  CachingTokenListProvider,
  TokenProvider,
  USDC_MAINNET as USDC,
  USDT_MAINNET as USDT,
  WETH9,
} from '../../../../../src';
import { getCandidatePools } from '../../../../../src/routers/alpha-router/functions/get-candidate-pools';
import {
  buildMockPoolAccessor,
  buildMockTokenAccessor,
  DAI_USDT_LOW,
  poolToSubgraphPool,
  USDC_DAI_LOW,
  USDC_DAI_MEDIUM,
  USDC_WETH_LOW,
  WETH9_USDT_LOW,
} from '../../../test-util/mock-data';

describe('get candidate pools', () => {
  let mockPoolProvider: sinon.SinonStubbedInstance<PoolProvider>;
  let mockTokenProvider: sinon.SinonStubbedInstance<TokenProvider>;
  let mockSubgraphProvider: sinon.SinonStubbedInstance<SubgraphProvider>;
  let mockBlockTokenListProvider: sinon.SinonStubbedInstance<CachingTokenListProvider>;

  const ROUTING_CONFIG = {
    topN: 0,
    topNDirectSwaps: 0,
    topNTokenInOut: 0,
    topNSecondHop: 0,
    topNWithEachBaseToken: 0,
    topNWithBaseToken: 0,
    topNWithBaseTokenInSet: false,
    maxSwapsPerPath: 3,
    minSplits: 1,
    maxSplits: 3,
    distributionPercent: 5,
  };

  beforeEach(() => {
    mockPoolProvider = sinon.createStubInstance(PoolProvider);
    mockTokenProvider = sinon.createStubInstance(TokenProvider);
    mockSubgraphProvider = sinon.createStubInstance(SubgraphProvider);
    mockBlockTokenListProvider = sinon.createStubInstance(CachingTokenListProvider);

    const mockTokens = [USDC, DAI, WETH9[1], USDT];
    const mockPools = [
      USDC_DAI_LOW,
      USDC_DAI_MEDIUM,
      USDC_WETH_LOW,
      WETH9_USDT_LOW,
      DAI_USDT_LOW,
    ];
    const mockSubgraphPools: SubgraphPool[] = _.map(
      mockPools,
      poolToSubgraphPool
    );

    mockSubgraphProvider.getPools.resolves(mockSubgraphPools);
    mockPoolProvider.getPools.resolves(buildMockPoolAccessor(mockPools));
    mockTokenProvider.getTokens.resolves(buildMockTokenAccessor(mockTokens));
  });

  test('succeeds to get top pools by liquidity', async () => {
    await getCandidatePools({
      tokenIn: USDC,
      tokenOut: DAI,
      routeType: TradeType.EXACT_INPUT,
      routingConfig: {
        ...ROUTING_CONFIG,
        topN: 2,
      },
      poolProvider: mockPoolProvider,
      subgraphProvider: mockSubgraphProvider,
      tokenProvider: mockTokenProvider,
      blockedTokenListProvider: mockBlockTokenListProvider,
      chainId: ChainId.MAINNET
    });

    expect(
      mockPoolProvider.getPools.calledWithExactly([
        [USDC, WETH9[1], FeeAmount.LOW],
        [WETH9[1], USDT, FeeAmount.LOW],
      ])
    ).toBeTruthy();
  });

  test('succeeds to get top pools directly swapping token in for token out', async () => {
    await getCandidatePools({
      tokenIn: USDC,
      tokenOut: DAI,
      routeType: TradeType.EXACT_INPUT,
      routingConfig: {
        ...ROUTING_CONFIG,
        topNDirectSwaps: 2,
      },
      poolProvider: mockPoolProvider,
      subgraphProvider: mockSubgraphProvider,
      tokenProvider: mockTokenProvider,
      blockedTokenListProvider: mockBlockTokenListProvider,
      chainId: ChainId.MAINNET
    });

    expect(
      mockPoolProvider.getPools.calledWithExactly([
        [DAI, USDC, FeeAmount.LOW],
        [DAI, USDC, FeeAmount.MEDIUM],
      ])
    ).toBeTruthy();
  });

  test('succeeds to get top pools involving token in or token out', async () => {
    await getCandidatePools({
      tokenIn: USDC,
      tokenOut: DAI,
      routeType: TradeType.EXACT_INPUT,
      routingConfig: {
        ...ROUTING_CONFIG,
        topNTokenInOut: 1,
      },
      poolProvider: mockPoolProvider,
      subgraphProvider: mockSubgraphProvider,
      tokenProvider: mockTokenProvider,
      blockedTokenListProvider: mockBlockTokenListProvider,
      chainId: ChainId.MAINNET
    });

    expect(
      mockPoolProvider.getPools.calledWithExactly([
        [USDC, WETH9[1], FeeAmount.LOW],
        [DAI, USDC, FeeAmount.LOW],
      ])
    ).toBeTruthy();
  });
});
