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
    /**
     * Note route is commented out because it is built by iterating through all
     * returned subroutes. If we have to validate tests against that then uncomment
     */
    // route: Array<V3PoolInRoute[] | V2PoolInRoute[]>
    routeString?: string
    methodParameters?: MethodParameters
    quoteId?: string
}