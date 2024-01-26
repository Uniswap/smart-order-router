import { BigNumber } from '@ethersproject/bignumber';
import { Protocol } from '@uniswap/router-sdk';
import { ChainId, Currency, Token, TradeType } from '@uniswap/sdk-core';
import { Pair } from '@uniswap/v2-sdk';
import { Pool } from '@uniswap/v3-sdk';
import { ITokenListProvider, ITokenProvider, ITokenValidatorProvider, TokenValidationResult } from '../../../providers';
import { CurrencyAmount } from '../../../util';
import { MixedRoute, V2Route, V3Route } from '../../router';
import { AlphaRouterConfig } from '../alpha-router';
import { RouteWithValidQuote } from '../entities/route-with-valid-quote';
import { CandidatePoolsBySelectionCriteria, V2CandidatePools, V3CandidatePools } from '../functions/get-candidate-pools';
import { IGasModel } from '../gas-models';
import { GetQuotesResult, GetRoutesResult } from './model/results';
/**
 * Interface for a Quoter.
 * Defines the base dependencies, helper methods and interface for how to fetch quotes.
 *
 * @abstract
 * @template CandidatePools
 * @template Route
 */
export declare abstract class BaseQuoter<CandidatePools extends V2CandidatePools | V3CandidatePools | [V3CandidatePools, V2CandidatePools], Route extends V2Route | V3Route | MixedRoute> {
    protected tokenProvider: ITokenProvider;
    protected chainId: ChainId;
    protected protocol: Protocol;
    protected blockedTokenListProvider?: ITokenListProvider;
    protected tokenValidatorProvider?: ITokenValidatorProvider;
    constructor(tokenProvider: ITokenProvider, chainId: ChainId, protocol: Protocol, blockedTokenListProvider?: ITokenListProvider, tokenValidatorProvider?: ITokenValidatorProvider);
    /**
     * Protected method in charge of fetching the routes for the tokenIn/tokenOut pair.
     *
     * @protected
     * @abstract
     * @param tokenIn The token that the user wants to provide
     * @param tokenOut The token that the usaw wants to receive
     * @param candidatePools the candidate pools that are used to generate the routes
     * @param tradeType The type of quote the user wants. He could want to provide exactly X tokenIn or receive exactly X tokenOut
     * @param routingConfig
     * @returns Promise<GetRoutesResult<Route>>
     */
    protected abstract getRoutes(tokenIn: Token, tokenOut: Token, candidatePools: CandidatePools, tradeType: TradeType, routingConfig: AlphaRouterConfig): Promise<GetRoutesResult<Route>>;
    /**
     * Public method that will fetch quotes for the combination of every route and every amount.
     *
     * @param routes the list of route that can be used to fetch a quote.
     * @param amounts the list of amounts to query for EACH route.
     * @param percents the percentage of each amount.
     * @param quoteToken
     * @param tradeType
     * @param routingConfig
     * @param candidatePools the candidate pools that were used to generate the routes
     * @param gasModel the gasModel to be used for estimating gas cost
     * @param gasPriceWei instead of passing gasModel, gasPriceWei is used to generate a gasModel
     * @returns Promise<GetQuotesResult<Route>>
     */
    abstract getQuotes(routes: Route[], amounts: CurrencyAmount[], percents: number[], quoteToken: Token, tradeType: TradeType, routingConfig: AlphaRouterConfig, candidatePools?: CandidatePoolsBySelectionCriteria, gasModel?: IGasModel<RouteWithValidQuote>, gasPriceWei?: BigNumber): Promise<GetQuotesResult>;
    /**
     * Public method which would first get the routes and then get the quotes.
     *
     * @param tokenIn The token that the user wants to provide
     * @param tokenOut The token that the usaw wants to receive
     * @param amounts the list of amounts to query for EACH route.
     * @param percents the percentage of each amount.
     * @param quoteToken
     * @param candidatePools
     * @param tradeType
     * @param routingConfig
     * @param gasModel the gasModel to be used for estimating gas cost
     * @param gasPriceWei instead of passing gasModel, gasPriceWei is used to generate a gasModel
     */
    getRoutesThenQuotes(tokenIn: Token, tokenOut: Token, amount: CurrencyAmount, amounts: CurrencyAmount[], percents: number[], quoteToken: Token, candidatePools: CandidatePools, tradeType: TradeType, routingConfig: AlphaRouterConfig, gasModel?: IGasModel<RouteWithValidQuote>, gasPriceWei?: BigNumber): Promise<GetQuotesResult>;
    protected applyTokenValidatorToPools<T extends Pool | Pair>(pools: T[], isInvalidFn: (token: Currency, tokenValidation: TokenValidationResult | undefined) => boolean): Promise<T[]>;
}
