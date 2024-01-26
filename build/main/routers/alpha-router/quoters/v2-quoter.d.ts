import { BigNumber } from '@ethersproject/bignumber';
import { ChainId, Token, TradeType } from '@uniswap/sdk-core';
import { ITokenListProvider, ITokenProvider, ITokenValidatorProvider, IV2PoolProvider, IV2QuoteProvider, IV2SubgraphProvider } from '../../../providers';
import { CurrencyAmount } from '../../../util';
import { V2Route } from '../../router';
import { AlphaRouterConfig } from '../alpha-router';
import { V2RouteWithValidQuote } from '../entities';
import { CandidatePoolsBySelectionCriteria, V2CandidatePools } from '../functions/get-candidate-pools';
import { IGasModel, IV2GasModelFactory } from '../gas-models';
import { BaseQuoter } from './base-quoter';
import { GetQuotesResult } from './model/results/get-quotes-result';
import { GetRoutesResult } from './model/results/get-routes-result';
export declare class V2Quoter extends BaseQuoter<V2CandidatePools, V2Route> {
    protected v2SubgraphProvider: IV2SubgraphProvider;
    protected v2PoolProvider: IV2PoolProvider;
    protected v2QuoteProvider: IV2QuoteProvider;
    protected v2GasModelFactory: IV2GasModelFactory;
    constructor(v2SubgraphProvider: IV2SubgraphProvider, v2PoolProvider: IV2PoolProvider, v2QuoteProvider: IV2QuoteProvider, v2GasModelFactory: IV2GasModelFactory, tokenProvider: ITokenProvider, chainId: ChainId, blockedTokenListProvider?: ITokenListProvider, tokenValidatorProvider?: ITokenValidatorProvider);
    protected getRoutes(tokenIn: Token, tokenOut: Token, v2CandidatePools: V2CandidatePools, _tradeType: TradeType, routingConfig: AlphaRouterConfig): Promise<GetRoutesResult<V2Route>>;
    getQuotes(routes: V2Route[], amounts: CurrencyAmount[], percents: number[], quoteToken: Token, tradeType: TradeType, _routingConfig: AlphaRouterConfig, candidatePools?: CandidatePoolsBySelectionCriteria, _gasModel?: IGasModel<V2RouteWithValidQuote>, gasPriceWei?: BigNumber): Promise<GetQuotesResult>;
    refreshRoutesThenGetQuotes(tokenIn: Token, tokenOut: Token, routes: V2Route[], amounts: CurrencyAmount[], percents: number[], quoteToken: Token, tradeType: TradeType, routingConfig: AlphaRouterConfig, gasPriceWei?: BigNumber): Promise<GetQuotesResult>;
}
