import { Protocol } from '@uniswap/router-sdk';
import { ChainId, Currency, TradeType } from '@uniswap/sdk-core';
import _ from 'lodash';

import {
  IOnChainQuoteProvider,
  ITokenListProvider,
  ITokenProvider,
  ITokenValidatorProvider,
  IV4PoolProvider,
  IV4SubgraphProvider,
  TokenValidationResult,
} from '../../../providers';
import {
  CurrencyAmount,
  log,
  metric,
  MetricLoggerUnit,
  routeToString,
} from '../../../util';
import { V4Route } from '../../router';
import { AlphaRouterConfig } from '../alpha-router';
import { RouteWithValidQuote, V4RouteWithValidQuote } from '../entities';
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
    currencyIn: Currency,
    currencyOut: Currency,
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

    // Drop any pools that contain fee on transfer tokens (not supported by v4) or have issues with being transferred.
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
          (token.equals(currencyIn) || token.equals(currencyOut))
        ) {
          return false;
        }

        return (
          tokenValidation == TokenValidationResult.FOT ||
          tokenValidation == TokenValidationResult.STF
        );
      }
    );

    // Given all our candidate pools, compute all the possible ways to route from currencyIn to tokenOut.
    const { maxSwapsPerPath } = routingConfig;
    const routes = computeAllV4Routes(
      currencyIn,
      currencyOut,
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

  public override async getQuotes(
    routes: V4Route[],
    amounts: CurrencyAmount[],
    percents: number[],
    quoteCurrency: Currency,
    tradeType: TradeType,
    routingConfig: AlphaRouterConfig,
    candidatePools?: CandidatePoolsBySelectionCriteria,
    gasModel?: IGasModel<RouteWithValidQuote>
  ): Promise<GetQuotesResult> {
    const beforeGetQuotes = Date.now();
    log.info('Starting to get V4 quotes');

    if (gasModel === undefined) {
      throw new Error(
        'GasModel for V4RouteWithValidQuote is required to getQuotes'
      );
    }

    if (routes.length == 0) {
      return { routesWithValidQuotes: [], candidatePools };
    }

    // For all our routes, and all the fractional amounts, fetch quotes on-chain.
    const quoteFn =
      tradeType == TradeType.EXACT_INPUT
        ? this.onChainQuoteProvider.getQuotesManyExactIn.bind(
            this.onChainQuoteProvider
          )
        : this.onChainQuoteProvider.getQuotesManyExactOut.bind(
            this.onChainQuoteProvider
          );

    const beforeQuotes = Date.now();
    log.info(
      `Getting quotes for V4 for ${routes.length} routes with ${amounts.length} amounts per route.`
    );

    const { routesWithQuotes } = await quoteFn<V4Route>(
      amounts,
      routes,
      routingConfig
    );

    metric.putMetric(
      'V4QuotesLoad',
      Date.now() - beforeQuotes,
      MetricLoggerUnit.Milliseconds
    );

    metric.putMetric(
      'V4QuotesFetched',
      _(routesWithQuotes)
        .map(([, quotes]) => quotes.length)
        .sum(),
      MetricLoggerUnit.Count
    );

    const routesWithValidQuotes = [];

    for (const routeWithQuote of routesWithQuotes) {
      const [route, quotes] = routeWithQuote;

      for (let i = 0; i < quotes.length; i++) {
        const percent = percents[i]!;
        const amountQuote = quotes[i]!;
        const {
          quote,
          amount,
          sqrtPriceX96AfterList,
          initializedTicksCrossedList,
          gasEstimate,
        } = amountQuote;

        if (
          !quote ||
          !sqrtPriceX96AfterList ||
          !initializedTicksCrossedList ||
          !gasEstimate
        ) {
          log.debug(
            {
              route: routeToString(route),
              amountQuote,
            },
            'Dropping a null V4 quote for route.'
          );
          continue;
        }

        const routeWithValidQuote = new V4RouteWithValidQuote({
          route,
          rawQuote: quote,
          amount,
          percent,
          sqrtPriceX96AfterList,
          initializedTicksCrossedList,
          quoterGasEstimate: gasEstimate,
          gasModel,
          // TODO: ROUTE-306 make it unwrapped, once v4 gas model supports native quote currency
          // For now it's ok to keep it wrapped,
          // because the quote is the fairly accurate quote from the native currency routing
          quoteToken: quoteCurrency.wrapped,
          tradeType,
          v4PoolProvider: this.v4PoolProvider,
        });

        routesWithValidQuotes.push(routeWithValidQuote);
      }
    }

    metric.putMetric(
      'V4GetQuotesLoad',
      Date.now() - beforeGetQuotes,
      MetricLoggerUnit.Milliseconds
    );

    return {
      routesWithValidQuotes,
      candidatePools,
    };
  }
}
