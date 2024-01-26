import { ChainId, Currency, TradeType } from '@uniswap/sdk-core';
import { IOnChainQuoteProvider } from '../../providers';
import { IMulticallProvider } from '../../providers/multicall-provider';
import { ITokenProvider } from '../../providers/token-provider';
import { IV3PoolProvider } from '../../providers/v3/pool-provider';
import { CurrencyAmount } from '../../util/amounts';
import { SwapOptionsSwapRouter02, SwapRoute } from '../router';
export type LegacyRouterParams = {
    chainId: ChainId;
    multicall2Provider: IMulticallProvider;
    poolProvider: IV3PoolProvider;
    quoteProvider: IOnChainQuoteProvider;
    tokenProvider: ITokenProvider;
};
export type LegacyRoutingConfig = {
    blockNumber?: number;
};
/**
 * Replicates the router implemented in the V3 interface.
 * Code is mostly a copy from https://github.com/Uniswap/uniswap-interface/blob/0190b5a408c13016c87e1030ffc59326c085f389/src/hooks/useBestV3Trade.ts#L22-L23
 * with React/Redux hooks removed, and refactoring to allow re-use in other routers.
 */
export declare class LegacyRouter {
    protected chainId: ChainId;
    protected multicall2Provider: IMulticallProvider;
    protected poolProvider: IV3PoolProvider;
    protected quoteProvider: IOnChainQuoteProvider;
    protected tokenProvider: ITokenProvider;
    constructor({ chainId, multicall2Provider, poolProvider, quoteProvider, tokenProvider, }: LegacyRouterParams);
    route(amount: CurrencyAmount, quoteCurrency: Currency, swapType: TradeType, swapConfig?: SwapOptionsSwapRouter02, partialRoutingConfig?: Partial<LegacyRoutingConfig>): Promise<SwapRoute | null>;
    routeExactIn(currencyIn: Currency, currencyOut: Currency, amountIn: CurrencyAmount, swapConfig?: SwapOptionsSwapRouter02, routingConfig?: LegacyRoutingConfig): Promise<SwapRoute | null>;
    routeExactOut(currencyIn: Currency, currencyOut: Currency, amountOut: CurrencyAmount, swapConfig?: SwapOptionsSwapRouter02, routingConfig?: LegacyRoutingConfig): Promise<SwapRoute | null>;
    private findBestRouteExactIn;
    private findBestRouteExactOut;
    private getBestQuote;
    private getAllRoutes;
    private getAllPossiblePairings;
    private computeAllRoutes;
    private buildTrade;
    private buildMethodParameters;
}
