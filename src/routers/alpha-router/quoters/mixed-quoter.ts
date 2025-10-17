import { Protocol } from '@uniswap/router-sdk';
import { ChainId, Currency, TradeType } from '@uniswap/sdk-core';
import { UniversalRouterVersion } from '@uniswap/universal-router-sdk';
import _ from 'lodash';

import {
  IOnChainQuoteProvider,
  ITokenListProvider,
  ITokenProvider,
  ITokenValidatorProvider,
  IV2PoolProvider,
  IV2SubgraphProvider,
  IV3PoolProvider,
  IV3SubgraphProvider,
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
import { mixedRouteFilterOutV4Pools } from '../../../util/mixedRouteFilterOutV4Pools';
import { MixedRoute } from '../../router';
import { AlphaRouterConfig } from '../alpha-router';
import { MixedRouteWithValidQuote } from '../entities';
import { computeAllMixedRoutes } from '../functions/compute-all-routes';
import {
  CandidatePoolsBySelectionCriteria,
  CrossLiquidityCandidatePools,
  getMixedRouteCandidatePools,
  V2CandidatePools,
  V3CandidatePools,
  V4CandidatePools,
} from '../functions/get-candidate-pools';
import { IGasModel } from '../gas-models';


import { BaseQuoter } from './base-quoter';
import { GetQuotesResult, GetRoutesResult } from './model';

export class MixedQuoter extends BaseQuoter<
  [
    V4CandidatePools | undefined,
    V3CandidatePools | undefined,
    V2CandidatePools | undefined,
    CrossLiquidityCandidatePools
  ],
  MixedRoute,
  Currency
> {
  protected v4SubgraphProvider: IV4SubgraphProvider;
  protected v4PoolProvider: IV4PoolProvider;
  protected v3SubgraphProvider: IV3SubgraphProvider;
  protected v3PoolProvider: IV3PoolProvider;
  protected v2SubgraphProvider: IV2SubgraphProvider;
  protected v2PoolProvider: IV2PoolProvider;
  protected onChainQuoteProvider: IOnChainQuoteProvider;

  constructor(
    v4SubgraphProvider: IV4SubgraphProvider,
    v4PoolProvider: IV4PoolProvider,
    v3SubgraphProvider: IV3SubgraphProvider,
    v3PoolProvider: IV3PoolProvider,
    v2SubgraphProvider: IV2SubgraphProvider,
    v2PoolProvider: IV2PoolProvider,
    onChainQuoteProvider: IOnChainQuoteProvider,
    tokenProvider: ITokenProvider,
    chainId: ChainId,
    blockedTokenListProvider?: ITokenListProvider,
    tokenValidatorProvider?: ITokenValidatorProvider
  ) {
    super(
      tokenProvider,
      chainId,
      Protocol.MIXED,
      blockedTokenListProvider,
      tokenValidatorProvider
    );
    this.v4SubgraphProvider = v4SubgraphProvider;
    this.v4PoolProvider = v4PoolProvider;
    this.v3SubgraphProvider = v3SubgraphProvider;
    this.v3PoolProvider = v3PoolProvider;
    this.v2SubgraphProvider = v2SubgraphProvider;
    this.v2PoolProvider = v2PoolProvider;
    this.onChainQuoteProvider = onChainQuoteProvider;
  }

  protected async getRoutes(
    currencyIn: Currency,
    currencyOut: Currency,
    v4v3v2candidatePools: [
      V4CandidatePools | undefined,
      V3CandidatePools | undefined,
      V2CandidatePools | undefined,
      CrossLiquidityCandidatePools
    ],
    tradeType: TradeType,
    routingConfig: AlphaRouterConfig
  ): Promise<GetRoutesResult<MixedRoute>> {
    const beforeGetRoutes = Date.now();

    if (tradeType != TradeType.EXACT_INPUT) {
      throw new Error('Mixed route quotes are not supported for EXACT_OUTPUT');
    }

    const [
      v4CandidatePools,
      v3CandidatePools,
      v2CandidatePools,
      crossLiquidityPools,
    ] = v4v3v2candidatePools;

    const {
      V2poolAccessor,
      V3poolAccessor,
      V4poolAccessor,
      candidatePools: mixedRouteCandidatePools,
    } = await getMixedRouteCandidatePools({
      v4CandidatePools,
      v3CandidatePools,
      v2CandidatePools,
      crossLiquidityPools,
      tokenProvider: this.tokenProvider,
      v4PoolProvider: this.v4PoolProvider,
      v3poolProvider: this.v3PoolProvider,
      v2poolProvider: this.v2PoolProvider,
      routingConfig,
      chainId: this.chainId,
    });

    const V4poolsRaw = V4poolAccessor.getAllPools();
    const V3poolsRaw = V3poolAccessor.getAllPools();
    const V2poolsRaw = V2poolAccessor.getAllPools();

    const poolsRaw = [];
    if (!routingConfig.excludedProtocolsFromMixed?.includes(Protocol.V4)) {
      poolsRaw.push(...V4poolsRaw);
    }
    if (!routingConfig.excludedProtocolsFromMixed?.includes(Protocol.V3)) {
      poolsRaw.push(...V3poolsRaw);
    }
    if (!routingConfig.excludedProtocolsFromMixed?.includes(Protocol.V2)) {
      poolsRaw.push(...V2poolsRaw);
    }

    const candidatePools = mixedRouteCandidatePools;

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

    const { maxSwapsPerPath } = routingConfig;

    let routes = computeAllMixedRoutes(
      currencyIn,
      currencyOut,
      pools,
      maxSwapsPerPath,
      routingConfig.shouldEnableMixedRouteEthWeth,
      routingConfig.hooksOptions
    );

    if (
      routingConfig.universalRouterVersion === UniversalRouterVersion.V1_2 ||
      !routingConfig.protocols?.includes(Protocol.V4)
    ) {
      routes = mixedRouteFilterOutV4Pools(routes);
    }

    metric.putMetric(
      'MixedGetRoutesLoad',
      Date.now() - beforeGetRoutes,
      MetricLoggerUnit.Milliseconds
    );

    metric.putMetric(
      `MixedGetRoutesLoad_Chain${this.chainId}`,
      Date.now() - beforeGetRoutes,
      MetricLoggerUnit.Milliseconds
    );

    return {
      routes: routes,
      candidatePools,
    };
  }

  public override async getQuotes(
    routes: MixedRoute[],
    amounts: CurrencyAmount[],
    percents: number[],
    quoteCurrency: Currency,
    tradeType: TradeType,
    routingConfig: AlphaRouterConfig,
    candidatePools?: CandidatePoolsBySelectionCriteria,
    gasModel?: IGasModel<MixedRouteWithValidQuote>
  ): Promise<GetQuotesResult> {
    const beforeGetQuotes = Date.now();
    log.info('Starting to get mixed quotes');
    if (gasModel === undefined) {
      throw new Error(
        'GasModel for MixedRouteWithValidQuote is required to getQuotes'
      );
    }
    if (routes.length == 0) {
      return { routesWithValidQuotes: [], candidatePools };
    }

    // For all our routes, and all the fractional amounts, fetch quotes on-chain.
    const quoteFn = this.onChainQuoteProvider.getQuotesManyExactIn.bind(
      this.onChainQuoteProvider
    );

    const beforeQuotes = Date.now();
    log.info(
      `Getting quotes for mixed for ${routes.length} routes with ${amounts.length} amounts per route.`
    );

    const { routesWithQuotes } = await quoteFn<MixedRoute>(
      amounts,
      routes,
      routingConfig
    );

    metric.putMetric(
      'MixedQuotesLoad',
      Date.now() - beforeQuotes,
      MetricLoggerUnit.Milliseconds
    );

    metric.putMetric(
      'MixedQuotesFetched',
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
            'Dropping a null mixed quote for route.'
          );
          continue;
        }

        const routeWithValidQuote = new MixedRouteWithValidQuote({
          route,
          rawQuote: quote,
          amount,
          percent,
          sqrtPriceX96AfterList,
          initializedTicksCrossedList,
          quoterGasEstimate: gasEstimate,
          mixedRouteGasModel: gasModel,
          quoteToken: quoteCurrency.wrapped,
          tradeType,
          v4PoolProvider: this.v4PoolProvider,
          v3PoolProvider: this.v3PoolProvider,
          v2PoolProvider: this.v2PoolProvider,
        });

        routesWithValidQuotes.push(routeWithValidQuote);
      }
    }

    metric.putMetric(
      'MixedGetQuotesLoad',
      Date.now() - beforeGetQuotes,
      MetricLoggerUnit.Milliseconds
    );

    return {
      routesWithValidQuotes,
      candidatePools,
    };
  }
}
