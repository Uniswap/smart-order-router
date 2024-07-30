import { Protocol } from '@uniswap/router-sdk';
import { ChainId, Token, TradeType } from '@uniswap/sdk-core';
import { Pair } from '@uniswap/v2-sdk';
import { encodeSqrtRatioX96, FeeAmount, Pool } from '@uniswap/v3-sdk';
import _ from 'lodash';
import sinon from 'sinon';
import {
  AlphaRouterConfig,
  CachingTokenListProvider,
  DAI_MAINNET as DAI,
  TokenProvider,
  USDC_MAINNET as USDC,
  USDT_MAINNET as USDT,
  V2PoolProvider,
  V2SubgraphPool,
  V2SubgraphProvider,
  V3PoolProvider,
  V3SubgraphPool,
  V3SubgraphProvider,
  WRAPPED_NATIVE_CURRENCY,
} from '../../../../../src';
import {
  getMixedCrossLiquidityCandidatePools,
  getV3CandidatePools,
  V2CandidatePools,
  V3CandidatePools
} from '../../../../../src/routers/alpha-router/functions/get-candidate-pools';
import {
  buildMockTokenAccessor,
  buildMockV2PoolAccessor,
  buildMockV3PoolAccessor,
  DAI_USDT,
  DAI_USDT_LOW,
  DAI_WETH,
  DAI_WETH_MEDIUM,
  pairToV2SubgraphPool,
  poolToV3SubgraphPool,
  USDC_DAI,
  USDC_DAI_LOW,
  USDC_DAI_MEDIUM,
  USDC_WETH,
  USDC_WETH_LOW,
  WETH9_USDT_LOW,
  WETH_DAI,
  WETH_USDT,
} from '../../../../test-util/mock-data';

describe('get candidate pools', () => {
  const poolToV3Subgraph = (pool: Pool) => poolToV3SubgraphPool(
    pool,
    `${pool.fee.toString()}#${pool.token0.address.toLowerCase()}#${pool.token1.address.toLowerCase()}`
  );
  const pairToV2Subgraph = (pair: Pair) => pairToV2SubgraphPool(
    pair,
    `${pair.token0.address.toLowerCase()}#${pair.token1.address.toLowerCase()}`
  );
  let mockTokenProvider: sinon.SinonStubbedInstance<TokenProvider>;
  let mockV3PoolProvider: sinon.SinonStubbedInstance<V3PoolProvider>;
  let mockV3SubgraphProvider: sinon.SinonStubbedInstance<V3SubgraphProvider>;
  let mockBlockTokenListProvider: sinon.SinonStubbedInstance<CachingTokenListProvider>;
  let mockV2PoolProvider: sinon.SinonStubbedInstance<V2PoolProvider>;
  let mockV2SubgraphProvider: sinon.SinonStubbedInstance<V2SubgraphProvider>;

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

  const mockTokens = [USDC, DAI, WRAPPED_NATIVE_CURRENCY[1]!, USDT];
  const mockV3Pools = [
    USDC_DAI_LOW,
    USDC_DAI_MEDIUM,
    USDC_WETH_LOW,
    WETH9_USDT_LOW,
    DAI_USDT_LOW,
  ];
  const mockV2Pools = [
    DAI_USDT,
    DAI_WETH,
    USDC_WETH,
    WETH_USDT,
    USDC_DAI
  ];

  beforeEach(() => {
    mockTokenProvider = sinon.createStubInstance(TokenProvider);
    mockV3PoolProvider = sinon.createStubInstance(V3PoolProvider);
    mockV3SubgraphProvider = sinon.createStubInstance(V3SubgraphProvider);
    mockBlockTokenListProvider = sinon.createStubInstance(
      CachingTokenListProvider
    );
    mockV2PoolProvider = sinon.createStubInstance(V2PoolProvider);
    mockV2SubgraphProvider = sinon.createStubInstance(V2SubgraphProvider);

    const mockV3SubgraphPools: V3SubgraphPool[] = mockV3Pools.map(poolToV3Subgraph);
    const mockV2SubgraphPools: V2SubgraphPool[] = mockV2Pools.map(pairToV2Subgraph);

    mockV2SubgraphProvider.getPools.resolves(mockV2SubgraphPools);
    mockV2PoolProvider.getPools.resolves(buildMockV2PoolAccessor(mockV2Pools));

    mockV3SubgraphProvider.getPools.resolves(mockV3SubgraphPools);
    mockV3PoolProvider.getPools.resolves(buildMockV3PoolAccessor(mockV3Pools));
    mockV3PoolProvider.getPoolAddress.callsFake(
      (t1: Token, t2: Token, f: FeeAmount) => {
        return {
          poolAddress: Pool.getAddress(t1, t2, f),
          token0: t1.sortsBefore(t2) ? t1 : t2,
          token1: t1.sortsBefore(t2) ? t2 : t1,
        };
      }
    );
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
        [USDC, WRAPPED_NATIVE_CURRENCY[1]!, FeeAmount.LOW],
        [WRAPPED_NATIVE_CURRENCY[1]!, USDT, FeeAmount.LOW],
      ], { blockNumber: undefined })
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
      ], { blockNumber: undefined })
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
        [USDC, WRAPPED_NATIVE_CURRENCY[1]!, FeeAmount.LOW],
        [DAI, USDC, FeeAmount.LOW],
      ], { blockNumber: undefined })
    ).toBeTruthy();
  });

  test('succeeds to get direct swap pools even if they dont exist in the subgraph', async () => {
    // Mock so that DAI_WETH exists on chain, but not in the subgraph
    const poolsOnSubgraph = [
      USDC_DAI_LOW,
      USDC_DAI_MEDIUM,
      USDC_WETH_LOW,
      WETH9_USDT_LOW,
      DAI_USDT_LOW,
    ];

    const subgraphPools: V3SubgraphPool[] = _.map(
      poolsOnSubgraph,
      poolToV3SubgraphPool
    );

    mockV3SubgraphProvider.getPools.resolves(subgraphPools);

    const DAI_WETH_LOW = new Pool(
      DAI,
      WRAPPED_NATIVE_CURRENCY[1]!,
      FeeAmount.LOW,
      encodeSqrtRatioX96(1, 1),
      10,
      0
    );
    mockV3PoolProvider.getPools.resolves(
      buildMockV3PoolAccessor([...poolsOnSubgraph, DAI_WETH_LOW])
    );

    await getV3CandidatePools({
      tokenIn: WRAPPED_NATIVE_CURRENCY[1]!,
      tokenOut: DAI,
      routeType: TradeType.EXACT_INPUT,
      routingConfig: {
        ...ROUTING_CONFIG,
        v3PoolSelection: {
          ...ROUTING_CONFIG.v3PoolSelection,
          topNDirectSwaps: 1,
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
        [DAI, WRAPPED_NATIVE_CURRENCY[1]!, FeeAmount.HIGH],
        [DAI, WRAPPED_NATIVE_CURRENCY[1]!, FeeAmount.MEDIUM],
        [DAI, WRAPPED_NATIVE_CURRENCY[1]!, FeeAmount.LOW],
        [DAI, WRAPPED_NATIVE_CURRENCY[1]!, FeeAmount.LOWEST],
      ], { blockNumber: undefined })
    ).toBeTruthy();
  });

  describe('getMixedCrossLiquidityCandidatePools', () => {
    const mockV3CandidatePools = (withTokenIn: Pool[], withTokenOut: Pool[], selectedPools: Pool[] = []) => {
      const poolsWithTokenIn = withTokenIn.map(poolToV3Subgraph);
      const poolsWithTokenOut = withTokenOut.map(poolToV3Subgraph);
      const subgraphPools = [...selectedPools, ...withTokenIn, ...withTokenOut].map(poolToV3Subgraph);

      return {
        subgraphPools: subgraphPools,
        candidatePools: {
          protocol: Protocol.V3,
          selections: {
            topByTVLUsingTokenIn: poolsWithTokenIn,
            topByTVLUsingTokenOut: poolsWithTokenOut,
          } as any
        },
      } as unknown as V3CandidatePools;
    };

    const mockV2CandidatePools = (withTokenIn: Pair[], withTokenOut: Pair[], selectedPools: Pair[] = []) => {
      const poolsWithTokenIn = withTokenIn.map(pairToV2Subgraph);
      const poolsWithTokenOut = withTokenOut.map(pairToV2Subgraph);
      const subgraphPools = [...selectedPools, ...withTokenIn, ...withTokenOut].map(pairToV2Subgraph);

      return {
        subgraphPools: subgraphPools,
        candidatePools: {
          protocol: Protocol.V2,
          selections: {
            topByTVLUsingTokenIn: poolsWithTokenIn,
            topByTVLUsingTokenOut: poolsWithTokenOut,
          } as any
        },
      } as unknown as V2CandidatePools;
    };

    describe('fetching cross protocol missing v2', () => {
      test('Obtains the highest liquidity pools missing from the cross protocol selection', async () => {
        const v3Candidates = mockV3CandidatePools([WETH9_USDT_LOW], [USDC_DAI_LOW]);
        const v2Candidates = mockV2CandidatePools([WETH_DAI], [WETH_DAI]);

        const crossLiquidityCandidatePools = await getMixedCrossLiquidityCandidatePools({
          tokenIn: WRAPPED_NATIVE_CURRENCY[1]!,
          tokenOut: DAI,
          v2SubgraphProvider: mockV2SubgraphProvider,
          v3SubgraphProvider: mockV3SubgraphProvider,
          v2Candidates,
          v3Candidates
        });

        expect(crossLiquidityCandidatePools).toEqual({
          v2Pools: [pairToV2Subgraph(DAI_USDT), pairToV2Subgraph(USDC_WETH)],
          v3Pools: [],
        });
      });

      test(
        'Obtains the highest liquidity pools missing from the cross protocol selection, but ignores already selected pools',
        async () => {
          const v3Candidates = mockV3CandidatePools([WETH9_USDT_LOW], [USDC_DAI_LOW]);
          const v2Candidates = mockV2CandidatePools([WETH_DAI], [WETH_DAI], [DAI_USDT]);

          const crossLiquidityCandidatePools = await getMixedCrossLiquidityCandidatePools({
            tokenIn: WRAPPED_NATIVE_CURRENCY[1]!,
            tokenOut: DAI,
            v2SubgraphProvider: mockV2SubgraphProvider,
            v3SubgraphProvider: mockV3SubgraphProvider,
            v2Candidates,
            v3Candidates
          });

          expect(crossLiquidityCandidatePools).toEqual({
            v2Pools: [pairToV2Subgraph(USDC_WETH)],
            v3Pools: [],
          });
        }
      );
    });

    describe('fetching cross protocol missing v3', () => {
      test('Obtains the highest liquidity pools missing from the cross protocol selection', async () => {
        const v3Candidates = mockV3CandidatePools([DAI_WETH_MEDIUM], [DAI_WETH_MEDIUM]);
        const v2Candidates = mockV2CandidatePools([WETH_USDT], [USDC_DAI]);

        const crossLiquidityCandidatePools = await getMixedCrossLiquidityCandidatePools({
          tokenIn: WRAPPED_NATIVE_CURRENCY[1]!,
          tokenOut: DAI,
          v2SubgraphProvider: mockV2SubgraphProvider,
          v3SubgraphProvider: mockV3SubgraphProvider,
          v2Candidates,
          v3Candidates
        });

        expect(crossLiquidityCandidatePools).toEqual({
          v2Pools: [],
          v3Pools: [poolToV3Subgraph(DAI_USDT_LOW), poolToV3Subgraph(USDC_WETH_LOW)],
        });
      });

      test(
        'Obtains the highest liquidity pools missing from the cross protocol selection, but ignores already selected pools',
        async () => {
          const v3Candidates = mockV3CandidatePools([DAI_WETH_MEDIUM], [DAI_WETH_MEDIUM], [USDC_WETH_LOW]);
          const v2Candidates = mockV2CandidatePools([WETH_USDT], [USDC_DAI]);

          const crossLiquidityCandidatePools = await getMixedCrossLiquidityCandidatePools({
            tokenIn: WRAPPED_NATIVE_CURRENCY[1]!,
            tokenOut: DAI,
            v2SubgraphProvider: mockV2SubgraphProvider,
            v3SubgraphProvider: mockV3SubgraphProvider,
            v2Candidates,
            v3Candidates
          });

          expect(crossLiquidityCandidatePools).toEqual({
            v2Pools: [],
            v3Pools: [poolToV3Subgraph(DAI_USDT_LOW)],
          });
        }
      );
    });

    describe('fetching cross protocol missing v3 and v2', () => {
      test('Obtains the highest liquidity pools missing from the cross protocol selection', async () => {
        const v3Candidates = mockV3CandidatePools([WETH9_USDT_LOW], [USDC_DAI_LOW]);
        const v2Candidates = mockV2CandidatePools([WETH_USDT], [USDC_DAI]);

        const crossLiquidityCandidatePools = await getMixedCrossLiquidityCandidatePools({
          tokenIn: WRAPPED_NATIVE_CURRENCY[1]!,
          tokenOut: DAI,
          v2SubgraphProvider: mockV2SubgraphProvider,
          v3SubgraphProvider: mockV3SubgraphProvider,
          v2Candidates,
          v3Candidates
        });

        expect(crossLiquidityCandidatePools).toEqual({
          v2Pools: [pairToV2Subgraph(DAI_USDT), pairToV2Subgraph(USDC_WETH)],
          v3Pools: [poolToV3Subgraph(DAI_USDT_LOW), poolToV3Subgraph(USDC_WETH_LOW)],
        });
      });

      test(
        'Obtains the highest liquidity pools missing from the cross protocol selection, but ignores already selected pools',
        async () => {
          const v3Candidates = mockV3CandidatePools([WETH9_USDT_LOW], [USDC_DAI_LOW], [USDC_WETH_LOW]);
          const v2Candidates = mockV2CandidatePools([WETH_USDT], [USDC_DAI], [DAI_USDT]);

          const crossLiquidityCandidatePools = await getMixedCrossLiquidityCandidatePools({
            tokenIn: WRAPPED_NATIVE_CURRENCY[1]!,
            tokenOut: DAI,
            v2SubgraphProvider: mockV2SubgraphProvider,
            v3SubgraphProvider: mockV3SubgraphProvider,
            v2Candidates,
            v3Candidates
          });

          expect(crossLiquidityCandidatePools).toEqual({
            v2Pools: [pairToV2Subgraph(USDC_WETH)],
            v3Pools: [poolToV3Subgraph(DAI_USDT_LOW)],
          });
        }
      );
    });
  });
});
