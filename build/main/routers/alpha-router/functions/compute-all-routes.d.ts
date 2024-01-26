import { Token } from '@uniswap/sdk-core';
import { Pair } from '@uniswap/v2-sdk';
import { Pool } from '@uniswap/v3-sdk';
import { MixedRoute, V2Route, V3Route } from '../../router';
export declare function computeAllV3Routes(tokenIn: Token, tokenOut: Token, pools: Pool[], maxHops: number): V3Route[];
export declare function computeAllV2Routes(tokenIn: Token, tokenOut: Token, pools: Pair[], maxHops: number): V2Route[];
export declare function computeAllMixedRoutes(tokenIn: Token, tokenOut: Token, parts: (Pool | Pair)[], maxHops: number): MixedRoute[];
export declare function computeAllRoutes<TPool extends Pair | Pool, TRoute extends V3Route | V2Route | MixedRoute>(tokenIn: Token, tokenOut: Token, buildRoute: (route: TPool[], tokenIn: Token, tokenOut: Token) => TRoute, pools: TPool[], maxHops: number): TRoute[];
