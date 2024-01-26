import { Protocol } from '@uniswap/router-sdk';
import { ChainId, Token, TradeType } from '@uniswap/sdk-core';
import { ITokenListProvider, IV2SubgraphProvider, V2SubgraphPool } from '../../../providers';
import { ITokenProvider } from '../../../providers/token-provider';
import { IV2PoolProvider, V2PoolAccessor } from '../../../providers/v2/pool-provider';
import { IV3PoolProvider, V3PoolAccessor } from '../../../providers/v3/pool-provider';
import { IV3SubgraphProvider, V3SubgraphPool } from '../../../providers/v3/subgraph-provider';
import { AlphaRouterConfig } from '../alpha-router';
export type PoolId = {
    id: string;
};
export type CandidatePoolsBySelectionCriteria = {
    protocol: Protocol;
    selections: CandidatePoolsSelections;
};
export type CandidatePoolsSelections = {
    topByBaseWithTokenIn: PoolId[];
    topByBaseWithTokenOut: PoolId[];
    topByDirectSwapPool: PoolId[];
    topByEthQuoteTokenPool: PoolId[];
    topByTVL: PoolId[];
    topByTVLUsingTokenIn: PoolId[];
    topByTVLUsingTokenOut: PoolId[];
    topByTVLUsingTokenInSecondHops: PoolId[];
    topByTVLUsingTokenOutSecondHops: PoolId[];
};
export type V3GetCandidatePoolsParams = {
    tokenIn: Token;
    tokenOut: Token;
    routeType: TradeType;
    routingConfig: AlphaRouterConfig;
    subgraphProvider: IV3SubgraphProvider;
    tokenProvider: ITokenProvider;
    poolProvider: IV3PoolProvider;
    blockedTokenListProvider?: ITokenListProvider;
    chainId: ChainId;
};
export type V2GetCandidatePoolsParams = {
    tokenIn: Token;
    tokenOut: Token;
    routeType: TradeType;
    routingConfig: AlphaRouterConfig;
    subgraphProvider: IV2SubgraphProvider;
    tokenProvider: ITokenProvider;
    poolProvider: IV2PoolProvider;
    blockedTokenListProvider?: ITokenListProvider;
    chainId: ChainId;
};
export type MixedRouteGetCandidatePoolsParams = {
    v3CandidatePools: V3CandidatePools;
    v2CandidatePools: V2CandidatePools;
    routingConfig: AlphaRouterConfig;
    tokenProvider: ITokenProvider;
    v2poolProvider: IV2PoolProvider;
    v3poolProvider: IV3PoolProvider;
    blockedTokenListProvider?: ITokenListProvider;
    chainId: ChainId;
};
export type V3CandidatePools = {
    poolAccessor: V3PoolAccessor;
    candidatePools: CandidatePoolsBySelectionCriteria;
    subgraphPools: V3SubgraphPool[];
};
export declare function getV3CandidatePools({ tokenIn, tokenOut, routeType, routingConfig, subgraphProvider, tokenProvider, poolProvider, blockedTokenListProvider, chainId, }: V3GetCandidatePoolsParams): Promise<V3CandidatePools>;
export type V2CandidatePools = {
    poolAccessor: V2PoolAccessor;
    candidatePools: CandidatePoolsBySelectionCriteria;
    subgraphPools: V2SubgraphPool[];
};
export declare function getV2CandidatePools({ tokenIn, tokenOut, routeType, routingConfig, subgraphProvider, tokenProvider, poolProvider, blockedTokenListProvider, chainId, }: V2GetCandidatePoolsParams): Promise<V2CandidatePools>;
export type MixedCandidatePools = {
    V2poolAccessor: V2PoolAccessor;
    V3poolAccessor: V3PoolAccessor;
    candidatePools: CandidatePoolsBySelectionCriteria;
    subgraphPools: (V2SubgraphPool | V3SubgraphPool)[];
};
export declare function getMixedRouteCandidatePools({ v3CandidatePools, v2CandidatePools, routingConfig, tokenProvider, v3poolProvider, v2poolProvider, }: MixedRouteGetCandidatePoolsParams): Promise<MixedCandidatePools>;
