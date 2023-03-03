import { BigNumber } from '@ethersproject/bignumber';
import { Currency, Token, TradeType } from '@uniswap/sdk-core';
import { Pair } from '@uniswap/v2-sdk';
import { Pool } from '@uniswap/v3-sdk';
import _ from 'lodash';

import { ITokenListProvider, ITokenProvider, ITokenValidatorProvider, TokenValidationResult } from '../../../providers';
import { ChainId, CurrencyAmount, log, poolToString } from '../../../util';
import { MixedRoute, V2Route, V3Route } from '../../router';
import { AlphaRouterConfig } from '../alpha-router';
import { RouteWithValidQuote } from '../entities/route-with-valid-quote';
import { CandidatePoolsBySelectionCriteria } from '../functions/get-candidate-pools';
import { IGasModel } from '../gas-models';

import { GetQuotesResult } from './model/results/get-quotes-result';
import { GetRoutesResult } from './model/results/get-routes-result';

export abstract class IQuoter<Route extends V2Route | V3Route | MixedRoute> {
  protected tokenProvider: ITokenProvider;
  protected chainId: ChainId;
  protected blockedTokenListProvider?: ITokenListProvider;
  protected tokenValidatorProvider?: ITokenValidatorProvider;

  constructor(
    tokenProvider: ITokenProvider,
    chainId: ChainId,
    blockedTokenListProvider?: ITokenListProvider,
    tokenValidatorProvider?: ITokenValidatorProvider
  ) {
    this.tokenProvider = tokenProvider;
    this.chainId = chainId;
    this.blockedTokenListProvider = blockedTokenListProvider;
    this.tokenValidatorProvider = tokenValidatorProvider;
  }

  protected abstract getRoutes(
    tokenIn: Token,
    tokenOut: Token,
    tradeType: TradeType,
    routingConfig: AlphaRouterConfig
  ): Promise<GetRoutesResult<Route>>

  abstract getQuotes(
    routes: Route[],
    amounts: CurrencyAmount[],
    percents: number[],
    quoteToken: Token,
    tradeType: TradeType,
    routingConfig: AlphaRouterConfig,
    candidatePools: CandidatePoolsBySelectionCriteria,
    gasModel?: IGasModel<RouteWithValidQuote>,
    gasPriceWei?: BigNumber
  ): Promise<GetQuotesResult>

  public getRoutesThenQuotes(
    tokenIn: Token,
    tokenOut: Token,
    amounts: CurrencyAmount[],
    percents: number[],
    quoteToken: Token,
    tradeType: TradeType,
    routingConfig: AlphaRouterConfig,
    gasModel?: IGasModel<RouteWithValidQuote>,
    gasPriceWei?: BigNumber
  ): Promise<GetQuotesResult> {
    return this.getRoutes(tokenIn, tokenOut, tradeType, routingConfig)
      .then((routesResult) =>
        this.getQuotes(
          routesResult.routes,
          amounts,
          percents,
          quoteToken,
          tradeType,
          routingConfig,
          routesResult.candidatePools,
          gasModel,
          gasPriceWei
        )
      );
  }

  protected async applyTokenValidatorToPools<T extends Pool | Pair>(
    pools: T[],
    isInvalidFn: (
      token: Currency,
      tokenValidation: TokenValidationResult | undefined
    ) => boolean
  ): Promise<T[]> {
    if (!this.tokenValidatorProvider) {
      return pools;
    }

    log.info(`Running token validator on ${pools.length} pools`);

    const tokens = _.flatMap(pools, (pool) => [pool.token0, pool.token1]);

    const tokenValidationResults = await this.tokenValidatorProvider.validateTokens(tokens);

    const poolsFiltered = _.filter(pools, (pool: T) => {
      const token0Validation = tokenValidationResults.getValidationByToken(
        pool.token0
      );
      const token1Validation = tokenValidationResults.getValidationByToken(
        pool.token1
      );

      const token0Invalid = isInvalidFn(pool.token0, token0Validation);
      const token1Invalid = isInvalidFn(pool.token1, token1Validation);

      if (token0Invalid || token1Invalid) {
        log.info(
          `Dropping pool ${poolToString(pool)} because token is invalid. ${pool.token0.symbol
          }: ${token0Validation}, ${pool.token1.symbol}: ${token1Validation}`
        );
      }

      return !token0Invalid && !token1Invalid;
    });

    return poolsFiltered;
  }
}