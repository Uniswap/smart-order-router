import { ChainId, Token, TradeType } from '@uniswap/sdk-core';
import { IOnChainQuoteProvider, ITokenListProvider, ITokenProvider, ITokenValidatorProvider, IV2PoolProvider, IV2SubgraphProvider, IV3PoolProvider, IV3SubgraphProvider } from '../../../providers';
import { CurrencyAmount } from '../../../util';
import { MixedRoute } from '../../router';
import { AlphaRouterConfig } from '../alpha-router';
import { MixedRouteWithValidQuote } from '../entities';
import { CandidatePoolsBySelectionCriteria, V2CandidatePools, V3CandidatePools } from '../functions/get-candidate-pools';
import { IGasModel } from '../gas-models';
import { BaseQuoter } from './base-quoter';
import { GetQuotesResult, GetRoutesResult } from './model';
export declare class MixedQuoter extends BaseQuoter<[
    V3CandidatePools,
    V2CandidatePools
], MixedRoute> {
    protected v3SubgraphProvider: IV3SubgraphProvider;
    protected v3PoolProvider: IV3PoolProvider;
    protected v2SubgraphProvider: IV2SubgraphProvider;
    protected v2PoolProvider: IV2PoolProvider;
    protected onChainQuoteProvider: IOnChainQuoteProvider;
    constructor(v3SubgraphProvider: IV3SubgraphProvider, v3PoolProvider: IV3PoolProvider, v2SubgraphProvider: IV2SubgraphProvider, v2PoolProvider: IV2PoolProvider, onChainQuoteProvider: IOnChainQuoteProvider, tokenProvider: ITokenProvider, chainId: ChainId, blockedTokenListProvider?: ITokenListProvider, tokenValidatorProvider?: ITokenValidatorProvider);
    protected getRoutes(tokenIn: Token, tokenOut: Token, v3v2candidatePools: [V3CandidatePools, V2CandidatePools], tradeType: TradeType, routingConfig: AlphaRouterConfig): Promise<GetRoutesResult<MixedRoute>>;
    getQuotes(routes: MixedRoute[], amounts: CurrencyAmount[], percents: number[], quoteToken: Token, tradeType: TradeType, routingConfig: AlphaRouterConfig, candidatePools?: CandidatePoolsBySelectionCriteria, gasModel?: IGasModel<MixedRouteWithValidQuote>): Promise<GetQuotesResult>;
}
