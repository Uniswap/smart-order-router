import DEFAULT_TOKEN_LIST from '@uniswap/default-token-list';
import { Protocol, SwapRouter, Trade } from '@uniswap/router-sdk';
import { Currency, Fraction, Token, TradeType } from '@uniswap/sdk-core';
import { TokenList } from '@uniswap/token-lists';
import { Route as V2RouteRaw } from '@uniswap/v2-sdk';
import {
  MethodParameters,
  Pool,
  Position,
  Route as V3RouteRaw,
  SqrtPriceMath,
  TickMath,
} from '@uniswap/v3-sdk';
import { BigNumber, providers } from 'ethers';
import JSBI from 'jsbi';
import _ from 'lodash';
import NodeCache from 'node-cache';
import { V3HeuristicGasModelFactory } from '.';
import {
  CachingGasStationProvider,
  CachingTokenProviderWithFallback,
  CachingV3PoolProvider,
  EIP1559GasPriceProvider,
  ETHGasStationInfoProvider,
  IV2QuoteProvider,
  IV2SubgraphProvider,
  NodeJSCache,
  UniswapMulticallProvider,
  V2QuoteProvider,
  V2SubgraphProvider,
} from '../../providers';
import {
  CachingTokenListProvider,
  ITokenListProvider,
} from '../../providers/caching-token-list-provider';
import {
  GasPrice,
  IGasPriceProvider,
} from '../../providers/gas-price-provider';
import { ITokenProvider, TokenProvider } from '../../providers/token-provider';
import {
  IV2PoolProvider,
  V2PoolProvider,
} from '../../providers/v2/pool-provider';
import {
  IV3PoolProvider,
  V3PoolProvider,
} from '../../providers/v3/pool-provider';
import {
  IV3QuoteProvider,
  V3QuoteProvider,
} from '../../providers/v3/quote-provider';
import {
  IV3SubgraphProvider,
  V3SubgraphProvider,
} from '../../providers/v3/subgraph-provider';
import { CurrencyAmount } from '../../util/amounts';
import { ChainId, ID_TO_CHAIN_ID } from '../../util/chains';
import { log } from '../../util/log';
import { metric, MetricLoggerUnit } from '../../util/metric';
import { routeToString } from '../../util/routes';
import {
  IRouter,
  ISwapToRatio,
  SwapConfig,
  SwapRoute,
  SwapToRatioRoute,
} from '../router';
import {
  RouteWithValidQuote,
  V2RouteWithValidQuote,
  V3RouteWithValidQuote,
} from './entities/route-with-valid-quote';
import { getBestSwapRoute } from './functions/best-swap-route';
import { calculateRatioAmountIn } from './functions/calculate-ratio-amount-in';
import {
  computeAllV2Routes,
  computeAllV3Routes,
} from './functions/compute-all-routes';
import {
  CandidatePoolsBySelectionCriteria,
  getV2CandidatePools,
  getV3CandidatePools as getV3CandidatePools,
  PoolId,
} from './functions/get-candidate-pools';
import { IV2GasModelFactory, IV3GasModelFactory } from './gas-models/gas-model';
import { V2HeuristicGasModelFactory } from './gas-models/v2/v2-heuristic-gas-model';

export type AlphaRouterParams = {
  chainId: ChainId;
  provider: providers.BaseProvider;
  multicall2Provider?: UniswapMulticallProvider;
  v3SubgraphProvider?: IV3SubgraphProvider;
  v3PoolProvider?: IV3PoolProvider;
  v3QuoteProvider?: IV3QuoteProvider;
  v2SubgraphProvider?: IV2SubgraphProvider;
  v2PoolProvider?: IV2PoolProvider;
  v2QuoteProvider?: IV2QuoteProvider;
  tokenProvider?: ITokenProvider;
  gasPriceProvider?: IGasPriceProvider;
  v3GasModelFactory?: IV3GasModelFactory;
  v2GasModelFactory?: IV2GasModelFactory;
  blockedTokenListProvider?: ITokenListProvider;
};

export type ProtocolPoolSelection = {
  topN: number;
  topNDirectSwaps: number;
  topNTokenInOut: number;
  topNSecondHop: number;
  topNWithEachBaseToken: number;
  topNWithBaseToken: number;
  topNWithBaseTokenInSet: boolean;
};

export type AlphaRouterConfig = {
  blockNumber?: number | Promise<number>;
  protocols?: Protocol[];
  v2PoolSelection: ProtocolPoolSelection;
  v3PoolSelection: ProtocolPoolSelection;
  maxSwapsPerPath: number;
  minSplits: number;
  maxSplits: number;
  forceCrossProtocol: boolean;
  distributionPercent: number;
};

export const DEFAULT_CONFIG: AlphaRouterConfig = {
  v3PoolSelection: {
    topN: 4,
    topNDirectSwaps: 2,
    topNTokenInOut: 4,
    topNSecondHop: 2,
    topNWithEachBaseToken: 2,
    topNWithBaseToken: 10,
    topNWithBaseTokenInSet: false,
  },
  v2PoolSelection: {
    topN: 10,
    topNDirectSwaps: 1,
    topNTokenInOut: 8,
    topNSecondHop: 6,
    topNWithEachBaseToken: 2,
    topNWithBaseToken: 5,
    topNWithBaseTokenInSet: false,
  },
  maxSwapsPerPath: 3,
  minSplits: 1,
  maxSplits: 5,
  forceCrossProtocol: false,
  distributionPercent: 5,
};

export type SwapAndAddConfig = {
  errorTolerance: Fraction;
  maxIterations: number;
};

const ETH_GAS_STATION_API_URL = 'https://ethgasstation.info/api/ethgasAPI.json';
// TODO: Change to prod once ready. Fill in other chains.
// const IPFS_POOL_CACHE_URL_BY_CHAIN: { [chainId in ChainId]?: string } = {
//   [ChainId.MAINNET]:
//     'https://cloudflare-ipfs.com/ipns/beta.api.uniswap.org/v1/pools/v3/mainnet.json',
// };

export class AlphaRouter
  implements
    IRouter<AlphaRouterConfig>,
    ISwapToRatio<AlphaRouterConfig, SwapAndAddConfig>
{
  protected chainId: ChainId;
  protected provider: providers.BaseProvider;
  protected multicall2Provider: UniswapMulticallProvider;
  protected v3SubgraphProvider: IV3SubgraphProvider;
  protected v3PoolProvider: IV3PoolProvider;
  protected v3QuoteProvider: IV3QuoteProvider;
  protected v2SubgraphProvider: IV2SubgraphProvider;
  protected v2PoolProvider: IV2PoolProvider;
  protected v2QuoteProvider: IV2QuoteProvider;
  protected tokenProvider: ITokenProvider;
  protected gasPriceProvider: IGasPriceProvider;
  protected v3GasModelFactory: IV3GasModelFactory;
  protected v2GasModelFactory: IV2GasModelFactory;
  protected blockedTokenListProvider?: ITokenListProvider;

  constructor({
    chainId,
    provider,
    multicall2Provider,
    v3PoolProvider,
    v3QuoteProvider,
    v2PoolProvider,
    v2QuoteProvider,
    v2SubgraphProvider,
    tokenProvider,
    blockedTokenListProvider,
    v3SubgraphProvider,
    gasPriceProvider,
    v3GasModelFactory,
    v2GasModelFactory,
  }: AlphaRouterParams) {
    this.chainId = chainId;
    this.provider = provider;
    this.multicall2Provider =
      multicall2Provider ??
      new UniswapMulticallProvider(chainId, provider, 375_000);
    this.v3PoolProvider =
      v3PoolProvider ??
      new CachingV3PoolProvider(
        this.chainId,
        new V3PoolProvider(ID_TO_CHAIN_ID(chainId), this.multicall2Provider),
        new NodeJSCache(new NodeCache({ stdTTL: 360, useClones: false }))
      );
    this.v3QuoteProvider =
      v3QuoteProvider ??
      new V3QuoteProvider(
        this.chainId,
        this.provider,
        this.multicall2Provider,
        {
          retries: 2,
          minTimeout: 100,
          maxTimeout: 1000,
        },
        {
          multicallChunk: 210, // 210
          gasLimitPerCall: 705_000, // 705
          quoteMinSuccessRate: 0.15,
        },
        {
          gasLimitOverride: 2_000_000,
          multicallChunk: 70,
        }
      );

    this.v2PoolProvider =
      v2PoolProvider ?? new V2PoolProvider(chainId, this.multicall2Provider);
    this.v2QuoteProvider = v2QuoteProvider ?? new V2QuoteProvider();
    this.v2SubgraphProvider =
      v2SubgraphProvider ?? new V2SubgraphProvider(chainId);

    this.blockedTokenListProvider =
      blockedTokenListProvider ??
      new CachingTokenListProvider(
        chainId,
        //TODO(judo): add unsupported
        {} as TokenList,
        new NodeJSCache(new NodeCache({ stdTTL: 3600, useClones: false }))
      );
    this.tokenProvider =
      tokenProvider ??
      new CachingTokenProviderWithFallback(
        chainId,
        new NodeJSCache(new NodeCache({ stdTTL: 3600, useClones: false })),
        new CachingTokenListProvider(
          chainId,
          DEFAULT_TOKEN_LIST,
          new NodeJSCache(new NodeCache({ stdTTL: 3600, useClones: false }))
        ),
        new TokenProvider(chainId, this.multicall2Provider)
      );

    this.v3SubgraphProvider = v3SubgraphProvider
      ? v3SubgraphProvider
      : new V3SubgraphProvider(this.chainId);

    this.gasPriceProvider =
      gasPriceProvider ??
      new CachingGasStationProvider(
        chainId,
        this.provider instanceof providers.JsonRpcProvider
          ? new EIP1559GasPriceProvider(this.provider)
          : new ETHGasStationInfoProvider(ETH_GAS_STATION_API_URL),
        new NodeJSCache<GasPrice>(
          new NodeCache({ stdTTL: 15_000, useClones: false })
        )
      );
    this.v3GasModelFactory =
      v3GasModelFactory ?? new V3HeuristicGasModelFactory();
    this.v2GasModelFactory =
      v2GasModelFactory ?? new V2HeuristicGasModelFactory();
  }

  public async routeToRatio(
    token0Balance: CurrencyAmount,
    token1Balance: CurrencyAmount,
    position: Position,
    swapAndAddConfig: SwapAndAddConfig,
    swapConfig?: SwapConfig,
    routingConfig: Partial<AlphaRouterConfig> = DEFAULT_CONFIG
  ): Promise<SwapToRatioRoute | null> {
    if (
      token1Balance.currency.wrapped.sortsBefore(token0Balance.currency.wrapped)
    ) {
      [token0Balance, token1Balance] = [token1Balance, token0Balance];
    }

    let preSwapOptimalRatio = this.calculateOptimalRatio(
      position,
      position.pool.sqrtRatioX96,
      true
    );

    // set up parameters according to which token will be swapped
    let zeroForOne: boolean;
    if (position.pool.tickCurrent > position.tickUpper) {
      zeroForOne = true;
    } else if (position.pool.tickCurrent < position.tickLower) {
      zeroForOne = false;
    } else {
      zeroForOne = new Fraction(
        token0Balance.quotient,
        token1Balance.quotient
      ).greaterThan(preSwapOptimalRatio);
      if (!zeroForOne) preSwapOptimalRatio = preSwapOptimalRatio.invert();
    }

    const [inputBalance, outputBalance] = zeroForOne
      ? [token0Balance, token1Balance]
      : [token1Balance, token0Balance];

    let optimalRatio = preSwapOptimalRatio;
    let postSwapTargetPool = position.pool;
    let exchangeRate: Fraction = zeroForOne
      ? position.pool.token0Price
      : position.pool.token1Price;
    let swap: SwapRoute | null = null;
    let ratioAchieved = false;
    let n = 0;

    // iterate until we find a swap with a sufficient ratio or return null
    while (!ratioAchieved) {
      n++;
      if (n > swapAndAddConfig.maxIterations) {
        return null;
      }

      let amountToSwap = calculateRatioAmountIn(
        optimalRatio,
        exchangeRate,
        inputBalance,
        outputBalance
      );

      swap = await this.route(
        amountToSwap,
        outputBalance.currency,
        TradeType.EXACT_INPUT,
        swapConfig,
        { ...DEFAULT_CONFIG, ...routingConfig, protocols: [Protocol.V3] } // TODO: Enable V2 once have trade object across v2/v3.
      );

      if (!swap) {
        return null;
      }

      let inputBalanceUpdated = inputBalance.subtract(swap.trade!.inputAmount);
      let outputBalanceUpdated = outputBalance.add(swap.trade!.outputAmount);
      let newRatio = inputBalanceUpdated.divide(outputBalanceUpdated);

      let targetPoolPriceUpdate;
      swap.route.forEach((route) => {
        if (route.protocol == Protocol.V3) {
          const v3Route = route as V3RouteWithValidQuote;
          v3Route.route.pools.forEach((pool, i) => {
            if (
              pool.token0.equals(position.pool.token0) &&
              pool.token1.equals(position.pool.token1) &&
              pool.fee == position.pool.fee
            ) {
              targetPoolPriceUpdate = JSBI.BigInt(
                v3Route.sqrtPriceX96AfterList[i]!.toString()
              );
              optimalRatio = this.calculateOptimalRatio(
                position,
                JSBI.BigInt(targetPoolPriceUpdate!.toString()),
                zeroForOne
              );
            }
          });
        }
      });
      if (!targetPoolPriceUpdate) {
        optimalRatio = preSwapOptimalRatio;
      }

      ratioAchieved =
        newRatio.equalTo(optimalRatio) ||
        this.absoluteValue(
          newRatio.asFraction.divide(optimalRatio).subtract(1)
        ).lessThan(swapAndAddConfig.errorTolerance);

      if (ratioAchieved && targetPoolPriceUpdate) {
        postSwapTargetPool = new Pool(
          position.pool.token0,
          position.pool.token1,
          position.pool.fee,
          targetPoolPriceUpdate,
          position.pool.liquidity,
          TickMath.getTickAtSqrtRatio(targetPoolPriceUpdate),
          position.pool.tickDataProvider
        );
      }
      exchangeRate = swap.trade!.outputAmount.divide(swap.trade!.inputAmount);

      log.info({
        optimalRatio: optimalRatio.asFraction.toFixed(18),
        newRatio: newRatio.asFraction.toFixed(18),
        errorTolerance: swapAndAddConfig.errorTolerance.toFixed(18),
        iterationN: n.toString(),
      });
    }

    if (!swap) {
      return null;
    }

    return { ...swap, optimalRatio, postSwapTargetPool };
  }

  public async route(
    amount: CurrencyAmount,
    quoteCurrency: Currency,
    swapType: TradeType,
    swapConfig?: SwapConfig,
    partialRoutingConfig: Partial<AlphaRouterConfig> = {}
  ): Promise<SwapRoute | null> {
    // Get a block number to specify in all our calls. Ensures data we fetch from chain is
    // from the same block.
    const blockNumber =
      partialRoutingConfig.blockNumber ?? this.provider.getBlockNumber();

    const routingConfig: AlphaRouterConfig = _.merge(
      {},
      DEFAULT_CONFIG,
      partialRoutingConfig,
      { blockNumber }
    );

    const currencyIn =
      swapType == TradeType.EXACT_INPUT ? amount.currency : quoteCurrency;
    const currencyOut =
      swapType == TradeType.EXACT_INPUT ? quoteCurrency : amount.currency;
    const tokenIn = currencyIn.wrapped;
    const tokenOut = currencyOut.wrapped;

    // Generate our distribution of amounts, i.e. fractions of the input amount.
    // We will get quotes for fractions of the input amount for different routes, then
    // combine to generate split routes.
    const [percents, amounts] = this.getAmountDistribution(
      amount,
      routingConfig
    );

    // Get an estimate of the gas price to use when estimating gas cost of different routes.
    const beforeGas = Date.now();
    const { gasPriceWei } = await this.gasPriceProvider.getGasPrice();

    metric.putMetric(
      'GasPriceLoad',
      Date.now() - beforeGas,
      MetricLoggerUnit.Milliseconds
    );

    const quoteToken = quoteCurrency.wrapped;

    const { protocols } = routingConfig;

    const quotePromises: Promise<{
      routesWithValidQuotes: RouteWithValidQuote[];
      candidatePools: CandidatePoolsBySelectionCriteria;
    }>[] = [];

    if (!protocols || protocols.length == 0) {
      log.info({ protocols, swapType }, 'Routing across all protocols');
      quotePromises.push(
        this.getV3Quotes(
          tokenIn,
          tokenOut,
          amounts,
          percents,
          quoteToken,
          gasPriceWei,
          swapType,
          routingConfig
        )
      );
      quotePromises.push(
        this.getV2Quotes(
          tokenIn,
          tokenOut,
          amounts,
          percents,
          quoteToken,
          gasPriceWei,
          swapType,
          routingConfig
        )
      );
    } else if (protocols.includes(Protocol.V3)) {
      log.info({ protocols, swapType }, 'Routing across V3');
      quotePromises.push(
        this.getV3Quotes(
          tokenIn,
          tokenOut,
          amounts,
          percents,
          quoteToken,
          gasPriceWei,
          swapType,
          routingConfig
        )
      );
    } else if (protocols.includes(Protocol.V2)) {
      log.info({ protocols, swapType }, 'Routing across V2');
      quotePromises.push(
        this.getV2Quotes(
          tokenIn,
          tokenOut,
          amounts,
          percents,
          quoteToken,
          gasPriceWei,
          swapType,
          routingConfig
        )
      );
    }

    const routesWithValidQuotesByProtocol = await Promise.all(quotePromises);

    let allRoutesWithValidQuotes: RouteWithValidQuote[] = [];
    let allCandidatePools: CandidatePoolsBySelectionCriteria[] = [];
    for (const {
      routesWithValidQuotes,
      candidatePools,
    } of routesWithValidQuotesByProtocol) {
      allRoutesWithValidQuotes = [
        ...allRoutesWithValidQuotes,
        ...routesWithValidQuotes,
      ];
      allCandidatePools = [...allCandidatePools, candidatePools];
    }

    if (allRoutesWithValidQuotes.length == 0) {
      log.info({ allRoutesWithValidQuotes }, 'Received no valid quotes');
      return null;
    }

    // Given all the quotes for all the amounts for all the routes, find the best combination.
    const beforeBestSwap = Date.now();
    const swapRouteRaw = getBestSwapRoute(
      amount,
      percents,
      allRoutesWithValidQuotes,
      swapType,
      this.chainId,
      routingConfig
    );

    if (!swapRouteRaw) {
      return null;
    }

    const {
      quote,
      quoteGasAdjusted,
      estimatedGasUsed,
      routes: routeAmounts,
      estimatedGasUsedQuoteToken,
      estimatedGasUsedUSD,
    } = swapRouteRaw;

    // Build Trade object that represents the optimal swap.
    const trade = this.buildTrade<typeof swapType>(
      currencyIn,
      currencyOut,
      swapType,
      routeAmounts
    );

    let methodParameters: MethodParameters | undefined;

    // If user provided recipient, deadline etc. we also generate the calldata required to execute
    // the swap and return it too.
    if (swapConfig) {
      methodParameters = this.buildMethodParameters(trade, swapConfig);
    }

    metric.putMetric(
      'FindBestSwapRoute',
      Date.now() - beforeBestSwap,
      MetricLoggerUnit.Milliseconds
    );

    this.emitPoolSelectionMetrics(swapRouteRaw, allCandidatePools);

    return {
      quote,
      quoteGasAdjusted,
      estimatedGasUsed,
      estimatedGasUsedQuoteToken,
      estimatedGasUsedUSD,
      gasPriceWei,
      route: routeAmounts,
      trade,
      methodParameters,
      blockNumber: BigNumber.from(await blockNumber),
    };
  }

  private async getV3Quotes(
    tokenIn: Token,
    tokenOut: Token,
    amounts: CurrencyAmount[],
    percents: number[],
    quoteToken: Token,
    gasPriceWei: BigNumber,
    swapType: TradeType,
    routingConfig: AlphaRouterConfig
  ): Promise<{
    routesWithValidQuotes: V3RouteWithValidQuote[];
    candidatePools: CandidatePoolsBySelectionCriteria;
  }> {
    log.info('Starting to get V3 quotes');
    // Fetch all the pools that we will consider routing via. There are thousands
    // of pools, so we filter them to a set of candidate pools that we expect will
    // result in good prices.
    const { poolAccessor, candidatePools } = await getV3CandidatePools({
      tokenIn,
      tokenOut,
      tokenProvider: this.tokenProvider,
      blockedTokenListProvider: this.blockedTokenListProvider,
      poolProvider: this.v3PoolProvider,
      routeType: swapType,
      subgraphProvider: this.v3SubgraphProvider,
      routingConfig,
      chainId: this.chainId,
    });
    const pools = poolAccessor.getAllPools();

    // Given all our candidate pools, compute all the possible ways to route from tokenIn to tokenOut.
    const { maxSwapsPerPath } = routingConfig;
    const routes = computeAllV3Routes(
      tokenIn,
      tokenOut,
      pools,
      maxSwapsPerPath
    );

    if (routes.length == 0) {
      return { routesWithValidQuotes: [], candidatePools };
    }

    // For all our routes, and all the fractional amounts, fetch quotes on-chain.
    const quoteFn =
      swapType == TradeType.EXACT_INPUT
        ? this.v3QuoteProvider.getQuotesManyExactIn.bind(this.v3QuoteProvider)
        : this.v3QuoteProvider.getQuotesManyExactOut.bind(this.v3QuoteProvider);

    const beforeQuotes = Date.now();
    log.info(
      `Getting quotes for V3 for ${routes.length} routes with ${amounts.length} amounts per route.`
    );
    const { routesWithQuotes } = await quoteFn(amounts, routes, {
      blockNumber: routingConfig.blockNumber,
    });

    const gasModel = await this.v3GasModelFactory.buildGasModel(
      this.chainId,
      gasPriceWei,
      this.v3PoolProvider,
      quoteToken
    );

    metric.putMetric(
      'V3QuotesLoad',
      Date.now() - beforeQuotes,
      MetricLoggerUnit.Milliseconds
    );

    metric.putMetric(
      'V3QuotesFetched',
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
            'Dropping a null quote for route.'
          );
          continue;
        }

        const routeWithValidQuote = new V3RouteWithValidQuote({
          route,
          rawQuote: quote,
          amount,
          percent,
          sqrtPriceX96AfterList,
          initializedTicksCrossedList,
          quoterGasEstimate: gasEstimate,
          gasModel,
          quoteToken,
          tradeType: swapType,
          v3PoolProvider: this.v3PoolProvider,
        });

        routesWithValidQuotes.push(routeWithValidQuote);
      }
    }

    return { routesWithValidQuotes, candidatePools };
  }

  private async getV2Quotes(
    tokenIn: Token,
    tokenOut: Token,
    amounts: CurrencyAmount[],
    percents: number[],
    quoteToken: Token,
    gasPriceWei: BigNumber,
    swapType: TradeType,
    routingConfig: AlphaRouterConfig
  ): Promise<{
    routesWithValidQuotes: V2RouteWithValidQuote[];
    candidatePools: CandidatePoolsBySelectionCriteria;
  }> {
    log.info('Starting to get V2 quotes');
    // Fetch all the pools that we will consider routing via. There are thousands
    // of pools, so we filter them to a set of candidate pools that we expect will
    // result in good prices.
    const { poolAccessor, candidatePools } = await getV2CandidatePools({
      tokenIn,
      tokenOut,
      tokenProvider: this.tokenProvider,
      blockedTokenListProvider: this.blockedTokenListProvider,
      poolProvider: this.v2PoolProvider,
      routeType: swapType,
      subgraphProvider: this.v2SubgraphProvider,
      routingConfig,
      chainId: this.chainId,
    });
    const pools = poolAccessor.getAllPools();

    // Given all our candidate pools, compute all the possible ways to route from tokenIn to tokenOut.
    const { maxSwapsPerPath } = routingConfig;
    const routes = computeAllV2Routes(
      tokenIn,
      tokenOut,
      pools,
      maxSwapsPerPath
    );

    if (routes.length == 0) {
      return { routesWithValidQuotes: [], candidatePools };
    }

    // For all our routes, and all the fractional amounts, fetch quotes on-chain.
    const quoteFn =
      swapType == TradeType.EXACT_INPUT
        ? this.v2QuoteProvider.getQuotesManyExactIn.bind(this.v2QuoteProvider)
        : this.v2QuoteProvider.getQuotesManyExactOut.bind(this.v2QuoteProvider);

    const beforeQuotes = Date.now();

    log.info(
      `Getting quotes for V2 for ${routes.length} routes with ${amounts.length} amounts per route.`
    );
    const { routesWithQuotes } = await quoteFn(amounts, routes);

    const gasModel = await this.v2GasModelFactory.buildGasModel(
      this.chainId,
      gasPriceWei,
      this.v2PoolProvider,
      quoteToken
    );

    metric.putMetric(
      'V2QuotesLoad',
      Date.now() - beforeQuotes,
      MetricLoggerUnit.Milliseconds
    );

    metric.putMetric(
      'V2QuotesFetched',
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
        const { quote, amount } = amountQuote;

        if (!quote) {
          log.debug(
            {
              route: routeToString(route),
              amountQuote,
            },
            'Dropping a null quote for route.'
          );
          continue;
        }

        const routeWithValidQuote = new V2RouteWithValidQuote({
          route,
          rawQuote: quote,
          amount,
          percent,
          gasModel,
          quoteToken,
          tradeType: swapType,
          v2PoolProvider: this.v2PoolProvider,
        });

        routesWithValidQuotes.push(routeWithValidQuote);
      }
    }

    return { routesWithValidQuotes, candidatePools };
  }

  // Note multiplications here can result in a loss of precision in the amounts (e.g. taking 50% of 101)
  // This is reconcilled at the end of the algorithm by adding any lost precision to one of
  // the splits in the route.
  private getAmountDistribution(
    amount: CurrencyAmount,
    routingConfig: AlphaRouterConfig
  ): [number[], CurrencyAmount[]] {
    const { distributionPercent } = routingConfig;
    let percents = [];
    let amounts = [];

    for (let i = 1; i <= 100 / distributionPercent; i++) {
      percents.push(i * distributionPercent);
      amounts.push(amount.multiply(new Fraction(i * distributionPercent, 100)));
    }

    return [percents, amounts];
  }

  private buildTrade<TTradeType extends TradeType>(
    tokenInCurrency: Currency,
    tokenOutCurrency: Currency,
    tradeType: TTradeType,
    routeAmounts: RouteWithValidQuote[]
  ): Trade<Currency, Currency, TTradeType> {
    const [v3RouteAmounts, v2RouteAmounts] = _.partition(
      routeAmounts,
      (routeAmount) => routeAmount.protocol == Protocol.V3
    );

    const v3Routes = _.map<
      V3RouteWithValidQuote,
      {
        routev3: V3RouteRaw<Currency, Currency>;
        inputAmount: CurrencyAmount;
        outputAmount: CurrencyAmount;
      }
    >(
      v3RouteAmounts as V3RouteWithValidQuote[],
      (routeAmount: V3RouteWithValidQuote) => {
        const { route, amount, quote } = routeAmount;

        // The route, amount and quote are all in terms of wrapped tokens.
        // When constructing the Trade object the inputAmount/outputAmount must
        // use native currencies if specified by the user. This is so that the Trade knows to wrap/unwrap.
        if (tradeType == TradeType.EXACT_INPUT) {
          const amountCurrency = CurrencyAmount.fromFractionalAmount(
            tokenInCurrency,
            amount.numerator,
            amount.denominator
          );
          const quoteCurrency = CurrencyAmount.fromFractionalAmount(
            tokenOutCurrency,
            quote.numerator,
            quote.denominator
          );

          const routeRaw = new V3RouteRaw(
            route.pools,
            amountCurrency.currency,
            quoteCurrency.currency
          );

          return {
            routev3: routeRaw,
            inputAmount: amountCurrency,
            outputAmount: quoteCurrency,
          };
        } else {
          const quoteCurrency = CurrencyAmount.fromFractionalAmount(
            tokenInCurrency,
            quote.numerator,
            quote.denominator
          );

          const amountCurrency = CurrencyAmount.fromFractionalAmount(
            tokenOutCurrency,
            amount.numerator,
            amount.denominator
          );

          const routeCurrency = new V3RouteRaw(
            route.pools,
            quoteCurrency.currency,
            amountCurrency.currency
          );

          return {
            routev3: routeCurrency,
            inputAmount: quoteCurrency,
            outputAmount: amountCurrency,
          };
        }
      }
    );

    const v2Routes = _.map<
      V2RouteWithValidQuote,
      {
        routev2: V2RouteRaw<Currency, Currency>;
        inputAmount: CurrencyAmount;
        outputAmount: CurrencyAmount;
      }
    >(
      v2RouteAmounts as V2RouteWithValidQuote[],
      (routeAmount: V2RouteWithValidQuote) => {
        const { route, amount, quote } = routeAmount;

        // The route, amount and quote are all in terms of wrapped tokens.
        // When constructing the Trade object the inputAmount/outputAmount must
        // use native currencies if specified by the user. This is so that the Trade knows to wrap/unwrap.
        if (tradeType == TradeType.EXACT_INPUT) {
          const amountCurrency = CurrencyAmount.fromFractionalAmount(
            tokenInCurrency,
            amount.numerator,
            amount.denominator
          );
          const quoteCurrency = CurrencyAmount.fromFractionalAmount(
            tokenOutCurrency,
            quote.numerator,
            quote.denominator
          );

          const routeV2SDK = new V2RouteRaw(
            route.pairs,
            amountCurrency.currency,
            quoteCurrency.currency
          );

          return {
            routev2: routeV2SDK,
            inputAmount: amountCurrency,
            outputAmount: quoteCurrency,
          };
        } else {
          const quoteCurrency = CurrencyAmount.fromFractionalAmount(
            tokenInCurrency,
            quote.numerator,
            quote.denominator
          );

          const amountCurrency = CurrencyAmount.fromFractionalAmount(
            tokenOutCurrency,
            amount.numerator,
            amount.denominator
          );

          const routeV2SDK = new V2RouteRaw(
            route.pairs,
            quoteCurrency.currency,
            amountCurrency.currency
          );

          return {
            routev2: routeV2SDK,
            inputAmount: quoteCurrency,
            outputAmount: amountCurrency,
          };
        }
      }
    );

    const trade = new Trade({ v2Routes, v3Routes, tradeType });

    return trade;
  }

  private buildMethodParameters(
    trade: Trade<Currency, Currency, TradeType>,
    swapConfig: SwapConfig
  ): MethodParameters {
    const { recipient, slippageTolerance, deadline, inputTokenPermit } =
      swapConfig;

    const methodParameters = SwapRouter.swapCallParameters(trade, {
      recipient,
      slippageTolerance,
      deadlineOrPreviousBlockhash: deadline,
      inputTokenPermit,
    });

    return methodParameters;
  }

  private emitPoolSelectionMetrics(
    swapRouteRaw: {
      quote: CurrencyAmount;
      quoteGasAdjusted: CurrencyAmount;
      routes: RouteWithValidQuote[];
      estimatedGasUsed: BigNumber;
    },
    allPoolsBySelection: CandidatePoolsBySelectionCriteria[]
  ) {
    const poolAddressesUsed = new Set<string>();
    const { routes: routeAmounts } = swapRouteRaw;
    _(routeAmounts)
      .flatMap((routeAmount) => {
        const { poolAddresses } = routeAmount;
        return poolAddresses;
      })
      .forEach((address: string) => {
        poolAddressesUsed.add(address.toLowerCase());
      });

    for (const poolsBySelection of allPoolsBySelection) {
      const { protocol } = poolsBySelection;
      _.forIn(
        poolsBySelection.selections,
        (pools: PoolId[], topNSelection: string) => {
          const topNUsed =
            _.findLastIndex(pools, (pool) =>
              poolAddressesUsed.has(pool.id.toLowerCase())
            ) + 1;
          metric.putMetric(
            _.capitalize(`${protocol}${topNSelection}`),
            topNUsed,
            MetricLoggerUnit.Count
          );
        }
      );
    }

    let hasV3Route = false;
    let hasV2Route = false;
    for (const routeAmount of routeAmounts) {
      if (routeAmount.protocol == Protocol.V3) {
        hasV3Route = true;
      }
      if (routeAmount.protocol == Protocol.V2) {
        hasV2Route = true;
      }
    }

    if (hasV3Route && hasV2Route) {
      metric.putMetric(`V3AndV2Routes`, 1, MetricLoggerUnit.Count);
    } else if (hasV3Route) {
      metric.putMetric(`V3Routes`, 1, MetricLoggerUnit.Count);
    } else if (hasV2Route) {
      metric.putMetric(`V2Routes`, 1, MetricLoggerUnit.Count);
    }
  }

  private calculateOptimalRatio(
    position: Position,
    sqrtRatioX96: JSBI,
    zeroForOne: boolean
  ): Fraction {
    const upperSqrtRatioX96 = TickMath.getSqrtRatioAtTick(position.tickUpper);
    const lowerSqrtRatioX96 = TickMath.getSqrtRatioAtTick(position.tickLower);

    // returns Fraction(0, 1) for any out of range position regardless of zeroForOne. Implication: function
    // cannot be used to determine the trading direction of out of range positions.
    if (
      JSBI.greaterThan(sqrtRatioX96, upperSqrtRatioX96) ||
      JSBI.lessThan(sqrtRatioX96, lowerSqrtRatioX96)
    ) {
      return new Fraction(0, 1);
    }

    const precision = JSBI.BigInt('1' + '0'.repeat(18));
    let optimalRatio = new Fraction(
      SqrtPriceMath.getAmount0Delta(
        sqrtRatioX96,
        upperSqrtRatioX96,
        precision,
        true
      ),
      SqrtPriceMath.getAmount1Delta(
        sqrtRatioX96,
        lowerSqrtRatioX96,
        precision,
        true
      )
    );
    if (!zeroForOne) optimalRatio = optimalRatio.invert();
    return optimalRatio;
  }

  private absoluteValue(fraction: Fraction): Fraction {
    if (fraction.lessThan(0)) {
      return fraction.multiply(-1);
    }
    return fraction;
  }
}
