/**
 * Mirrored types from router-api for use in tests
 */

import { MethodParameters } from '@uniswap/v3-sdk'

export type TokenInRoute = {
    address: string
    chainId: number
    symbol: string
    decimals: string
}

export type BasicPoolInRoute = {
    type: string
    amountIn?: string
    amountOut?: string
}

export type V3PoolInRoute = {
    type: 'v3-pool'
    address: string
    tokenIn: TokenInRoute
    tokenOut: TokenInRoute
    sqrtRatioX96: string
    liquidity: string
    tickCurrent: string
    fee: string
    amountIn?: string
    amountOut?: string
}

export type V2PoolInRoute = {
    type: 'v2-pool'
    address: string
    tokenIn: TokenInRoute
    tokenOut: TokenInRoute
    reserve0: V2Reserve
    reserve1: V2Reserve
    amountIn?: string
    amountOut?: string
}

export type V2Reserve = {
    token: TokenInRoute
    quotient: string
}

export type QuoteResponse = {
    amount: string
    amountDecimals: string
    quote: string
    quoteDecimals: string
    quoteGasAdjusted: string
    quoteGasAdjustedDecimals: string
    gasUseEstimate: string
    gasUseEstimateQuote: string
    gasUseEstimateQuoteDecimals: string
    gasUseEstimateUSD: string
    gasPriceWei: string
    blockNumber: string
    route: Array<BasicPoolInRoute[]>
    routeString?: string
    methodParameters?: MethodParameters
    quoteId?: string
}

export type ParsedSwapRoute = {
    quote: string
    quoteDecimals: string
    quoteGasAdjusted: string
    quoteGasAdjustedDecimals: string
    methodParameters?: MethodParameters
    gasPriceWei: string
}

export type RouteResponse = {
    route: Array<BasicPoolInRoute[]>
    routeString?: string
}