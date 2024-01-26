import { BigNumber } from '@ethersproject/bignumber';
import { JsonRpcProvider } from '@ethersproject/providers';
// import DEFAULT_TOKEN_LIST from '@uniswap/default-token-list';
import { Protocol, SwapRouter, ZERO } from '@uniswap/router-sdk';
import { ChainId, Fraction, TradeType, } from '@uniswap/sdk-core';
import { Pool, Position, SqrtPriceMath, TickMath } from '@uniswap/v3-sdk';
import retry from 'async-retry';
import JSBI from 'jsbi';
import _ from 'lodash';
import NodeCache from 'node-cache';
import { CachedRoutes, CacheMode, CachingGasStationProvider, CachingTokenProviderWithFallback, CachingV2PoolProvider, CachingV2SubgraphProvider, CachingV3PoolProvider, CachingV3SubgraphProvider, EIP1559GasPriceProvider, ETHGasStationInfoProvider, LegacyGasPriceProvider, NodeJSCache, OnChainGasPriceProvider, OnChainQuoteProvider, StaticV2SubgraphProvider, StaticV3SubgraphProvider, SwapRouterProvider, TokenPropertiesProvider, UniswapMulticallProvider, URISubgraphProvider, V2QuoteProvider, V2SubgraphProviderWithFallBacks, V3SubgraphProviderWithFallBacks, } from '../../providers';
import { CachingTokenListProvider, } from '../../providers/caching-token-list-provider';
import { PortionProvider, } from '../../providers/portion-provider';
import { OnChainTokenFeeFetcher } from '../../providers/token-fee-fetcher';
import { TokenProvider } from '../../providers/token-provider';
import { TokenValidatorProvider, } from '../../providers/token-validator-provider';
import { V2PoolProvider, } from '../../providers/v2/pool-provider';
import { ArbitrumGasDataProvider, OptimismGasDataProvider, } from '../../providers/v3/gas-data-provider';
import { V3PoolProvider, } from '../../providers/v3/pool-provider';
import DEFAULT_TOKEN_LIST from '../../tokenList.json';
import { Erc20__factory } from '../../types/other/factories/Erc20__factory';
import { SWAP_ROUTER_02_ADDRESSES, WRAPPED_NATIVE_CURRENCY } from '../../util';
import { CurrencyAmount } from '../../util/amounts';
import { ID_TO_CHAIN_ID, ID_TO_NETWORK_NAME, V2_SUPPORTED, } from '../../util/chains';
import { getHighestLiquidityV3NativePool, getHighestLiquidityV3USDPool, } from '../../util/gas-factory-helpers';
import { log } from '../../util/log';
import { buildSwapMethodParameters, buildTrade, } from '../../util/methodParameters';
import { metric, MetricLoggerUnit } from '../../util/metric';
import { UNSUPPORTED_TOKENS } from '../../util/unsupported-tokens';
import { SwapToRatioStatus, } from '../router';
import { DEFAULT_ROUTING_CONFIG_BY_CHAIN, ETH_GAS_STATION_API_URL, } from './config';
import { getBestSwapRoute } from './functions/best-swap-route';
import { calculateRatioAmountIn } from './functions/calculate-ratio-amount-in';
import { getV2CandidatePools, getV3CandidatePools, } from './functions/get-candidate-pools';
import { MixedRouteHeuristicGasModelFactory } from './gas-models/mixedRoute/mixed-route-heuristic-gas-model';
import { V2HeuristicGasModelFactory } from './gas-models/v2/v2-heuristic-gas-model';
import { NATIVE_OVERHEAD } from './gas-models/v3/gas-costs';
import { V3HeuristicGasModelFactory } from './gas-models/v3/v3-heuristic-gas-model';
import { MixedQuoter, V2Quoter, V3Quoter } from './quoters';
export class MapWithLowerCaseKey extends Map {
    set(key, value) {
        return super.set(key.toLowerCase(), value);
    }
}
export class LowerCaseStringArray extends Array {
    constructor(...items) {
        // Convert all items to lowercase before calling the parent constructor
        super(...items.map((item) => item.toLowerCase()));
    }
}
export class AlphaRouter {
    constructor({ chainId, provider, multicall2Provider, v3PoolProvider, onChainQuoteProvider, v2PoolProvider, v2QuoteProvider, v2SubgraphProvider, tokenProvider, blockedTokenListProvider, v3SubgraphProvider, gasPriceProvider, v3GasModelFactory, v2GasModelFactory, mixedRouteGasModelFactory, swapRouterProvider, optimismGasDataProvider, tokenValidatorProvider, arbitrumGasDataProvider, simulator, routeCachingProvider, tokenPropertiesProvider, portionProvider, }) {
        this.chainId = chainId;
        this.provider = provider;
        this.multicall2Provider =
            multicall2Provider !== null && multicall2Provider !== void 0 ? multicall2Provider : new UniswapMulticallProvider(chainId, provider, 375000);
        this.v3PoolProvider =
            v3PoolProvider !== null && v3PoolProvider !== void 0 ? v3PoolProvider : new CachingV3PoolProvider(this.chainId, new V3PoolProvider(ID_TO_CHAIN_ID(chainId), this.multicall2Provider), new NodeJSCache(new NodeCache({ stdTTL: 360, useClones: false })));
        this.simulator = simulator;
        this.routeCachingProvider = routeCachingProvider;
        if (onChainQuoteProvider) {
            this.onChainQuoteProvider = onChainQuoteProvider;
        }
        else {
            switch (chainId) {
                case ChainId.OPTIMISM:
                case ChainId.OPTIMISM_GOERLI:
                    this.onChainQuoteProvider = new OnChainQuoteProvider(chainId, provider, this.multicall2Provider, {
                        retries: 2,
                        minTimeout: 100,
                        maxTimeout: 1000,
                    }, {
                        multicallChunk: 110,
                        gasLimitPerCall: 1200000,
                        quoteMinSuccessRate: 0.1,
                    }, {
                        gasLimitOverride: 3000000,
                        multicallChunk: 45,
                    }, {
                        gasLimitOverride: 3000000,
                        multicallChunk: 45,
                    }, {
                        baseBlockOffset: -10,
                        rollback: {
                            enabled: true,
                            attemptsBeforeRollback: 1,
                            rollbackBlockOffset: -10,
                        },
                    });
                    break;
                case ChainId.BASE:
                case ChainId.BASE_GOERLI:
                    this.onChainQuoteProvider = new OnChainQuoteProvider(chainId, provider, this.multicall2Provider, {
                        retries: 2,
                        minTimeout: 100,
                        maxTimeout: 1000,
                    }, {
                        multicallChunk: 80,
                        gasLimitPerCall: 1200000,
                        quoteMinSuccessRate: 0.1,
                    }, {
                        gasLimitOverride: 3000000,
                        multicallChunk: 45,
                    }, {
                        gasLimitOverride: 3000000,
                        multicallChunk: 45,
                    }, {
                        baseBlockOffset: -10,
                        rollback: {
                            enabled: true,
                            attemptsBeforeRollback: 1,
                            rollbackBlockOffset: -10,
                        },
                    });
                    break;
                case ChainId.ARBITRUM_ONE:
                case ChainId.ARBITRUM_GOERLI:
                    this.onChainQuoteProvider = new OnChainQuoteProvider(chainId, provider, this.multicall2Provider, {
                        retries: 2,
                        minTimeout: 100,
                        maxTimeout: 1000,
                    }, {
                        multicallChunk: 10,
                        gasLimitPerCall: 12000000,
                        quoteMinSuccessRate: 0.1,
                    }, {
                        gasLimitOverride: 30000000,
                        multicallChunk: 6,
                    }, {
                        gasLimitOverride: 30000000,
                        multicallChunk: 6,
                    });
                    break;
                case ChainId.CELO:
                case ChainId.CELO_ALFAJORES:
                    this.onChainQuoteProvider = new OnChainQuoteProvider(chainId, provider, this.multicall2Provider, {
                        retries: 2,
                        minTimeout: 100,
                        maxTimeout: 1000,
                    }, {
                        multicallChunk: 10,
                        gasLimitPerCall: 5000000,
                        quoteMinSuccessRate: 0.1,
                    }, {
                        gasLimitOverride: 5000000,
                        multicallChunk: 5,
                    }, {
                        gasLimitOverride: 6250000,
                        multicallChunk: 4,
                    });
                    break;
                default:
                    this.onChainQuoteProvider = new OnChainQuoteProvider(chainId, provider, this.multicall2Provider, {
                        retries: 2,
                        minTimeout: 100,
                        maxTimeout: 1000,
                    }, {
                        multicallChunk: 210,
                        gasLimitPerCall: 705000,
                        quoteMinSuccessRate: 0.15,
                    }, {
                        gasLimitOverride: 2000000,
                        multicallChunk: 70,
                    });
                    break;
            }
        }
        if (tokenValidatorProvider) {
            this.tokenValidatorProvider = tokenValidatorProvider;
        }
        else if (this.chainId === ChainId.MAINNET) {
            this.tokenValidatorProvider = new TokenValidatorProvider(this.chainId, this.multicall2Provider, new NodeJSCache(new NodeCache({ stdTTL: 30000, useClones: false })));
        }
        if (tokenPropertiesProvider) {
            this.tokenPropertiesProvider = tokenPropertiesProvider;
        }
        else {
            this.tokenPropertiesProvider = new TokenPropertiesProvider(this.chainId, new NodeJSCache(new NodeCache({ stdTTL: 86400, useClones: false })), new OnChainTokenFeeFetcher(this.chainId, provider));
        }
        this.v2PoolProvider =
            v2PoolProvider !== null && v2PoolProvider !== void 0 ? v2PoolProvider : new CachingV2PoolProvider(chainId, new V2PoolProvider(chainId, this.multicall2Provider, this.tokenPropertiesProvider), new NodeJSCache(new NodeCache({ stdTTL: 60, useClones: false })));
        this.v2QuoteProvider = v2QuoteProvider !== null && v2QuoteProvider !== void 0 ? v2QuoteProvider : new V2QuoteProvider();
        this.blockedTokenListProvider =
            blockedTokenListProvider !== null && blockedTokenListProvider !== void 0 ? blockedTokenListProvider : new CachingTokenListProvider(chainId, UNSUPPORTED_TOKENS, new NodeJSCache(new NodeCache({ stdTTL: 3600, useClones: false })));
        this.tokenProvider =
            tokenProvider !== null && tokenProvider !== void 0 ? tokenProvider : new CachingTokenProviderWithFallback(chainId, new NodeJSCache(new NodeCache({ stdTTL: 3600, useClones: false })), new CachingTokenListProvider(chainId, DEFAULT_TOKEN_LIST, new NodeJSCache(new NodeCache({ stdTTL: 3600, useClones: false }))), new TokenProvider(chainId, this.multicall2Provider));
        this.portionProvider = portionProvider !== null && portionProvider !== void 0 ? portionProvider : new PortionProvider();
        const chainName = ID_TO_NETWORK_NAME(chainId);
        // @TODO: Testing only approach
        const getSubgraphV2Url = () => {
            // if (chainId === ChainId.UNREAL) {
            //   return 'https://yellow-convinced-barracuda-669.mypinata.cloud/ipfs/QmbFMke1KXqnYyBBWxB74N4c5SBnJMVAiMNRcGu6x1AwQH';
            // }
            return `https://cloudflare-ipfs.com/ipns/api.uniswap.org/v1/pools/v2/${chainName}.json`;
        };
        const getSubgraphV3Url = () => {
            // if (chainId === ChainId.UNREAL) {
            //   return 'https://yellow-convinced-barracuda-669.mypinata.cloud/ipfs/QmbJWAESqCsf4RFCqEY7jecCashj8usXiyDNfKtZCwwzGb';
            // }
            return `https://cloudflare-ipfs.com/ipns/api.uniswap.org/v1/pools/v3/${chainName}.json`;
        };
        // ipfs urls in the following format: `https://cloudflare-ipfs.com/ipns/api.uniswap.org/v1/pools/${protocol}/${chainName}.json`;
        if (v2SubgraphProvider) {
            this.v2SubgraphProvider = v2SubgraphProvider;
        }
        else {
            this.v2SubgraphProvider = new V2SubgraphProviderWithFallBacks([
                new CachingV2SubgraphProvider(chainId, new URISubgraphProvider(chainId, getSubgraphV2Url(), undefined, 0), new NodeJSCache(new NodeCache({ stdTTL: 300, useClones: false }))),
                new StaticV2SubgraphProvider(chainId),
            ]);
        }
        if (v3SubgraphProvider) {
            this.v3SubgraphProvider = v3SubgraphProvider;
        }
        else {
            this.v3SubgraphProvider = new V3SubgraphProviderWithFallBacks([
                new CachingV3SubgraphProvider(chainId, new URISubgraphProvider(chainId, getSubgraphV3Url(), undefined, 0), new NodeJSCache(new NodeCache({ stdTTL: 300, useClones: false }))),
                new StaticV3SubgraphProvider(chainId, this.v3PoolProvider),
            ]);
        }
        let gasPriceProviderInstance;
        if (JsonRpcProvider.isProvider(this.provider)) {
            gasPriceProviderInstance = new OnChainGasPriceProvider(chainId, new EIP1559GasPriceProvider(this.provider), new LegacyGasPriceProvider(this.provider));
        }
        else {
            gasPriceProviderInstance = new ETHGasStationInfoProvider(ETH_GAS_STATION_API_URL);
        }
        this.gasPriceProvider =
            gasPriceProvider !== null && gasPriceProvider !== void 0 ? gasPriceProvider : new CachingGasStationProvider(chainId, gasPriceProviderInstance, new NodeJSCache(new NodeCache({ stdTTL: 7, useClones: false })));
        this.v3GasModelFactory =
            v3GasModelFactory !== null && v3GasModelFactory !== void 0 ? v3GasModelFactory : new V3HeuristicGasModelFactory();
        this.v2GasModelFactory =
            v2GasModelFactory !== null && v2GasModelFactory !== void 0 ? v2GasModelFactory : new V2HeuristicGasModelFactory();
        this.mixedRouteGasModelFactory =
            mixedRouteGasModelFactory !== null && mixedRouteGasModelFactory !== void 0 ? mixedRouteGasModelFactory : new MixedRouteHeuristicGasModelFactory();
        this.swapRouterProvider =
            swapRouterProvider !== null && swapRouterProvider !== void 0 ? swapRouterProvider : new SwapRouterProvider(this.multicall2Provider, this.chainId);
        if (chainId === ChainId.OPTIMISM || chainId === ChainId.BASE) {
            this.l2GasDataProvider =
                optimismGasDataProvider !== null && optimismGasDataProvider !== void 0 ? optimismGasDataProvider : new OptimismGasDataProvider(chainId, this.multicall2Provider);
        }
        if (chainId === ChainId.ARBITRUM_ONE ||
            chainId === ChainId.ARBITRUM_GOERLI) {
            this.l2GasDataProvider =
                arbitrumGasDataProvider !== null && arbitrumGasDataProvider !== void 0 ? arbitrumGasDataProvider : new ArbitrumGasDataProvider(chainId, this.provider);
        }
        // Initialize the Quoters.
        // Quoters are an abstraction encapsulating the business logic of fetching routes and quotes.
        this.v2Quoter = new V2Quoter(this.v2SubgraphProvider, this.v2PoolProvider, this.v2QuoteProvider, this.v2GasModelFactory, this.tokenProvider, this.chainId, this.blockedTokenListProvider, this.tokenValidatorProvider);
        this.v3Quoter = new V3Quoter(this.v3SubgraphProvider, this.v3PoolProvider, this.onChainQuoteProvider, this.tokenProvider, this.chainId, this.blockedTokenListProvider, this.tokenValidatorProvider);
        this.mixedQuoter = new MixedQuoter(this.v3SubgraphProvider, this.v3PoolProvider, this.v2SubgraphProvider, this.v2PoolProvider, this.onChainQuoteProvider, this.tokenProvider, this.chainId, this.blockedTokenListProvider, this.tokenValidatorProvider);
    }
    async routeToRatio(token0Balance, token1Balance, position, swapAndAddConfig, swapAndAddOptions, routingConfig = DEFAULT_ROUTING_CONFIG_BY_CHAIN(this.chainId)) {
        if (token1Balance.currency.wrapped.sortsBefore(token0Balance.currency.wrapped)) {
            [token0Balance, token1Balance] = [token1Balance, token0Balance];
        }
        let preSwapOptimalRatio = this.calculateOptimalRatio(position, position.pool.sqrtRatioX96, true);
        // set up parameters according to which token will be swapped
        let zeroForOne;
        if (position.pool.tickCurrent > position.tickUpper) {
            zeroForOne = true;
        }
        else if (position.pool.tickCurrent < position.tickLower) {
            zeroForOne = false;
        }
        else {
            zeroForOne = new Fraction(token0Balance.quotient, token1Balance.quotient).greaterThan(preSwapOptimalRatio);
            if (!zeroForOne)
                preSwapOptimalRatio = preSwapOptimalRatio.invert();
        }
        const [inputBalance, outputBalance] = zeroForOne
            ? [token0Balance, token1Balance]
            : [token1Balance, token0Balance];
        let optimalRatio = preSwapOptimalRatio;
        let postSwapTargetPool = position.pool;
        let exchangeRate = zeroForOne
            ? position.pool.token0Price
            : position.pool.token1Price;
        let swap = null;
        let ratioAchieved = false;
        let n = 0;
        // iterate until we find a swap with a sufficient ratio or return null
        while (!ratioAchieved) {
            n++;
            if (n > swapAndAddConfig.maxIterations) {
                log.info('max iterations exceeded');
                return {
                    status: SwapToRatioStatus.NO_ROUTE_FOUND,
                    error: 'max iterations exceeded',
                };
            }
            const amountToSwap = calculateRatioAmountIn(optimalRatio, exchangeRate, inputBalance, outputBalance);
            if (amountToSwap.equalTo(0)) {
                log.info(`no swap needed: amountToSwap = 0`);
                return {
                    status: SwapToRatioStatus.NO_SWAP_NEEDED,
                };
            }
            swap = await this.route(amountToSwap, outputBalance.currency, TradeType.EXACT_INPUT, undefined, {
                ...DEFAULT_ROUTING_CONFIG_BY_CHAIN(this.chainId),
                ...routingConfig,
                /// @dev We do not want to query for mixedRoutes for routeToRatio as they are not supported
                /// [Protocol.V3, Protocol.V2] will make sure we only query for V3 and V2
                protocols: [Protocol.V3, Protocol.V2],
            });
            if (!swap) {
                log.info('no route found from this.route()');
                return {
                    status: SwapToRatioStatus.NO_ROUTE_FOUND,
                    error: 'no route found',
                };
            }
            const inputBalanceUpdated = inputBalance.subtract(swap.trade.inputAmount);
            const outputBalanceUpdated = outputBalance.add(swap.trade.outputAmount);
            const newRatio = inputBalanceUpdated.divide(outputBalanceUpdated);
            let targetPoolPriceUpdate;
            swap.route.forEach((route) => {
                if (route.protocol === Protocol.V3) {
                    const v3Route = route;
                    v3Route.route.pools.forEach((pool, i) => {
                        if (pool.token0.equals(position.pool.token0) &&
                            pool.token1.equals(position.pool.token1) &&
                            pool.fee === position.pool.fee) {
                            targetPoolPriceUpdate = JSBI.BigInt(v3Route.sqrtPriceX96AfterList[i].toString());
                            optimalRatio = this.calculateOptimalRatio(position, JSBI.BigInt(targetPoolPriceUpdate.toString()), zeroForOne);
                        }
                    });
                }
            });
            if (!targetPoolPriceUpdate) {
                optimalRatio = preSwapOptimalRatio;
            }
            ratioAchieved =
                newRatio.equalTo(optimalRatio) ||
                    this.absoluteValue(newRatio.asFraction.divide(optimalRatio).subtract(1)).lessThan(swapAndAddConfig.ratioErrorTolerance);
            if (ratioAchieved && targetPoolPriceUpdate) {
                postSwapTargetPool = new Pool(position.pool.token0, position.pool.token1, position.pool.fee, targetPoolPriceUpdate, position.pool.liquidity, TickMath.getTickAtSqrtRatio(targetPoolPriceUpdate), position.pool.tickDataProvider);
            }
            exchangeRate = swap.trade.outputAmount.divide(swap.trade.inputAmount);
            log.info({
                exchangeRate: exchangeRate.asFraction.toFixed(18),
                optimalRatio: optimalRatio.asFraction.toFixed(18),
                newRatio: newRatio.asFraction.toFixed(18),
                inputBalanceUpdated: inputBalanceUpdated.asFraction.toFixed(18),
                outputBalanceUpdated: outputBalanceUpdated.asFraction.toFixed(18),
                ratioErrorTolerance: swapAndAddConfig.ratioErrorTolerance.toFixed(18),
                iterationN: n.toString(),
            }, 'QuoteToRatio Iteration Parameters');
            if (exchangeRate.equalTo(0)) {
                log.info('exchangeRate to 0');
                return {
                    status: SwapToRatioStatus.NO_ROUTE_FOUND,
                    error: 'insufficient liquidity to swap to optimal ratio',
                };
            }
        }
        if (!swap) {
            return {
                status: SwapToRatioStatus.NO_ROUTE_FOUND,
                error: 'no route found',
            };
        }
        let methodParameters;
        if (swapAndAddOptions) {
            methodParameters = await this.buildSwapAndAddMethodParameters(swap.trade, swapAndAddOptions, {
                initialBalanceTokenIn: inputBalance,
                initialBalanceTokenOut: outputBalance,
                preLiquidityPosition: position,
            });
        }
        return {
            status: SwapToRatioStatus.SUCCESS,
            result: { ...swap, methodParameters, optimalRatio, postSwapTargetPool },
        };
    }
    /**
     * @inheritdoc IRouter
     */
    async route(amount, quoteCurrency, tradeType, swapConfig, partialRoutingConfig = {}) {
        var _a, _c, _d, _e;
        const originalAmount = amount;
        if (tradeType === TradeType.EXACT_OUTPUT) {
            const portionAmount = this.portionProvider.getPortionAmount(amount, tradeType, swapConfig);
            if (portionAmount && portionAmount.greaterThan(ZERO)) {
                // In case of exact out swap, before we route, we need to make sure that the
                // token out amount accounts for flat portion, and token in amount after the best swap route contains the token in equivalent of portion.
                // In other words, in case a pool's LP fee bps is lower than the portion bps (0.01%/0.05% for v3), a pool can go insolvency.
                // This is because instead of the swapper being responsible for the portion,
                // the pool instead gets responsible for the portion.
                // The addition below avoids that situation.
                amount = amount.add(portionAmount);
            }
        }
        const { currencyIn, currencyOut } = this.determineCurrencyInOutFromTradeType(tradeType, amount, quoteCurrency);
        const tokenIn = currencyIn.wrapped;
        const tokenOut = currencyOut.wrapped;
        metric.setProperty('chainId', this.chainId);
        metric.setProperty('pair', `${tokenIn.symbol}/${tokenOut.symbol}`);
        metric.setProperty('tokenIn', tokenIn.address);
        metric.setProperty('tokenOut', tokenOut.address);
        metric.setProperty('tradeType', tradeType === TradeType.EXACT_INPUT ? 'ExactIn' : 'ExactOut');
        metric.putMetric(`QuoteRequestedForChain${this.chainId}`, 1, MetricLoggerUnit.Count);
        // Get a block number to specify in all our calls. Ensures data we fetch from chain is
        // from the same block.
        const blockNumber = (_a = partialRoutingConfig.blockNumber) !== null && _a !== void 0 ? _a : this.getBlockNumberPromise();
        const routingConfig = _.merge({
            // These settings could be changed by the partialRoutingConfig
            useCachedRoutes: true,
            writeToCachedRoutes: true,
            optimisticCachedRoutes: false,
        }, DEFAULT_ROUTING_CONFIG_BY_CHAIN(this.chainId), partialRoutingConfig, { blockNumber });
        if (routingConfig.debugRouting) {
            log.warn(`Finalized routing config is ${JSON.stringify(routingConfig)}`);
        }
        const gasPriceWei = await this.getGasPriceWei(await blockNumber, await partialRoutingConfig.blockNumber);
        const quoteToken = quoteCurrency.wrapped;
        // const gasTokenAccessor = await this.tokenProvider.getTokens([routingConfig.gasToken!]);
        const gasToken = routingConfig.gasToken
            ? (await this.tokenProvider.getTokens([routingConfig.gasToken])).getTokenByAddress(routingConfig.gasToken)
            : undefined;
        const providerConfig = {
            ...routingConfig,
            blockNumber,
            additionalGasOverhead: NATIVE_OVERHEAD(this.chainId, amount.currency, quoteCurrency),
            gasToken,
        };
        const [v3GasModel, mixedRouteGasModel] = await this.getGasModels(gasPriceWei, amount.currency.wrapped, quoteToken, providerConfig);
        // Create a Set to sanitize the protocols input, a Set of undefined becomes an empty set,
        // Then create an Array from the values of that Set.
        const protocols = Array.from(new Set(routingConfig.protocols).values());
        const cacheMode = (_c = routingConfig.overwriteCacheMode) !== null && _c !== void 0 ? _c : (await ((_d = this.routeCachingProvider) === null || _d === void 0 ? void 0 : _d.getCacheMode(this.chainId, amount, quoteToken, tradeType, protocols)));
        // Fetch CachedRoutes
        let cachedRoutes;
        if (routingConfig.useCachedRoutes && cacheMode !== CacheMode.Darkmode) {
            cachedRoutes = await ((_e = this.routeCachingProvider) === null || _e === void 0 ? void 0 : _e.getCachedRoute(this.chainId, amount, quoteToken, tradeType, protocols, await blockNumber, routingConfig.optimisticCachedRoutes));
        }
        metric.putMetric(routingConfig.useCachedRoutes
            ? 'GetQuoteUsingCachedRoutes'
            : 'GetQuoteNotUsingCachedRoutes', 1, MetricLoggerUnit.Count);
        if (cacheMode &&
            routingConfig.useCachedRoutes &&
            cacheMode !== CacheMode.Darkmode &&
            !cachedRoutes) {
            metric.putMetric(`GetCachedRoute_miss_${cacheMode}`, 1, MetricLoggerUnit.Count);
            log.info({
                tokenIn: tokenIn.symbol,
                tokenInAddress: tokenIn.address,
                tokenOut: tokenOut.symbol,
                tokenOutAddress: tokenOut.address,
                cacheMode,
                amount: amount.toExact(),
                chainId: this.chainId,
                tradeType: this.tradeTypeStr(tradeType),
            }, `GetCachedRoute miss ${cacheMode} for ${this.tokenPairSymbolTradeTypeChainId(tokenIn, tokenOut, tradeType)}`);
        }
        else if (cachedRoutes && routingConfig.useCachedRoutes) {
            metric.putMetric(`GetCachedRoute_hit_${cacheMode}`, 1, MetricLoggerUnit.Count);
            log.info({
                tokenIn: tokenIn.symbol,
                tokenInAddress: tokenIn.address,
                tokenOut: tokenOut.symbol,
                tokenOutAddress: tokenOut.address,
                cacheMode,
                amount: amount.toExact(),
                chainId: this.chainId,
                tradeType: this.tradeTypeStr(tradeType),
            }, `GetCachedRoute hit ${cacheMode} for ${this.tokenPairSymbolTradeTypeChainId(tokenIn, tokenOut, tradeType)}`);
        }
        let swapRouteFromCachePromise = Promise.resolve(null);
        if (cachedRoutes) {
            swapRouteFromCachePromise = this.getSwapRouteFromCache(cachedRoutes, await blockNumber, amount, quoteToken, tradeType, routingConfig, v3GasModel, mixedRouteGasModel, gasPriceWei, swapConfig);
        }
        let swapRouteFromChainPromise = Promise.resolve(null);
        if (!cachedRoutes || cacheMode !== CacheMode.Livemode) {
            swapRouteFromChainPromise = this.getSwapRouteFromChain(amount, tokenIn, tokenOut, protocols, quoteToken, tradeType, routingConfig, v3GasModel, mixedRouteGasModel, gasPriceWei, swapConfig);
        }
        const [swapRouteFromCache, swapRouteFromChain] = await Promise.all([
            swapRouteFromCachePromise,
            swapRouteFromChainPromise,
        ]);
        let swapRouteRaw;
        let hitsCachedRoute = false;
        if (cacheMode === CacheMode.Livemode && swapRouteFromCache) {
            log.info(`CacheMode is ${cacheMode}, and we are using swapRoute from cache`);
            hitsCachedRoute = true;
            swapRouteRaw = swapRouteFromCache;
        }
        else {
            log.info(`CacheMode is ${cacheMode}, and we are using materialized swapRoute`);
            swapRouteRaw = swapRouteFromChain;
        }
        if (cacheMode === CacheMode.Tapcompare &&
            swapRouteFromCache &&
            swapRouteFromChain) {
            const quoteDiff = swapRouteFromChain.quote.subtract(swapRouteFromCache.quote);
            const quoteGasAdjustedDiff = swapRouteFromChain.quoteGasAdjusted.subtract(swapRouteFromCache.quoteGasAdjusted);
            const gasUsedDiff = swapRouteFromChain.estimatedGasUsed.sub(swapRouteFromCache.estimatedGasUsed);
            // Only log if quoteDiff is different from 0, or if quoteGasAdjustedDiff and gasUsedDiff are both different from 0
            if (!quoteDiff.equalTo(0) ||
                !(quoteGasAdjustedDiff.equalTo(0) || gasUsedDiff.eq(0))) {
                // Calculates the percentage of the difference with respect to the quoteFromChain (not from cache)
                const misquotePercent = quoteGasAdjustedDiff
                    .divide(swapRouteFromChain.quoteGasAdjusted)
                    .multiply(100);
                metric.putMetric(`TapcompareCachedRoute_quoteGasAdjustedDiffPercent`, Number(misquotePercent.toExact()), MetricLoggerUnit.Percent);
                log.warn({
                    quoteFromChain: swapRouteFromChain.quote.toExact(),
                    quoteFromCache: swapRouteFromCache.quote.toExact(),
                    quoteDiff: quoteDiff.toExact(),
                    quoteGasAdjustedFromChain: swapRouteFromChain.quoteGasAdjusted.toExact(),
                    quoteGasAdjustedFromCache: swapRouteFromCache.quoteGasAdjusted.toExact(),
                    quoteGasAdjustedDiff: quoteGasAdjustedDiff.toExact(),
                    gasUsedFromChain: swapRouteFromChain.estimatedGasUsed.toString(),
                    gasUsedFromCache: swapRouteFromCache.estimatedGasUsed.toString(),
                    gasUsedDiff: gasUsedDiff.toString(),
                    routesFromChain: swapRouteFromChain.routes.toString(),
                    routesFromCache: swapRouteFromCache.routes.toString(),
                    amount: amount.toExact(),
                    originalAmount: cachedRoutes === null || cachedRoutes === void 0 ? void 0 : cachedRoutes.originalAmount,
                    pair: this.tokenPairSymbolTradeTypeChainId(tokenIn, tokenOut, tradeType),
                    blockNumber,
                }, `Comparing quotes between Chain and Cache for ${this.tokenPairSymbolTradeTypeChainId(tokenIn, tokenOut, tradeType)}`);
            }
        }
        if (!swapRouteRaw) {
            return null;
        }
        const { quote, quoteGasAdjusted, estimatedGasUsed, routes: routeAmounts, estimatedGasUsedQuoteToken, estimatedGasUsedUSD, estimatedGasUsedGasToken, } = swapRouteRaw;
        if (this.routeCachingProvider &&
            routingConfig.writeToCachedRoutes &&
            cacheMode !== CacheMode.Darkmode &&
            swapRouteFromChain) {
            // Generate the object to be cached
            const routesToCache = CachedRoutes.fromRoutesWithValidQuotes(swapRouteFromChain.routes, this.chainId, tokenIn, tokenOut, protocols.sort(), // sort it for consistency in the order of the protocols.
            await blockNumber, tradeType, amount.toExact());
            if (routesToCache) {
                // Attempt to insert the entry in cache. This is fire and forget promise.
                // The catch method will prevent any exception from blocking the normal code execution.
                this.routeCachingProvider
                    .setCachedRoute(routesToCache, amount)
                    .then((success) => {
                    const status = success ? 'success' : 'rejected';
                    metric.putMetric(`SetCachedRoute_${status}`, 1, MetricLoggerUnit.Count);
                })
                    .catch((reason) => {
                    log.error({
                        reason: reason,
                        tokenPair: this.tokenPairSymbolTradeTypeChainId(tokenIn, tokenOut, tradeType),
                    }, `SetCachedRoute failure`);
                    metric.putMetric(`SetCachedRoute_failure`, 1, MetricLoggerUnit.Count);
                });
            }
            else {
                metric.putMetric(`SetCachedRoute_unnecessary`, 1, MetricLoggerUnit.Count);
            }
        }
        metric.putMetric(`QuoteFoundForChain${this.chainId}`, 1, MetricLoggerUnit.Count);
        // Build Trade object that represents the optimal swap.
        const trade = buildTrade(currencyIn, currencyOut, tradeType, routeAmounts);
        let methodParameters;
        // If user provided recipient, deadline etc. we also generate the calldata required to execute
        // the swap and return it too.
        if (swapConfig) {
            methodParameters = buildSwapMethodParameters(trade, swapConfig, this.chainId);
        }
        const tokenOutAmount = tradeType === TradeType.EXACT_OUTPUT
            ? originalAmount // we need to pass in originalAmount instead of amount, because amount already added portionAmount in case of exact out swap
            : quote;
        const portionAmount = this.portionProvider.getPortionAmount(tokenOutAmount, tradeType, swapConfig);
        const portionQuoteAmount = this.portionProvider.getPortionQuoteAmount(tradeType, quote, amount, // we need to pass in amount instead of originalAmount here, because amount here needs to add the portion for exact out
        portionAmount);
        // we need to correct quote and quote gas adjusted for exact output when portion is part of the exact out swap
        const correctedQuote = this.portionProvider.getQuote(tradeType, quote, portionQuoteAmount);
        const correctedQuoteGasAdjusted = this.portionProvider.getQuoteGasAdjusted(tradeType, quoteGasAdjusted, portionQuoteAmount);
        const quoteGasAndPortionAdjusted = this.portionProvider.getQuoteGasAndPortionAdjusted(tradeType, quoteGasAdjusted, portionAmount);
        const swapRoute = {
            quote: correctedQuote,
            quoteGasAdjusted: correctedQuoteGasAdjusted,
            estimatedGasUsed,
            estimatedGasUsedQuoteToken,
            estimatedGasUsedUSD,
            estimatedGasUsedGasToken,
            gasPriceWei,
            route: routeAmounts,
            trade,
            methodParameters,
            blockNumber: BigNumber.from(await blockNumber),
            hitsCachedRoute: hitsCachedRoute,
            portionAmount: portionAmount,
            quoteGasAndPortionAdjusted: quoteGasAndPortionAdjusted,
        };
        if (swapConfig &&
            swapConfig.simulate &&
            methodParameters &&
            methodParameters.calldata) {
            if (!this.simulator) {
                throw new Error('Simulator not initialized!');
            }
            log.info(JSON.stringify({ swapConfig, methodParameters, providerConfig }, null, 2), `Starting simulation`);
            const fromAddress = swapConfig.simulate.fromAddress;
            const beforeSimulate = Date.now();
            const swapRouteWithSimulation = await this.simulator.simulate(fromAddress, swapConfig, swapRoute, amount, 
            // Quote will be in WETH even if quoteCurrency is ETH
            // So we init a new CurrencyAmount object here
            CurrencyAmount.fromRawAmount(quoteCurrency, quote.quotient.toString()), this.l2GasDataProvider
                ? await this.l2GasDataProvider.getGasData(providerConfig)
                : undefined, providerConfig);
            metric.putMetric('SimulateTransaction', Date.now() - beforeSimulate, MetricLoggerUnit.Milliseconds);
            return swapRouteWithSimulation;
        }
        return swapRoute;
    }
    async getSwapRouteFromCache(cachedRoutes, blockNumber, amount, quoteToken, tradeType, routingConfig, v3GasModel, mixedRouteGasModel, gasPriceWei, swapConfig) {
        log.info({
            protocols: cachedRoutes.protocolsCovered,
            tradeType: cachedRoutes.tradeType,
            cachedBlockNumber: cachedRoutes.blockNumber,
            quoteBlockNumber: blockNumber,
        }, 'Routing across CachedRoute');
        const quotePromises = [];
        const v3Routes = cachedRoutes.routes.filter((route) => route.protocol === Protocol.V3);
        const v2Routes = cachedRoutes.routes.filter((route) => route.protocol === Protocol.V2);
        const mixedRoutes = cachedRoutes.routes.filter((route) => route.protocol === Protocol.MIXED);
        let percents;
        let amounts;
        if (cachedRoutes.routes.length > 1) {
            // If we have more than 1 route, we will quote the different percents for it, following the regular process
            [percents, amounts] = this.getAmountDistribution(amount, routingConfig);
        }
        else if (cachedRoutes.routes.length == 1) {
            [percents, amounts] = [[100], [amount]];
        }
        else {
            // In this case this means that there's no route, so we return null
            return Promise.resolve(null);
        }
        if (v3Routes.length > 0) {
            const v3RoutesFromCache = v3Routes.map((cachedRoute) => cachedRoute.route);
            metric.putMetric('SwapRouteFromCache_V3_GetQuotes_Request', 1, MetricLoggerUnit.Count);
            const beforeGetQuotes = Date.now();
            quotePromises.push(this.v3Quoter
                .getQuotes(v3RoutesFromCache, amounts, percents, quoteToken, tradeType, routingConfig, undefined, v3GasModel)
                .then((result) => {
                metric.putMetric(`SwapRouteFromCache_V3_GetQuotes_Load`, Date.now() - beforeGetQuotes, MetricLoggerUnit.Milliseconds);
                return result;
            }));
        }
        if (v2Routes.length > 0) {
            const v2RoutesFromCache = v2Routes.map((cachedRoute) => cachedRoute.route);
            metric.putMetric('SwapRouteFromCache_V2_GetQuotes_Request', 1, MetricLoggerUnit.Count);
            const beforeGetQuotes = Date.now();
            quotePromises.push(this.v2Quoter
                .refreshRoutesThenGetQuotes(cachedRoutes.tokenIn, cachedRoutes.tokenOut, v2RoutesFromCache, amounts, percents, quoteToken, tradeType, routingConfig, gasPriceWei)
                .then((result) => {
                metric.putMetric(`SwapRouteFromCache_V2_GetQuotes_Load`, Date.now() - beforeGetQuotes, MetricLoggerUnit.Milliseconds);
                return result;
            }));
        }
        if (mixedRoutes.length > 0) {
            const mixedRoutesFromCache = mixedRoutes.map((cachedRoute) => cachedRoute.route);
            metric.putMetric('SwapRouteFromCache_Mixed_GetQuotes_Request', 1, MetricLoggerUnit.Count);
            const beforeGetQuotes = Date.now();
            quotePromises.push(this.mixedQuoter
                .getQuotes(mixedRoutesFromCache, amounts, percents, quoteToken, tradeType, routingConfig, undefined, mixedRouteGasModel)
                .then((result) => {
                metric.putMetric(`SwapRouteFromCache_Mixed_GetQuotes_Load`, Date.now() - beforeGetQuotes, MetricLoggerUnit.Milliseconds);
                return result;
            }));
        }
        const getQuotesResults = await Promise.all(quotePromises);
        const allRoutesWithValidQuotes = _.flatMap(getQuotesResults, (quoteResult) => quoteResult.routesWithValidQuotes);
        return getBestSwapRoute(amount, percents, allRoutesWithValidQuotes, tradeType, this.chainId, routingConfig, this.portionProvider, v3GasModel, swapConfig);
    }
    async getSwapRouteFromChain(amount, tokenIn, tokenOut, protocols, quoteToken, tradeType, routingConfig, v3GasModel, mixedRouteGasModel, gasPriceWei, swapConfig) {
        // Generate our distribution of amounts, i.e. fractions of the input amount.
        // We will get quotes for fractions of the input amount for different routes, then
        // combine to generate split routes.
        const [percents, amounts] = this.getAmountDistribution(amount, routingConfig);
        const noProtocolsSpecified = protocols.length === 0;
        const v3ProtocolSpecified = protocols.includes(Protocol.V3);
        const v2ProtocolSpecified = protocols.includes(Protocol.V2);
        const v2SupportedInChain = V2_SUPPORTED.includes(this.chainId);
        const shouldQueryMixedProtocol = protocols.includes(Protocol.MIXED) ||
            (noProtocolsSpecified && v2SupportedInChain);
        const mixedProtocolAllowed = [ChainId.MAINNET, ChainId.GOERLI].includes(this.chainId) &&
            tradeType === TradeType.EXACT_INPUT;
        const beforeGetCandidates = Date.now();
        let v3CandidatePoolsPromise = Promise.resolve(undefined);
        if (v3ProtocolSpecified ||
            noProtocolsSpecified ||
            (shouldQueryMixedProtocol && mixedProtocolAllowed)) {
            v3CandidatePoolsPromise = getV3CandidatePools({
                tokenIn,
                tokenOut,
                tokenProvider: this.tokenProvider,
                blockedTokenListProvider: this.blockedTokenListProvider,
                poolProvider: this.v3PoolProvider,
                routeType: tradeType,
                subgraphProvider: this.v3SubgraphProvider,
                routingConfig,
                chainId: this.chainId,
            }).then((candidatePools) => {
                metric.putMetric('GetV3CandidatePools', Date.now() - beforeGetCandidates, MetricLoggerUnit.Milliseconds);
                return candidatePools;
            });
        }
        let v2CandidatePoolsPromise = Promise.resolve(undefined);
        if ((v2SupportedInChain && (v2ProtocolSpecified || noProtocolsSpecified)) ||
            (shouldQueryMixedProtocol && mixedProtocolAllowed)) {
            // Fetch all the pools that we will consider routing via. There are thousands
            // of pools, so we filter them to a set of candidate pools that we expect will
            // result in good prices.
            v2CandidatePoolsPromise = getV2CandidatePools({
                tokenIn,
                tokenOut,
                tokenProvider: this.tokenProvider,
                blockedTokenListProvider: this.blockedTokenListProvider,
                poolProvider: this.v2PoolProvider,
                routeType: tradeType,
                subgraphProvider: this.v2SubgraphProvider,
                routingConfig,
                chainId: this.chainId,
            }).then((candidatePools) => {
                metric.putMetric('GetV2CandidatePools', Date.now() - beforeGetCandidates, MetricLoggerUnit.Milliseconds);
                return candidatePools;
            });
        }
        const quotePromises = [];
        // Maybe Quote V3 - if V3 is specified, or no protocol is specified
        if (v3ProtocolSpecified || noProtocolsSpecified) {
            log.info({ protocols, tradeType }, 'Routing across V3');
            metric.putMetric('SwapRouteFromChain_V3_GetRoutesThenQuotes_Request', 1, MetricLoggerUnit.Count);
            const beforeGetRoutesThenQuotes = Date.now();
            quotePromises.push(v3CandidatePoolsPromise.then((v3CandidatePools) => this.v3Quoter
                .getRoutesThenQuotes(tokenIn, tokenOut, amount, amounts, percents, quoteToken, v3CandidatePools, tradeType, routingConfig, v3GasModel)
                .then((result) => {
                metric.putMetric(`SwapRouteFromChain_V3_GetRoutesThenQuotes_Load`, Date.now() - beforeGetRoutesThenQuotes, MetricLoggerUnit.Milliseconds);
                return result;
            })));
        }
        // Maybe Quote V2 - if V2 is specified, or no protocol is specified AND v2 is supported in this chain
        if (v2SupportedInChain && (v2ProtocolSpecified || noProtocolsSpecified)) {
            log.info({ protocols, tradeType }, 'Routing across V2');
            metric.putMetric('SwapRouteFromChain_V2_GetRoutesThenQuotes_Request', 1, MetricLoggerUnit.Count);
            const beforeGetRoutesThenQuotes = Date.now();
            quotePromises.push(v2CandidatePoolsPromise.then((v2CandidatePools) => this.v2Quoter
                .getRoutesThenQuotes(tokenIn, tokenOut, amount, amounts, percents, quoteToken, v2CandidatePools, tradeType, routingConfig, undefined, gasPriceWei)
                .then((result) => {
                metric.putMetric(`SwapRouteFromChain_V2_GetRoutesThenQuotes_Load`, Date.now() - beforeGetRoutesThenQuotes, MetricLoggerUnit.Milliseconds);
                return result;
            })));
        }
        // Maybe Quote mixed routes
        // if MixedProtocol is specified or no protocol is specified and v2 is supported AND tradeType is ExactIn
        // AND is Mainnet or Gorli
        if (shouldQueryMixedProtocol && mixedProtocolAllowed) {
            log.info({ protocols, tradeType }, 'Routing across MixedRoutes');
            metric.putMetric('SwapRouteFromChain_Mixed_GetRoutesThenQuotes_Request', 1, MetricLoggerUnit.Count);
            const beforeGetRoutesThenQuotes = Date.now();
            quotePromises.push(Promise.all([v3CandidatePoolsPromise, v2CandidatePoolsPromise]).then(([v3CandidatePools, v2CandidatePools]) => this.mixedQuoter
                .getRoutesThenQuotes(tokenIn, tokenOut, amount, amounts, percents, quoteToken, [v3CandidatePools, v2CandidatePools], tradeType, routingConfig, mixedRouteGasModel)
                .then((result) => {
                metric.putMetric(`SwapRouteFromChain_Mixed_GetRoutesThenQuotes_Load`, Date.now() - beforeGetRoutesThenQuotes, MetricLoggerUnit.Milliseconds);
                return result;
            })));
        }
        const getQuotesResults = await Promise.all(quotePromises);
        const allRoutesWithValidQuotes = [];
        const allCandidatePools = [];
        getQuotesResults.forEach((getQuoteResult) => {
            allRoutesWithValidQuotes.push(...getQuoteResult.routesWithValidQuotes);
            if (getQuoteResult.candidatePools) {
                allCandidatePools.push(getQuoteResult.candidatePools);
            }
        });
        if (allRoutesWithValidQuotes.length === 0) {
            log.info({ allRoutesWithValidQuotes }, 'Received no valid quotes');
            return null;
        }
        // Given all the quotes for all the amounts for all the routes, find the best combination.
        const bestSwapRoute = await getBestSwapRoute(amount, percents, allRoutesWithValidQuotes, tradeType, this.chainId, routingConfig, this.portionProvider, v3GasModel, swapConfig);
        if (bestSwapRoute) {
            this.emitPoolSelectionMetrics(bestSwapRoute, allCandidatePools);
        }
        return bestSwapRoute;
    }
    tradeTypeStr(tradeType) {
        return tradeType === TradeType.EXACT_INPUT ? 'ExactIn' : 'ExactOut';
    }
    tokenPairSymbolTradeTypeChainId(tokenIn, tokenOut, tradeType) {
        return `${tokenIn.symbol}/${tokenOut.symbol}/${this.tradeTypeStr(tradeType)}/${this.chainId}`;
    }
    determineCurrencyInOutFromTradeType(tradeType, amount, quoteCurrency) {
        if (tradeType === TradeType.EXACT_INPUT) {
            return {
                currencyIn: amount.currency,
                currencyOut: quoteCurrency,
            };
        }
        else {
            return {
                currencyIn: quoteCurrency,
                currencyOut: amount.currency,
            };
        }
    }
    async getGasPriceWei(latestBlockNumber, requestBlockNumber) {
        // Track how long it takes to resolve this async call.
        const beforeGasTimestamp = Date.now();
        // Get an estimate of the gas price to use when estimating gas cost of different routes.
        const { gasPriceWei } = await this.gasPriceProvider.getGasPrice(latestBlockNumber, requestBlockNumber);
        metric.putMetric('GasPriceLoad', Date.now() - beforeGasTimestamp, MetricLoggerUnit.Milliseconds);
        return gasPriceWei;
    }
    async getGasModels(gasPriceWei, amountToken, quoteToken, providerConfig) {
        const beforeGasModel = Date.now();
        const usdPoolPromise = getHighestLiquidityV3USDPool(this.chainId, this.v3PoolProvider, providerConfig);
        const nativeCurrency = WRAPPED_NATIVE_CURRENCY[this.chainId];
        const nativeAndQuoteTokenV3PoolPromise = !quoteToken.equals(nativeCurrency)
            ? getHighestLiquidityV3NativePool(quoteToken, this.v3PoolProvider, providerConfig)
            : Promise.resolve(null);
        const nativeAndAmountTokenV3PoolPromise = !amountToken.equals(nativeCurrency)
            ? getHighestLiquidityV3NativePool(amountToken, this.v3PoolProvider, providerConfig)
            : Promise.resolve(null);
        // If a specific gas token is specified in the provider config
        // fetch the highest liq V3 pool with it and the native currency
        const nativeAndSpecifiedGasTokenV3PoolPromise = (providerConfig === null || providerConfig === void 0 ? void 0 : providerConfig.gasToken) &&
            !(providerConfig === null || providerConfig === void 0 ? void 0 : providerConfig.gasToken.equals(nativeCurrency))
            ? getHighestLiquidityV3NativePool(providerConfig === null || providerConfig === void 0 ? void 0 : providerConfig.gasToken, this.v3PoolProvider, providerConfig)
            : Promise.resolve(null);
        const [usdPool, nativeAndQuoteTokenV3Pool, nativeAndAmountTokenV3Pool, nativeAndSpecifiedGasTokenV3Pool,] = await Promise.all([
            usdPoolPromise,
            nativeAndQuoteTokenV3PoolPromise,
            nativeAndAmountTokenV3PoolPromise,
            nativeAndSpecifiedGasTokenV3PoolPromise,
        ]);
        const pools = {
            usdPool: usdPool,
            nativeAndQuoteTokenV3Pool: nativeAndQuoteTokenV3Pool,
            nativeAndAmountTokenV3Pool: nativeAndAmountTokenV3Pool,
            nativeAndSpecifiedGasTokenV3Pool: nativeAndSpecifiedGasTokenV3Pool,
        };
        const v3GasModelPromise = this.v3GasModelFactory.buildGasModel({
            chainId: this.chainId,
            gasPriceWei,
            pools,
            amountToken,
            quoteToken,
            v2poolProvider: this.v2PoolProvider,
            l2GasDataProvider: this.l2GasDataProvider,
            providerConfig: providerConfig,
        });
        const mixedRouteGasModelPromise = this.mixedRouteGasModelFactory.buildGasModel({
            chainId: this.chainId,
            gasPriceWei,
            pools,
            amountToken,
            quoteToken,
            v2poolProvider: this.v2PoolProvider,
            providerConfig: providerConfig,
        });
        const [v3GasModel, mixedRouteGasModel] = await Promise.all([
            v3GasModelPromise,
            mixedRouteGasModelPromise,
        ]);
        metric.putMetric('GasModelCreation', Date.now() - beforeGasModel, MetricLoggerUnit.Milliseconds);
        return [v3GasModel, mixedRouteGasModel];
    }
    // Note multiplications here can result in a loss of precision in the amounts (e.g. taking 50% of 101)
    // This is reconcilled at the end of the algorithm by adding any lost precision to one of
    // the splits in the route.
    getAmountDistribution(amount, routingConfig) {
        const { distributionPercent } = routingConfig;
        const percents = [];
        const amounts = [];
        for (let i = 1; i <= 100 / distributionPercent; i++) {
            percents.push(i * distributionPercent);
            amounts.push(amount.multiply(new Fraction(i * distributionPercent, 100)));
        }
        return [percents, amounts];
    }
    async buildSwapAndAddMethodParameters(trade, swapAndAddOptions, swapAndAddParameters) {
        const { swapOptions: { recipient, slippageTolerance, deadline, inputTokenPermit }, addLiquidityOptions: addLiquidityConfig, } = swapAndAddOptions;
        const preLiquidityPosition = swapAndAddParameters.preLiquidityPosition;
        const finalBalanceTokenIn = swapAndAddParameters.initialBalanceTokenIn.subtract(trade.inputAmount);
        const finalBalanceTokenOut = swapAndAddParameters.initialBalanceTokenOut.add(trade.outputAmount);
        const approvalTypes = await this.swapRouterProvider.getApprovalType(finalBalanceTokenIn, finalBalanceTokenOut);
        const zeroForOne = finalBalanceTokenIn.currency.wrapped.sortsBefore(finalBalanceTokenOut.currency.wrapped);
        return {
            ...SwapRouter.swapAndAddCallParameters(trade, {
                recipient,
                slippageTolerance,
                deadlineOrPreviousBlockhash: deadline,
                inputTokenPermit,
            }, Position.fromAmounts({
                pool: preLiquidityPosition.pool,
                tickLower: preLiquidityPosition.tickLower,
                tickUpper: preLiquidityPosition.tickUpper,
                amount0: zeroForOne
                    ? finalBalanceTokenIn.quotient.toString()
                    : finalBalanceTokenOut.quotient.toString(),
                amount1: zeroForOne
                    ? finalBalanceTokenOut.quotient.toString()
                    : finalBalanceTokenIn.quotient.toString(),
                useFullPrecision: false,
            }), addLiquidityConfig, approvalTypes.approvalTokenIn, approvalTypes.approvalTokenOut),
            to: SWAP_ROUTER_02_ADDRESSES(this.chainId),
        };
    }
    emitPoolSelectionMetrics(swapRouteRaw, allPoolsBySelection) {
        const poolAddressesUsed = new Set();
        const { routes: routeAmounts } = swapRouteRaw;
        _(routeAmounts)
            .flatMap((routeAmount) => {
            const { poolAddresses } = routeAmount;
            return poolAddresses;
        })
            .forEach((address) => {
            poolAddressesUsed.add(address.toLowerCase());
        });
        for (const poolsBySelection of allPoolsBySelection) {
            const { protocol } = poolsBySelection;
            _.forIn(poolsBySelection.selections, (pools, topNSelection) => {
                const topNUsed = _.findLastIndex(pools, (pool) => poolAddressesUsed.has(pool.id.toLowerCase())) + 1;
                metric.putMetric(_.capitalize(`${protocol}${topNSelection}`), topNUsed, MetricLoggerUnit.Count);
            });
        }
        let hasV3Route = false;
        let hasV2Route = false;
        let hasMixedRoute = false;
        for (const routeAmount of routeAmounts) {
            if (routeAmount.protocol === Protocol.V3) {
                hasV3Route = true;
            }
            if (routeAmount.protocol === Protocol.V2) {
                hasV2Route = true;
            }
            if (routeAmount.protocol === Protocol.MIXED) {
                hasMixedRoute = true;
            }
        }
        if (hasMixedRoute && (hasV3Route || hasV2Route)) {
            if (hasV3Route && hasV2Route) {
                metric.putMetric(`MixedAndV3AndV2SplitRoute`, 1, MetricLoggerUnit.Count);
                metric.putMetric(`MixedAndV3AndV2SplitRouteForChain${this.chainId}`, 1, MetricLoggerUnit.Count);
            }
            else if (hasV3Route) {
                metric.putMetric(`MixedAndV3SplitRoute`, 1, MetricLoggerUnit.Count);
                metric.putMetric(`MixedAndV3SplitRouteForChain${this.chainId}`, 1, MetricLoggerUnit.Count);
            }
            else if (hasV2Route) {
                metric.putMetric(`MixedAndV2SplitRoute`, 1, MetricLoggerUnit.Count);
                metric.putMetric(`MixedAndV2SplitRouteForChain${this.chainId}`, 1, MetricLoggerUnit.Count);
            }
        }
        else if (hasV3Route && hasV2Route) {
            metric.putMetric(`V3AndV2SplitRoute`, 1, MetricLoggerUnit.Count);
            metric.putMetric(`V3AndV2SplitRouteForChain${this.chainId}`, 1, MetricLoggerUnit.Count);
        }
        else if (hasMixedRoute) {
            if (routeAmounts.length > 1) {
                metric.putMetric(`MixedSplitRoute`, 1, MetricLoggerUnit.Count);
                metric.putMetric(`MixedSplitRouteForChain${this.chainId}`, 1, MetricLoggerUnit.Count);
            }
            else {
                metric.putMetric(`MixedRoute`, 1, MetricLoggerUnit.Count);
                metric.putMetric(`MixedRouteForChain${this.chainId}`, 1, MetricLoggerUnit.Count);
            }
        }
        else if (hasV3Route) {
            if (routeAmounts.length > 1) {
                metric.putMetric(`V3SplitRoute`, 1, MetricLoggerUnit.Count);
                metric.putMetric(`V3SplitRouteForChain${this.chainId}`, 1, MetricLoggerUnit.Count);
            }
            else {
                metric.putMetric(`V3Route`, 1, MetricLoggerUnit.Count);
                metric.putMetric(`V3RouteForChain${this.chainId}`, 1, MetricLoggerUnit.Count);
            }
        }
        else if (hasV2Route) {
            if (routeAmounts.length > 1) {
                metric.putMetric(`V2SplitRoute`, 1, MetricLoggerUnit.Count);
                metric.putMetric(`V2SplitRouteForChain${this.chainId}`, 1, MetricLoggerUnit.Count);
            }
            else {
                metric.putMetric(`V2Route`, 1, MetricLoggerUnit.Count);
                metric.putMetric(`V2RouteForChain${this.chainId}`, 1, MetricLoggerUnit.Count);
            }
        }
    }
    calculateOptimalRatio(position, sqrtRatioX96, zeroForOne) {
        const upperSqrtRatioX96 = TickMath.getSqrtRatioAtTick(position.tickUpper);
        const lowerSqrtRatioX96 = TickMath.getSqrtRatioAtTick(position.tickLower);
        // returns Fraction(0, 1) for any out of range position regardless of zeroForOne. Implication: function
        // cannot be used to determine the trading direction of out of range positions.
        if (JSBI.greaterThan(sqrtRatioX96, upperSqrtRatioX96) ||
            JSBI.lessThan(sqrtRatioX96, lowerSqrtRatioX96)) {
            return new Fraction(0, 1);
        }
        const precision = JSBI.BigInt('1' + '0'.repeat(18));
        let optimalRatio = new Fraction(SqrtPriceMath.getAmount0Delta(sqrtRatioX96, upperSqrtRatioX96, precision, true), SqrtPriceMath.getAmount1Delta(sqrtRatioX96, lowerSqrtRatioX96, precision, true));
        if (!zeroForOne)
            optimalRatio = optimalRatio.invert();
        return optimalRatio;
    }
    async userHasSufficientBalance(fromAddress, tradeType, amount, quote) {
        try {
            const neededBalance = tradeType === TradeType.EXACT_INPUT ? amount : quote;
            let balance;
            if (neededBalance.currency.isNative) {
                balance = await this.provider.getBalance(fromAddress);
            }
            else {
                const tokenContract = Erc20__factory.connect(neededBalance.currency.address, this.provider);
                balance = await tokenContract.balanceOf(fromAddress);
            }
            return balance.gte(BigNumber.from(neededBalance.quotient.toString()));
        }
        catch (e) {
            log.error(e, 'Error while checking user balance');
            return false;
        }
    }
    absoluteValue(fraction) {
        const numeratorAbs = JSBI.lessThan(fraction.numerator, JSBI.BigInt(0))
            ? JSBI.unaryMinus(fraction.numerator)
            : fraction.numerator;
        const denominatorAbs = JSBI.lessThan(fraction.denominator, JSBI.BigInt(0))
            ? JSBI.unaryMinus(fraction.denominator)
            : fraction.denominator;
        return new Fraction(numeratorAbs, denominatorAbs);
    }
    getBlockNumberPromise() {
        return retry(async (_b, attempt) => {
            if (attempt > 1) {
                log.info(`Get block number attempt ${attempt}`);
            }
            return this.provider.getBlockNumber();
        }, {
            retries: 2,
            minTimeout: 100,
            maxTimeout: 1000,
        });
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiYWxwaGEtcm91dGVyLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiLi4vLi4vLi4vLi4vc3JjL3JvdXRlcnMvYWxwaGEtcm91dGVyL2FscGhhLXJvdXRlci50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQSxPQUFPLEVBQUUsU0FBUyxFQUFFLE1BQU0sMEJBQTBCLENBQUM7QUFDckQsT0FBTyxFQUFnQixlQUFlLEVBQUUsTUFBTSwwQkFBMEIsQ0FBQztBQUN6RSxnRUFBZ0U7QUFDaEUsT0FBTyxFQUFFLFFBQVEsRUFBRSxVQUFVLEVBQVMsSUFBSSxFQUFFLE1BQU0scUJBQXFCLENBQUM7QUFDeEUsT0FBTyxFQUNMLE9BQU8sRUFFUCxRQUFRLEVBRVIsU0FBUyxHQUNWLE1BQU0sbUJBQW1CLENBQUM7QUFFM0IsT0FBTyxFQUFFLElBQUksRUFBRSxRQUFRLEVBQUUsYUFBYSxFQUFFLFFBQVEsRUFBRSxNQUFNLGlCQUFpQixDQUFDO0FBQzFFLE9BQU8sS0FBSyxNQUFNLGFBQWEsQ0FBQztBQUNoQyxPQUFPLElBQUksTUFBTSxNQUFNLENBQUM7QUFDeEIsT0FBTyxDQUFDLE1BQU0sUUFBUSxDQUFDO0FBQ3ZCLE9BQU8sU0FBUyxNQUFNLFlBQVksQ0FBQztBQUVuQyxPQUFPLEVBQ0wsWUFBWSxFQUNaLFNBQVMsRUFDVCx5QkFBeUIsRUFDekIsZ0NBQWdDLEVBQ2hDLHFCQUFxQixFQUNyQix5QkFBeUIsRUFDekIscUJBQXFCLEVBQ3JCLHlCQUF5QixFQUN6Qix1QkFBdUIsRUFDdkIseUJBQXlCLEVBT3pCLHNCQUFzQixFQUN0QixXQUFXLEVBQ1gsdUJBQXVCLEVBQ3ZCLG9CQUFvQixFQUVwQix3QkFBd0IsRUFDeEIsd0JBQXdCLEVBQ3hCLGtCQUFrQixFQUNsQix1QkFBdUIsRUFDdkIsd0JBQXdCLEVBQ3hCLG1CQUFtQixFQUNuQixlQUFlLEVBQ2YsK0JBQStCLEVBQy9CLCtCQUErQixHQUNoQyxNQUFNLGlCQUFpQixDQUFDO0FBQ3pCLE9BQU8sRUFD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