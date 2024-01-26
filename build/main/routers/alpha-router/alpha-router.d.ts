import { BaseProvider } from '@ethersproject/providers';
import { Protocol } from '@uniswap/router-sdk';
import { ChainId, Currency, TradeType } from '@uniswap/sdk-core';
import { Position } from '@uniswap/v3-sdk';
import { CacheMode, IOnChainQuoteProvider, IRouteCachingProvider, ISwapRouterProvider, ITokenPropertiesProvider, IV2QuoteProvider, IV2SubgraphProvider, Simulator, UniswapMulticallProvider } from '../../providers';
import { ITokenListProvider } from '../../providers/caching-token-list-provider';
import { IGasPriceProvider } from '../../providers/gas-price-provider';
import { IPortionProvider } from '../../providers/portion-provider';
import { ITokenProvider } from '../../providers/token-provider';
import { ITokenValidatorProvider } from '../../providers/token-validator-provider';
import { IV2PoolProvider } from '../../providers/v2/pool-provider';
import { ArbitrumGasData, IL2GasDataProvider, OptimismGasData } from '../../providers/v3/gas-data-provider';
import { IV3PoolProvider } from '../../providers/v3/pool-provider';
import { IV3SubgraphProvider } from '../../providers/v3/subgraph-provider';
import { CurrencyAmount } from '../../util/amounts';
import { IRouter, ISwapToRatio, SwapAndAddConfig, SwapAndAddOptions, SwapOptions, SwapRoute, SwapToRatioResponse } from '../router';
import { IOnChainGasModelFactory, IV2GasModelFactory } from './gas-models/gas-model';
import { MixedQuoter, V2Quoter, V3Quoter } from './quoters';
export type AlphaRouterParams = {
    /**
     * The chain id for this instance of the Alpha Router.
     */
    chainId: ChainId;
    /**
     * The Web3 provider for getting on-chain data.
     */
    provider: BaseProvider;
    /**
     * The provider to use for making multicalls. Used for getting on-chain data
     * like pools, tokens, quotes in batch.
     */
    multicall2Provider?: UniswapMulticallProvider;
    /**
     * The provider for getting all pools that exist on V3 from the Subgraph. The pools
     * from this provider are filtered during the algorithm to a set of candidate pools.
     */
    v3SubgraphProvider?: IV3SubgraphProvider;
    /**
     * The provider for getting data about V3 pools.
     */
    v3PoolProvider?: IV3PoolProvider;
    /**
     * The provider for getting V3 quotes.
     */
    onChainQuoteProvider?: IOnChainQuoteProvider;
    /**
     * The provider for getting all pools that exist on V2 from the Subgraph. The pools
     * from this provider are filtered during the algorithm to a set of candidate pools.
     */
    v2SubgraphProvider?: IV2SubgraphProvider;
    /**
     * The provider for getting data about V2 pools.
     */
    v2PoolProvider?: IV2PoolProvider;
    /**
     * The provider for getting V3 quotes.
     */
    v2QuoteProvider?: IV2QuoteProvider;
    /**
     * The provider for getting data about Tokens.
     */
    tokenProvider?: ITokenProvider;
    /**
     * The provider for getting the current gas price to use when account for gas in the
     * algorithm.
     */
    gasPriceProvider?: IGasPriceProvider;
    /**
     * A factory for generating a gas model that is used when estimating the gas used by
     * V3 routes.
     */
    v3GasModelFactory?: IOnChainGasModelFactory;
    /**
     * A factory for generating a gas model that is used when estimating the gas used by
     * V2 routes.
     */
    v2GasModelFactory?: IV2GasModelFactory;
    /**
     * A factory for generating a gas model that is used when estimating the gas used by
     * V3 routes.
     */
    mixedRouteGasModelFactory?: IOnChainGasModelFactory;
    /**
     * A token list that specifies Token that should be blocked from routing through.
     * Defaults to Uniswap's unsupported token list.
     */
    blockedTokenListProvider?: ITokenListProvider;
    /**
     * Calls lens function on SwapRouter02 to determine ERC20 approval types for
     * LP position tokens.
     */
    swapRouterProvider?: ISwapRouterProvider;
    /**
     * Calls the optimism gas oracle contract to fetch constants for calculating the l1 security fee.
     */
    optimismGasDataProvider?: IL2GasDataProvider<OptimismGasData>;
    /**
     * A token validator for detecting fee-on-transfer tokens or tokens that can't be transferred.
     */
    tokenValidatorProvider?: ITokenValidatorProvider;
    /**
     * Calls the arbitrum gas data contract to fetch constants for calculating the l1 fee.
     */
    arbitrumGasDataProvider?: IL2GasDataProvider<ArbitrumGasData>;
    /**
     * Simulates swaps and returns new SwapRoute with updated gas estimates.
     */
    simulator?: Simulator;
    /**
     * A provider for caching the best route given an amount, quoteToken, tradeType
     */
    routeCachingProvider?: IRouteCachingProvider;
    /**
     * A provider for getting token properties for special tokens like fee-on-transfer tokens.
     */
    tokenPropertiesProvider?: ITokenPropertiesProvider;
    /**
     * A provider for computing the portion-related data for routes and quotes.
     */
    portionProvider?: IPortionProvider;
};
export declare class MapWithLowerCaseKey<V> extends Map<string, V> {
    set(key: string, value: V): this;
}
export declare class LowerCaseStringArray extends Array<string> {
    constructor(...items: string[]);
}
/**
 * Determines the pools that the algorithm will consider when finding the optimal swap.
 *
 * All pools on each protocol are filtered based on the heuristics specified here to generate
 * the set of candidate pools. The Top N pools are taken by Total Value Locked (TVL).
 *
 * Higher values here result in more pools to explore which results in higher latency.
 */
export type ProtocolPoolSelection = {
    /**
     * The top N pools by TVL out of all pools on the protocol.
     */
    topN: number;
    /**
     * The top N pools by TVL of pools that consist of tokenIn and tokenOut.
     */
    topNDirectSwaps: number;
    /**
     * The top N pools by TVL of pools where one token is tokenIn and the
     * top N pools by TVL of pools where one token is tokenOut tokenOut.
     */
    topNTokenInOut: number;
    /**
     * Given the topNTokenInOut pools, gets the top N pools that involve the other token.
     * E.g. for a WETH -> USDC swap, if topNTokenInOut found WETH -> DAI and WETH -> USDT,
     * a value of 2 would find the top 2 pools that involve DAI and top 2 pools that involve USDT.
     */
    topNSecondHop: number;
    /**
     * Given the topNTokenInOut pools and a token address,
     * gets the top N pools that involve the other token.
     * If token address is not on the list, we default to topNSecondHop.
     * E.g. for a WETH -> USDC swap, if topNTokenInOut found WETH -> DAI and WETH -> USDT,
     * and there's a mapping USDT => 4, but no mapping for DAI
     * it would find the top 4 pools that involve USDT, and find the topNSecondHop pools that involve DAI
     */
    topNSecondHopForTokenAddress?: MapWithLowerCaseKey<number>;
    /**
     * List of token addresses to avoid using as a second hop.
     * There might be multiple reasons why we would like to avoid a specific token,
     *   but the specific reason that we are trying to solve is when the pool is not synced properly
     *   e.g. when the pool has a rebasing token that isn't syncing the pool on every rebase.
     */
    tokensToAvoidOnSecondHops?: LowerCaseStringArray;
    /**
     * The top N pools for token in and token out that involve a token from a list of
     * hardcoded 'base tokens'. These are standard tokens such as WETH, USDC, DAI, etc.
     * This is similar to how the legacy routing algorithm used by Uniswap would select
     * pools and is intended to make the new pool selection algorithm close to a superset
     * of the old algorithm.
     */
    topNWithEachBaseToken: number;
    /**
     * Given the topNWithEachBaseToken pools, takes the top N pools from the full list.
     * E.g. for a WETH -> USDC swap, if topNWithEachBaseToken found WETH -0.05-> DAI,
     * WETH -0.01-> DAI, WETH -0.05-> USDC, WETH -0.3-> USDC, a value of 2 would reduce
     * this set to the top 2 pools from that full list.
     */
    topNWithBaseToken: number;
};
export type AlphaRouterConfig = {
    /**
     * The block number to use for all on-chain data. If not provided, the router will
     * use the latest block returned by the provider.
     */
    blockNumber?: number | Promise<number>;
    /**
     * The protocols to consider when finding the optimal swap. If not provided all protocols
     * will be used.
     */
    protocols?: Protocol[];
    /**
     * Config for selecting which pools to consider routing via on V2.
     */
    v2PoolSelection: ProtocolPoolSelection;
    /**
     * Config for selecting which pools to consider routing via on V3.
     */
    v3PoolSelection: ProtocolPoolSelection;
    /**
     * For each route, the maximum number of hops to consider. More hops will increase latency of the algorithm.
     */
    maxSwapsPerPath: number;
    /**
     * The maximum number of splits in the returned route. A higher maximum will increase latency of the algorithm.
     */
    maxSplits: number;
    /**
     * The minimum number of splits in the returned route.
     * This parameters should always be set to 1. It is only included for testing purposes.
     */
    minSplits: number;
    /**
     * Forces the returned swap to route across all protocols.
     * This parameter should always be false. It is only included for testing purposes.
     */
    forceCrossProtocol: boolean;
    /**
     * Force the alpha router to choose a mixed route swap.
     * Default will be falsy. It is only included for testing purposes.
     */
    forceMixedRoutes?: boolean;
    /**
     * The minimum percentage of the input token to use for each route in a split route.
     * All routes will have a multiple of this value. For example is distribution percentage is 5,
     * a potential return swap would be:
     *
     * 5% of input => Route 1
     * 55% of input => Route 2
     * 40% of input => Route 3
     */
    distributionPercent: number;
    /**
     * Flag to indicate whether to use the cached routes or not.
     * By default, the cached routes will be used.
     */
    useCachedRoutes?: boolean;
    /**
     * Flag to indicate whether to write to the cached routes or not.
     * By default, the cached routes will be written to.
     */
    writeToCachedRoutes?: boolean;
    /**
     * Flag to indicate whether to use the CachedRoutes in optimistic mode.
     * Optimistic mode means that we will allow blocksToLive greater than 1.
     */
    optimisticCachedRoutes?: boolean;
    /**
     * Debug param that helps to see the short-term latencies improvements without impacting the main path.
     */
    debugRouting?: boolean;
    /**
     * Flag that allow us to override the cache mode.
     */
    overwriteCacheMode?: CacheMode;
    /**
     * Flag for token properties provider to enable fetching fee-on-transfer tokens.
     */
    enableFeeOnTransferFeeFetching?: boolean;
    /**
     * Tenderly natively support save simulation failures if failed,
     * we need this as a pass-through flag to enable/disable this feature.
     */
    saveTenderlySimulationIfFailed?: boolean;
    /**
     * Include an additional response field specifying the swap gas estimation in terms of a specific gas token.
     * This requires a suitable Native/GasToken pool to exist on V3. If one does not exist this field will return null.
     */
    gasToken?: string;
};
export declare class AlphaRouter implements IRouter<AlphaRouterConfig>, ISwapToRatio<AlphaRouterConfig, SwapAndAddConfig> {
    protected chainId: ChainId;
    protected provider: BaseProvider;
    protected multicall2Provider: UniswapMulticallProvider;
    protected v3SubgraphProvider: IV3SubgraphProvider;
    protected v3PoolProvider: IV3PoolProvider;
    protected onChainQuoteProvider: IOnChainQuoteProvider;
    protected v2SubgraphProvider: IV2SubgraphProvider;
    protected v2QuoteProvider: IV2QuoteProvider;
    protected v2PoolProvider: IV2PoolProvider;
    protected tokenProvider: ITokenProvider;
    protected gasPriceProvider: IGasPriceProvider;
    protected swapRouterProvider: ISwapRouterProvider;
    protected v3GasModelFactory: IOnChainGasModelFactory;
    protected v2GasModelFactory: IV2GasModelFactory;
    protected mixedRouteGasModelFactory: IOnChainGasModelFactory;
    protected tokenValidatorProvider?: ITokenValidatorProvider;
    protected blockedTokenListProvider?: ITokenListProvider;
    protected l2GasDataProvider?: IL2GasDataProvider<OptimismGasData> | IL2GasDataProvider<ArbitrumGasData>;
    protected simulator?: Simulator;
    protected v2Quoter: V2Quoter;
    protected v3Quoter: V3Quoter;
    protected mixedQuoter: MixedQuoter;
    protected routeCachingProvider?: IRouteCachingProvider;
    protected tokenPropertiesProvider: ITokenPropertiesProvider;
    protected portionProvider: IPortionProvider;
    constructor({ chainId, provider, multicall2Provider, v3PoolProvider, onChainQuoteProvider, v2PoolProvider, v2QuoteProvider, v2SubgraphProvider, tokenProvider, blockedTokenListProvider, v3SubgraphProvider, gasPriceProvider, v3GasModelFactory, v2GasModelFactory, mixedRouteGasModelFactory, swapRouterProvider, optimismGasDataProvider, tokenValidatorProvider, arbitrumGasDataProvider, simulator, routeCachingProvider, tokenPropertiesProvider, portionProvider, }: AlphaRouterParams);
    routeToRatio(token0Balance: CurrencyAmount, token1Balance: CurrencyAmount, position: Position, swapAndAddConfig: SwapAndAddConfig, swapAndAddOptions?: SwapAndAddOptions, routingConfig?: Partial<AlphaRouterConfig>): Promise<SwapToRatioResponse>;
    /**
     * @inheritdoc IRouter
     */
    route(amount: CurrencyAmount, quoteCurrency: Currency, tradeType: TradeType, swapConfig?: SwapOptions, partialRoutingConfig?: Partial<AlphaRouterConfig>): Promise<SwapRoute | null>;
    private getSwapRouteFromCache;
    private getSwapRouteFromChain;
    private tradeTypeStr;
    private tokenPairSymbolTradeTypeChainId;
    private determineCurrencyInOutFromTradeType;
    private getGasPriceWei;
    private getGasModels;
    private getAmountDistribution;
    private buildSwapAndAddMethodParameters;
    private emitPoolSelectionMetrics;
    private calculateOptimalRatio;
    userHasSufficientBalance(fromAddress: string, tradeType: TradeType, amount: CurrencyAmount, quote: CurrencyAmount): Promise<boolean>;
    private absoluteValue;
    private getBlockNumberPromise;
}
