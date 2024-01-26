import { BigNumber } from '@ethersproject/bignumber';
import { BaseProvider } from '@ethersproject/providers';
import { ChainId } from '@uniswap/sdk-core';
import { Options as RetryOptions } from 'async-retry';
import { MixedRoute, V2Route, V3Route } from '../routers/router';
import { CurrencyAmount } from '../util/amounts';
import { Result } from './multicall-provider';
import { UniswapMulticallProvider } from './multicall-uniswap-provider';
import { ProviderConfig } from './provider';
/**
 * An on chain quote for a swap.
 */
export type AmountQuote = {
    amount: CurrencyAmount;
    /**
     * Quotes can be null (e.g. pool did not have enough liquidity).
     */
    quote: BigNumber | null;
    /**
     * For each pool in the route, the sqrtPriceX96 after the swap.
     */
    sqrtPriceX96AfterList: BigNumber[] | null;
    /**
     * For each pool in the route, the number of ticks crossed.
     */
    initializedTicksCrossedList: number[] | null;
    /**
     * An estimate of the gas used by the swap. This is returned by the multicall
     * and is not necessarily accurate due to EIP-2929 causing gas costs to vary
     * depending on if the slot has already been loaded in the call.
     */
    gasEstimate: BigNumber | null;
};
export declare class BlockConflictError extends Error {
    name: string;
}
export declare class SuccessRateError extends Error {
    name: string;
}
export declare class ProviderBlockHeaderError extends Error {
    name: string;
}
export declare class ProviderTimeoutError extends Error {
    name: string;
}
/**
 * This error typically means that the gas used by the multicall has
 * exceeded the total call gas limit set by the node provider.
 *
 * This can be resolved by modifying BatchParams to request fewer
 * quotes per call, or to set a lower gas limit per quote.
 *
 * @export
 * @class ProviderGasError
 */
export declare class ProviderGasError extends Error {
    name: string;
}
export type QuoteRetryOptions = RetryOptions;
/**
 * The V3 route and a list of quotes for that route.
 */
export type RouteWithQuotes<TRoute extends V3Route | V2Route | MixedRoute> = [
    TRoute,
    AmountQuote[]
];
/**
 * Provider for getting on chain quotes using routes containing V3 pools or V2 pools.
 *
 * @export
 * @interface IOnChainQuoteProvider
 */
export interface IOnChainQuoteProvider {
    /**
     * For every route, gets an exactIn quotes for every amount provided.
     * @notice While passing in exactIn V2Routes is supported, we recommend using the V2QuoteProvider to compute off chain quotes for V2 whenever possible
     *
     * @param amountIns The amounts to get quotes for.
     * @param routes The routes to get quotes for.
     * @param [providerConfig] The provider config.
     * @returns For each route returns a RouteWithQuotes object that contains all the quotes.
     * @returns The blockNumber used when generating the quotes.
     */
    getQuotesManyExactIn<TRoute extends V3Route | V2Route | MixedRoute>(amountIns: CurrencyAmount[], routes: TRoute[], providerConfig?: ProviderConfig): Promise<{
        routesWithQuotes: RouteWithQuotes<TRoute>[];
        blockNumber: BigNumber;
    }>;
    /**
     * For every route, gets ane exactOut quote for every amount provided.
     * @notice This does not support quotes for MixedRoutes (routes with both V3 and V2 pools/pairs) or pure V2 routes
     *
     * @param amountOuts The amounts to get quotes for.
     * @param routes The routes to get quotes for.
     * @param [providerConfig] The provider config.
     * @returns For each route returns a RouteWithQuotes object that contains all the quotes.
     * @returns The blockNumber used when generating the quotes.
     */
    getQuotesManyExactOut<TRoute extends V3Route>(amountOuts: CurrencyAmount[], routes: TRoute[], providerConfig?: ProviderConfig): Promise<{
        routesWithQuotes: RouteWithQuotes<TRoute>[];
        blockNumber: BigNumber;
    }>;
}
/**
 * The parameters for the multicalls we make.
 *
 * It is important to ensure that (gasLimitPerCall * multicallChunk) < providers gas limit per call.
 *
 * On chain quotes can consume a lot of gas (if the swap is so large that it swaps through a large
 * number of ticks), so there is a risk of exceeded gas limits in these multicalls.
 */
export type BatchParams = {
    /**
     * The number of quotes to fetch in each multicall.
     */
    multicallChunk: number;
    /**
     * The maximum call to consume for each quote in the multicall.
     */
    gasLimitPerCall: number;
    /**
     * The minimum success rate for all quotes across all multicalls.
     * If we set our gasLimitPerCall too low it could result in a large number of
     * quotes failing due to out of gas. This parameters will fail the overall request
     * in this case.
     */
    quoteMinSuccessRate: number;
};
/**
 * The fallback values for gasLimit and multicallChunk if any failures occur.
 *
 */
export type FailureOverrides = {
    multicallChunk: number;
    gasLimitOverride: number;
};
export type BlockHeaderFailureOverridesDisabled = {
    enabled: false;
};
export type BlockHeaderFailureOverridesEnabled = {
    enabled: true;
    rollbackBlockOffset: number;
    attemptsBeforeRollback: number;
};
export type BlockHeaderFailureOverrides = BlockHeaderFailureOverridesDisabled | BlockHeaderFailureOverridesEnabled;
/**
 * Config around what block number to query and how to handle failures due to block header errors.
 */
export type BlockNumberConfig = {
    baseBlockOffset: number;
    rollback: BlockHeaderFailureOverrides;
};
/**
 * Computes on chain quotes for swaps. For pure V3 routes, quotes are computed on-chain using
 * the 'QuoterV2' smart contract. For exactIn mixed and V2 routes, quotes are computed using the 'MixedRouteQuoterV1' contract
 * This is because computing quotes off-chain would require fetching all the tick data for each pool, which is a lot of data.
 *
 * To minimize the number of requests for quotes we use a Multicall contract. Generally
 * the number of quotes to fetch exceeds the maximum we can fit in a single multicall
 * while staying under gas limits, so we also batch these quotes across multiple multicalls.
 *
 * The biggest challenge with the quote provider is dealing with various gas limits.
 * Each provider sets a limit on the amount of gas a call can consume (on Infura this
 * is approximately 10x the block max size), so we must ensure each multicall does not
 * exceed this limit. Additionally, each quote on V3 can consume a large number of gas if
 * the pool lacks liquidity and the swap would cause all the ticks to be traversed.
 *
 * To ensure we don't exceed the node's call limit, we limit the gas used by each quote to
 * a specific value, and we limit the number of quotes in each multicall request. Users of this
 * class should set BatchParams such that multicallChunk * gasLimitPerCall is less than their node
 * providers total gas limit per call.
 *
 * @export
 * @class OnChainQuoteProvider
 */
export declare class OnChainQuoteProvider implements IOnChainQuoteProvider {
    protected chainId: ChainId;
    protected provider: BaseProvider;
    protected multicall2Provider: UniswapMulticallProvider;
    protected retryOptions: QuoteRetryOptions;
    protected batchParams: BatchParams;
    protected gasErrorFailureOverride: FailureOverrides;
    protected successRateFailureOverrides: FailureOverrides;
    protected blockNumberConfig: BlockNumberConfig;
    protected quoterAddressOverride?: string | undefined;
    /**
     * Creates an instance of OnChainQuoteProvider.
     *
     * @param chainId The chain to get quotes for.
     * @param provider The web 3 provider.
     * @param multicall2Provider The multicall provider to use to get the quotes on-chain.
     * Only supports the Uniswap Multicall contract as it needs the gas limitting functionality.
     * @param retryOptions The retry options for each call to the multicall.
     * @param batchParams The parameters for each batched call to the multicall.
     * @param gasErrorFailureOverride The gas and chunk parameters to use when retrying a batch that failed due to out of gas.
     * @param successRateFailureOverrides The parameters for retries when we fail to get quotes.
     * @param blockNumberConfig Parameters for adjusting which block we get quotes from, and how to handle block header not found errors.
     * @param [quoterAddressOverride] Overrides the address of the quoter contract to use.
     */
    constructor(chainId: ChainId, provider: BaseProvider, multicall2Provider: UniswapMulticallProvider, retryOptions?: QuoteRetryOptions, batchParams?: BatchParams, gasErrorFailureOverride?: FailureOverrides, successRateFailureOverrides?: FailureOverrides, blockNumberConfig?: BlockNumberConfig, quoterAddressOverride?: string | undefined);
    private getQuoterAddress;
    getQuotesManyExactIn<TRoute extends V3Route | V2Route | MixedRoute>(amountIns: CurrencyAmount[], routes: TRoute[], providerConfig?: ProviderConfig): Promise<{
        routesWithQuotes: RouteWithQuotes<TRoute>[];
        blockNumber: BigNumber;
    }>;
    getQuotesManyExactOut<TRoute extends V3Route>(amountOuts: CurrencyAmount[], routes: TRoute[], providerConfig?: ProviderConfig): Promise<{
        routesWithQuotes: RouteWithQuotes<TRoute>[];
        blockNumber: BigNumber;
    }>;
    private getQuotesManyData;
    private partitionQuotes;
    private processQuoteResults;
    private validateBlockNumbers;
    protected validateSuccessRate(allResults: Result<[BigNumber, BigNumber[], number[], BigNumber]>[], haveRetriedForSuccessRate: boolean): void | SuccessRateError;
    /**
     * Throw an error for incorrect routes / function combinations
     * @param routes Any combination of V3, V2, and Mixed routes.
     * @param functionName
     * @param useMixedRouteQuoter true if there are ANY V2Routes or MixedRoutes in the routes parameter
     */
    protected validateRoutes(routes: (V3Route | V2Route | MixedRoute)[], functionName: string, useMixedRouteQuoter: boolean): void;
}
