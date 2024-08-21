import { ADDRESS_ZERO, Protocol } from '@uniswap/router-sdk';
import { ChainId, Currency, Token, TradeType } from '@uniswap/sdk-core';
import { Pair } from '@uniswap/v2-sdk';
import { encodeSqrtRatioX96, FeeAmount, Pool as V3Pool } from '@uniswap/v3-sdk';
import { Pool as V4Pool } from '@uniswap/v4-sdk';
import _ from 'lodash';
import sinon from 'sinon';
import {
  AlphaRouterConfig,
  CachingTokenListProvider,
  DAI_MAINNET as DAI, sortsBefore,
  TokenProvider,
  USDC_MAINNET as USDC,
  USDT_MAINNET as USDT,
  V2PoolProvider,
  V2SubgraphPool,
  V2SubgraphProvider,
  V3PoolProvider,
  V3SubgraphPool,
  V3SubgraphProvider,
  V4PoolProvider,
  V4SubgraphPool,
  V4SubgraphProvider,
  WRAPPED_NATIVE_CURRENCY
} from '../../../../../src';
import {
  getMixedCrossLiquidityCandidatePools,
  getV3CandidatePools,
  getV4CandidatePools,
  V2CandidatePools,
  V3CandidatePools
} from '../../../../../src/routers/alpha-router/functions/get-candidate-pools';
import {
  buildMockTokenAccessor,
  buildMockV2PoolAccessor,
  buildMockV3PoolAccessor,
  buildMockV4PoolAccessor,
  DAI_USDT,
  DAI_USDT_LOW, DAI_USDT_V4_LOW,
  DAI_WETH,
  DAI_WETH_MEDIUM,
  pairToV2SubgraphPool,
  poolToV3SubgraphPool, poolToV4SubgraphPool,
  USDC_DAI,
  USDC_DAI_LOW,
  USDC_DAI_MEDIUM, USDC_DAI_V4_LOW, USDC_DAI_V4_MEDIUM,
  USDC_WETH,
  USDC_WETH_LOW, USDC_WETH_V4_LOW,
  WETH9_USDT_LOW, WETH9_USDT_V4_LOW,
  WETH_DAI,
  WETH_USDT
} from '../../../../test-util/mock-data';

describe('get candidate pools', () => {
  const poolToV4Subgraph = (pool: V4Pool) => poolToV4SubgraphPool(
    pool,
    `${pool.poolId}`
  );
  const poolToV3Subgraph = (pool: V3Pool) => poolToV3SubgraphPool(
    pool,
    `${pool.fee.toString()}#${pool.token0.address.toLowerCase()}#${pool.token1.address.toLowerCase()}`
  );
  const pairToV2Subgraph = (pair: Pair) => pairToV2SubgraphPool(
    pair,
    `${pair.token0.address.toLowerCase()}#${pair.token1.address.toLowerCase()}`
  );
  let mockTokenProvider: sinon.SinonStubbedInstance<TokenProvider>;
  let mockV4PoolProvider: sinon.SinonStubbedInstance<V4PoolProvider>;
  let mockV4SubgraphProvider: sinon.SinonStubbedInstance<V4SubgraphProvider>;
  let mockV3PoolProvider: sinon.SinonStubbedInstance<V3PoolProvider>;
  let mockV3SubgraphProvider: sinon.SinonStubbedInstance<V3SubgraphProvider>;
  let mockBlockTokenListProvider: sinon.SinonStubbedInstance<CachingTokenListProvider>;
  let mockV2PoolProvider: sinon.SinonStubbedInstance<V2PoolProvider>;
  let mockV2SubgraphProvider: sinon.SinonStubbedInstance<V2SubgraphProvider>;

  const ROUTING_CONFIG: AlphaRouterConfig = {
    v4PoolSelection: {
      topN: 0,
      topNDirectSwaps: 0,
      topNTokenInOut: 0,
      topNSecondHop: 0,
      topNWithEachBaseToken: 0,
      topNWithBaseToken: 0,
    },
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

  const mockV4Pools = [
    USDC_DAI_V4_LOW,
    USDC_DAI_V4_MEDIUM,
    USDC_WETH_V4_LOW,
    WETH9_USDT_V4_LOW,
    DAI_USDT_V4_LOW
  ]
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
    mockV4PoolProvider = sinon.createStubInstance(V4PoolProvider);
    mockV4SubgraphProvider = sinon.createStubInstance(V4SubgraphProvider);
    mockV3PoolProvider = sinon.createStubInstance(V3PoolProvider);
    mockV3SubgraphProvider = sinon.createStubInstance(V3SubgraphProvider);
    mockBlockTokenListProvider = sinon.createStubInstance(
      CachingTokenListProvider
    );
    mockV2PoolProvider = sinon.createStubInstance(V2PoolProvider);
    mockV2SubgraphProvider = sinon.createStubInstance(V2SubgraphProvider);

    const mockV4SubgraphPools: V4SubgraphPool[] = mockV4Pools.map(poolToV4Subgraph);
    const mockV3SubgraphPools: V3SubgraphPool[] = mockV3Pools.map(poolToV3Subgraph);
    const mockV2SubgraphPools: V2SubgraphPool[] = mockV2Pools.map(pairToV2Subgraph);

    mockV2SubgraphProvider.getPools.resolves(mockV2SubgraphPools);
    mockV2PoolProvider.getPools.resolves(buildMockV2PoolAccessor(mockV2Pools));

    mockV3SubgraphProvider.getPools.resolves(mockV3SubgraphPools);
    mockV3PoolProvider.getPools.resolves(buildMockV3PoolAccessor(mockV3Pools));
    mockV3PoolProvider.getPoolAddress.callsFake(
      (t1: Token, t2: Token, f: FeeAmount) => {
        return {
          poolAddress: V3Pool.getAddress(t1, t2, f),
          token0: t1.sortsBefore(t2) ? t1 : t2,
          token1: t1.sortsBefore(t2) ? t2 : t1,
        };
      }
    );

    mockV4SubgraphProvider.getPools.resolves(mockV4SubgraphPools);
    mockV4PoolProvider.getPools.resolves(buildMockV4PoolAccessor(mockV4Pools));
    mockV4PoolProvider.getPoolId.callsFake(
      (c1: Currency, c2: Currency, f: number, tickSpacing: number, hooks: string) => {
        return {
          poolId: V4Pool.getPoolId(c1, c2, f, tickSpacing, hooks),
          currency0: sortsBefore(c1, c2) ? c1 : c2,
          currency1: sortsBefore(c1, c2) ? c2 : c1,
        };
      }
    );

    mockTokenProvider.getTokens.resolves(buildMockTokenAccessor(mockTokens));
  });

  [Protocol.V3, Protocol.V4].forEach((protocol) => {
    test(`succeeds to get top pools by liquidity for protocol ${protocol}`, async () => {
      if (protocol === Protocol.V3) {
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
      } else if (protocol === Protocol.V4) {
        await getV4CandidatePools({
          tokenIn: USDC,
          tokenOut: DAI,
          routeType: TradeType.EXACT_INPUT,
          routingConfig: {
            ...ROUTING_CONFIG,
            v4PoolSelection: {
              ...ROUTING_CONFIG.v4PoolSelection,
              topN: 2,
            },
          },
          poolProvider: mockV4PoolProvider,
          subgraphProvider: mockV4SubgraphProvider,
          tokenProvider: mockTokenProvider,
          blockedTokenListProvider: mockBlockTokenListProvider,
          chainId: ChainId.MAINNET,
          }
        )

        expect(
          mockV4PoolProvider.getPools.calledWithExactly([
            [USDC, WRAPPED_NATIVE_CURRENCY[1]!, FeeAmount.LOW, 10, ADDRESS_ZERO],
            [WRAPPED_NATIVE_CURRENCY[1]!, USDT, FeeAmount.LOW, 10, ADDRESS_ZERO],
          ], { blockNumber: undefined })
        ).toBeTruthy();
      }
    });

    test(`succeeds to get top pools directly swapping token in for token out for protocol ${protocol}`, async () => {
      if (protocol === Protocol.V3) {
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
      } else if (protocol === Protocol.V4) {
        await getV4CandidatePools({
          tokenIn: USDC,
          tokenOut: DAI,
          routeType: TradeType.EXACT_INPUT,
          routingConfig: {
            ...ROUTING_CONFIG,
            v4PoolSelection: {
              ...ROUTING_CONFIG.v4PoolSelection,
              topNDirectSwaps: 2,
            },
          },
          poolProvider: mockV4PoolProvider,
          subgraphProvider: mockV4SubgraphProvider,
          tokenProvider: mockTokenProvider,
          blockedTokenListProvider: mockBlockTokenListProvider,
          chainId: ChainId.MAINNET,
        });

        expect(
          mockV4PoolProvider.getPools.calledWithExactly([
            [DAI, USDC, FeeAmount.LOW, 10, ADDRESS_ZERO],
            [DAI, USDC, FeeAmount.MEDIUM, 60, ADDRESS_ZERO],
          ], { blockNumber: undefined })
        ).toBeTruthy();
      }
    });

    test(`succeeds to get top pools involving token in or token out for protocol ${protocol}`, async () => {
      if (protocol === Protocol.V3) {
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
      } else if (protocol === Protocol.V4) {
        await getV4CandidatePools({
          tokenIn: USDC,
          tokenOut: DAI,
          routeType: TradeType.EXACT_INPUT,
          routingConfig: {
            ...ROUTING_CONFIG,
            v4PoolSelection: {
              ...ROUTING_CONFIG.v4PoolSelection,
              topNTokenInOut: 1,
            },
          },
          poolProvider: mockV4PoolProvider,
          subgraphProvider: mockV4SubgraphProvider,
          tokenProvider: mockTokenProvider,
          blockedTokenListProvider: mockBlockTokenListProvider,
          chainId: ChainId.MAINNET,
        });

        expect(
          mockV4PoolProvider.getPools.calledWithExactly([
            [USDC, WRAPPED_NATIVE_CURRENCY[1]!, FeeAmount.LOW, 10, ADDRESS_ZERO],
            [DAI, USDC, FeeAmount.LOW, 10, ADDRESS_ZERO],
          ], { blockNumber: undefined })
        ).toBeTruthy();
      }
    });

    test(`succeeds to get direct swap pools even if they dont exist in the subgraph for protocol ${protocol}`, async () => {
      if (protocol === Protocol.V3) {
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

        const DAI_WETH_LOW = new V3Pool(
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
      } else if (protocol === Protocol.V4) {
        // Mock so that DAI_WETH exists on chain, but not in the subgraph
        const poolsOnSubgraph = [
          USDC_DAI_V4_LOW,
          USDC_DAI_V4_MEDIUM,
          USDC_WETH_V4_LOW,
          WETH9_USDT_V4_LOW,
          DAI_USDT_V4_LOW,
        ];

        const subgraphPools: V4SubgraphPool[] = _.map(
          poolsOnSubgraph,
          poolToV4SubgraphPool
        );

        mockV4SubgraphProvider.getPools.resolves(subgraphPools);

        const DAI_WETH_V4_LOW = new V4Pool(
          DAI,
          WRAPPED_NATIVE_CURRENCY[1]!,
          FeeAmount.LOW,
          10,
          ADDRESS_ZERO,
          encodeSqrtRatioX96(1, 1),
          10,
          0
        );
        mockV4PoolProvider.getPools.resolves(
          buildMockV4PoolAccessor([...poolsOnSubgraph, DAI_WETH_V4_LOW])
        );

        await getV4CandidatePools({
          tokenIn: WRAPPED_NATIVE_CURRENCY[1]!,
          tokenOut: DAI,
          routeType: TradeType.EXACT_INPUT,
          routingConfig: {
            ...ROUTING_CONFIG,
            v4PoolSelection: {
              ...ROUTING_CONFIG.v4PoolSelection,
              topNDirectSwaps: 1,
            },
          },
          poolProvider: mockV4PoolProvider,
          subgraphProvider: mockV4SubgraphProvider,
          tokenProvider: mockTokenProvider,
          blockedTokenListProvider: mockBlockTokenListProvider,
          chainId: ChainId.MAINNET,
        });

        expect(
          mockV4PoolProvider.getPools.calledWithExactly([
            [DAI, WRAPPED_NATIVE_CURRENCY[1]!, FeeAmount.HIGH, 200, ADDRESS_ZERO],
            [DAI, WRAPPED_NATIVE_CURRENCY[1]!, FeeAmount.MEDIUM, 60, ADDRESS_ZERO],
            [DAI, WRAPPED_NATIVE_CURRENCY[1]!, FeeAmount.LOW, 10, ADDRESS_ZERO],
            [DAI, WRAPPED_NATIVE_CURRENCY[1]!, FeeAmount.LOWEST, 1, ADDRESS_ZERO],
          ], { blockNumber: undefined })
        ).toBeTruthy();
      }
    });
  })

  describe('getMixedCrossLiquidityCandidatePools', () => {
    const mockV3CandidatePools = (withTokenIn: V3Pool[], withTokenOut: V3Pool[], selectedPools: V3Pool[] = []) => {
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
