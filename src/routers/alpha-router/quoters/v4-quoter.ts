import { BigNumber } from '@ethersproject/bignumber';
import { Protocol } from '@uniswap/router-sdk';
import { ChainId, Currency, Token, TradeType } from '@uniswap/sdk-core';
import {
  IOnChainQuoteProvider,
  ITokenListProvider,
  ITokenProvider,
  ITokenValidatorProvider,
  IV4PoolProvider,
  IV4SubgraphProvider,
  TokenValidationResult,
} from '../../../providers';
import { CurrencyAmount, metric, MetricLoggerUnit } from '../../../util';
import { V4Route } from '../../router';
import { AlphaRouterConfig } from '../alpha-router';
import { RouteWithValidQuote } from '../entities';
import { computeAllV4Routes } from '../functions/compute-all-routes';
import {
  CandidatePoolsBySelectionCriteria,
  V4CandidatePools,
} from '../functions/get-candidate-pools';
import { IGasModel } from '../gas-models';
import { BaseQuoter } from './base-quoter';
import { GetQuotesResult, GetRoutesResult } from './model';

export class V4Quoter extends BaseQuoter<V4CandidatePools, V4Route, Currency> {
  protected v4SubgraphProvider: IV4SubgraphProvider;
  protected v4PoolProvider: IV4PoolProvider;
  protected onChainQuoteProvider: IOnChainQuoteProvider;

  constructor(
    v4SubgraphProvider: IV4SubgraphProvider,
    v4PoolProvider: IV4PoolProvider,
    onChainQuoteProvider: IOnChainQuoteProvider,
    tokenProvider: ITokenProvider,
    chainId: ChainId,
    blockedTokenListProvider?: ITokenListProvider,
    tokenValidatorProvider?: ITokenValidatorProvider
  ) {
    super(
      tokenProvider,
      chainId,
      Protocol.V4,
      blockedTokenListProvider,
      tokenValidatorProvider
    );
    this.v4SubgraphProvider = v4SubgraphProvider;
    this.v4PoolProvider = v4PoolProvider;
    this.onChainQuoteProvider = onChainQuoteProvider;
  }

  protected async getRoutes(
    tokenIn: Currency,
    tokenOut: Currency,
    v4CandidatePools: V4CandidatePools,
    _tradeType: TradeType,
    routingConfig: AlphaRouterConfig
  ): Promise<GetRoutesResult<V4Route>> {
    const beforeGetRoutes = Date.now();
    // Fetch all the pools that we will consider routing via. There are thousands
    // of pools, so we filter them to a set of candidate pools that we expect will
    // result in good prices.
    const { poolAccessor, candidatePools } = v4CandidatePools;
    const poolsRaw = poolAccessor.getAllPools();

    // Drop any pools that contain fee on transfer tokens (not supported by v3) or have issues with being transferred.
    const pools = await this.applyTokenValidatorToPools(
      poolsRaw,
      (
        token: Currency,
        tokenValidation: TokenValidationResult | undefined
      ): boolean => {
        // If there is no available validation result we assume the token is fine.
        if (!tokenValidation) {
          return false;
        }

        // Only filters out *intermediate* pools that involve tokens that we detect
        // cant be transferred. This prevents us trying to route through tokens that may
        // not be transferrable, but allows users to still swap those tokens if they
        // specify.
        //
        if (
          tokenValidation == TokenValidationResult.STF &&
          (token.equals(tokenIn) || token.equals(tokenOut))
        ) {
          return false;
        }

        return (
          tokenValidation == TokenValidationResult.FOT ||
          tokenValidation == TokenValidationResult.STF
        );
      }
    );

    // Given all our candidate pools, compute all the possible ways to route from tokenIn to tokenOut.
    const { maxSwapsPerPath } = routingConfig;
    const routes = computeAllV4Routes(
      tokenIn,
      tokenOut,
      pools,
      maxSwapsPerPath
    );

    metric.putMetric(
      'V4GetRoutesLoad',
      Date.now() - beforeGetRoutes,
      MetricLoggerUnit.Milliseconds
    );

    return {
      routes,
      candidatePools,
    };
  }

  getQuotes(
    _routes: V4Route[],
    _amounts: CurrencyAmount[],
    _percents: number[],
    _quoteToken: Token,
    _tradeType: TradeType,
    _routingConfig: AlphaRouterConfig,
    _candidatePools: CandidatePoolsBySelectionCriteria | undefined,
    _gasModel: IGasModel<RouteWithValidQuote> | undefined,
    _gasPriceWei: BigNumber | undefined
  ): Promise<GetQuotesResult> {
    throw new Error('Method not implemented.');
  }
}
