import { BigNumber } from '@ethersproject/bignumber';
import { ChainId, TradeType } from '@uniswap/sdk-core';
import { IPortionProvider } from '../../../providers/portion-provider';
import { CurrencyAmount } from '../../../util/amounts';
import { SwapOptions } from '../../router';
import { AlphaRouterConfig } from '../alpha-router';
import { IGasModel } from '../gas-models';
import { RouteWithValidQuote, V3RouteWithValidQuote } from './../entities/route-with-valid-quote';
export type BestSwapRoute = {
    quote: CurrencyAmount;
    quoteGasAdjusted: CurrencyAmount;
    estimatedGasUsed: BigNumber;
    estimatedGasUsedUSD: CurrencyAmount;
    estimatedGasUsedQuoteToken: CurrencyAmount;
    estimatedGasUsedGasToken?: CurrencyAmount;
    routes: RouteWithValidQuote[];
};
export declare function getBestSwapRoute(amount: CurrencyAmount, percents: number[], routesWithValidQuotes: RouteWithValidQuote[], routeType: TradeType, chainId: ChainId, routingConfig: AlphaRouterConfig, portionProvider: IPortionProvider, gasModel?: IGasModel<V3RouteWithValidQuote>, swapConfig?: SwapOptions): Promise<BestSwapRoute | null>;
export declare function getBestSwapRouteBy(routeType: TradeType, percentToQuotes: {
    [percent: number]: RouteWithValidQuote[];
}, percents: number[], chainId: ChainId, by: (routeQuote: RouteWithValidQuote) => CurrencyAmount, routingConfig: AlphaRouterConfig, portionProvider: IPortionProvider, gasModel?: IGasModel<V3RouteWithValidQuote>, swapConfig?: SwapOptions): Promise<BestSwapRoute | undefined>;
