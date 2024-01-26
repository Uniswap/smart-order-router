"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AlphaRouter = exports.LowerCaseStringArray = exports.MapWithLowerCaseKey = void 0;
const bignumber_1 = require("@ethersproject/bignumber");
const providers_1 = require("@ethersproject/providers");
// import DEFAULT_TOKEN_LIST from '@uniswap/default-token-list';
const router_sdk_1 = require("@uniswap/router-sdk");
const sdk_core_1 = require("@uniswap/sdk-core");
const v3_sdk_1 = require("@uniswap/v3-sdk");
const async_retry_1 = __importDefault(require("async-retry"));
const jsbi_1 = __importDefault(require("jsbi"));
const lodash_1 = __importDefault(require("lodash"));
const node_cache_1 = __importDefault(require("node-cache"));
const providers_2 = require("../../providers");
const caching_token_list_provider_1 = require("../../providers/caching-token-list-provider");
const portion_provider_1 = require("../../providers/portion-provider");
const token_fee_fetcher_1 = require("../../providers/token-fee-fetcher");
const token_provider_1 = require("../../providers/token-provider");
const token_validator_provider_1 = require("../../providers/token-validator-provider");
const pool_provider_1 = require("../../providers/v2/pool-provider");
const gas_data_provider_1 = require("../../providers/v3/gas-data-provider");
const pool_provider_2 = require("../../providers/v3/pool-provider");
const tokenList_json_1 = __importDefault(require("../../tokenList.json"));
const Erc20__factory_1 = require("../../types/other/factories/Erc20__factory");
const util_1 = require("../../util");
const amounts_1 = require("../../util/amounts");
const chains_1 = require("../../util/chains");
const gas_factory_helpers_1 = require("../../util/gas-factory-helpers");
const log_1 = require("../../util/log");
const methodParameters_1 = require("../../util/methodParameters");
const metric_1 = require("../../util/metric");
const unsupported_tokens_1 = require("../../util/unsupported-tokens");
const router_1 = require("../router");
const config_1 = require("./config");
const best_swap_route_1 = require("./functions/best-swap-route");
const calculate_ratio_amount_in_1 = require("./functions/calculate-ratio-amount-in");
const get_candidate_pools_1 = require("./functions/get-candidate-pools");
const mixed_route_heuristic_gas_model_1 = require("./gas-models/mixedRoute/mixed-route-heuristic-gas-model");
const v2_heuristic_gas_model_1 = require("./gas-models/v2/v2-heuristic-gas-model");
const gas_costs_1 = require("./gas-models/v3/gas-costs");
const v3_heuristic_gas_model_1 = require("./gas-models/v3/v3-heuristic-gas-model");
const quoters_1 = require("./quoters");
class MapWithLowerCaseKey extends Map {
    set(key, value) {
        return super.set(key.toLowerCase(), value);
    }
}
exports.MapWithLowerCaseKey = MapWithLowerCaseKey;
class LowerCaseStringArray extends Array {
    constructor(...items) {
        // Convert all items to lowercase before calling the parent constructor
        super(...items.map((item) => item.toLowerCase()));
    }
}
exports.LowerCaseStringArray = LowerCaseStringArray;
class AlphaRouter {
    constructor({ chainId, provider, multicall2Provider, v3PoolProvider, onChainQuoteProvider, v2PoolProvider, v2QuoteProvider, v2SubgraphProvider, tokenProvider, blockedTokenListProvider, v3SubgraphProvider, gasPriceProvider, v3GasModelFactory, v2GasModelFactory, mixedRouteGasModelFactory, swapRouterProvider, optimismGasDataProvider, tokenValidatorProvider, arbitrumGasDataProvider, simulator, routeCachingProvider, tokenPropertiesProvider, portionProvider, }) {
        this.chainId = chainId;
        this.provider = provider;
        this.multicall2Provider =
            multicall2Provider !== null && multicall2Provider !== void 0 ? multicall2Provider : new providers_2.UniswapMulticallProvider(chainId, provider, 375000);
        this.v3PoolProvider =
            v3PoolProvider !== null && v3PoolProvider !== void 0 ? v3PoolProvider : new providers_2.CachingV3PoolProvider(this.chainId, new pool_provider_2.V3PoolProvider((0, chains_1.ID_TO_CHAIN_ID)(chainId), this.multicall2Provider), new providers_2.NodeJSCache(new node_cache_1.default({ stdTTL: 360, useClones: false })));
        this.simulator = simulator;
        this.routeCachingProvider = routeCachingProvider;
        if (onChainQuoteProvider) {
            this.onChainQuoteProvider = onChainQuoteProvider;
        }
        else {
            switch (chainId) {
                case sdk_core_1.ChainId.OPTIMISM:
                case sdk_core_1.ChainId.OPTIMISM_GOERLI:
                    this.onChainQuoteProvider = new providers_2.OnChainQuoteProvider(chainId, provider, this.multicall2Provider, {
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
                case sdk_core_1.ChainId.BASE:
                case sdk_core_1.ChainId.BASE_GOERLI:
                    this.onChainQuoteProvider = new providers_2.OnChainQuoteProvider(chainId, provider, this.multicall2Provider, {
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
                case sdk_core_1.ChainId.ARBITRUM_ONE:
                case sdk_core_1.ChainId.ARBITRUM_GOERLI:
                    this.onChainQuoteProvider = new providers_2.OnChainQuoteProvider(chainId, provider, this.multicall2Provider, {
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
                case sdk_core_1.ChainId.CELO:
                case sdk_core_1.ChainId.CELO_ALFAJORES:
                    this.onChainQuoteProvider = new providers_2.OnChainQuoteProvider(chainId, provider, this.multicall2Provider, {
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
                    this.onChainQuoteProvider = new providers_2.OnChainQuoteProvider(chainId, provider, this.multicall2Provider, {
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
        else if (this.chainId === sdk_core_1.ChainId.MAINNET) {
            this.tokenValidatorProvider = new token_validator_provider_1.TokenValidatorProvider(this.chainId, this.multicall2Provider, new providers_2.NodeJSCache(new node_cache_1.default({ stdTTL: 30000, useClones: false })));
        }
        if (tokenPropertiesProvider) {
            this.tokenPropertiesProvider = tokenPropertiesProvider;
        }
        else {
            this.tokenPropertiesProvider = new providers_2.TokenPropertiesProvider(this.chainId, new providers_2.NodeJSCache(new node_cache_1.default({ stdTTL: 86400, useClones: false })), new token_fee_fetcher_1.OnChainTokenFeeFetcher(this.chainId, provider));
        }
        this.v2PoolProvider =
            v2PoolProvider !== null && v2PoolProvider !== void 0 ? v2PoolProvider : new providers_2.CachingV2PoolProvider(chainId, new pool_provider_1.V2PoolProvider(chainId, this.multicall2Provider, this.tokenPropertiesProvider), new providers_2.NodeJSCache(new node_cache_1.default({ stdTTL: 60, useClones: false })));
        this.v2QuoteProvider = v2QuoteProvider !== null && v2QuoteProvider !== void 0 ? v2QuoteProvider : new providers_2.V2QuoteProvider();
        this.blockedTokenListProvider =
            blockedTokenListProvider !== null && blockedTokenListProvider !== void 0 ? blockedTokenListProvider : new caching_token_list_provider_1.CachingTokenListProvider(chainId, unsupported_tokens_1.UNSUPPORTED_TOKENS, new providers_2.NodeJSCache(new node_cache_1.default({ stdTTL: 3600, useClones: false })));
        this.tokenProvider =
            tokenProvider !== null && tokenProvider !== void 0 ? tokenProvider : new providers_2.CachingTokenProviderWithFallback(chainId, new providers_2.NodeJSCache(new node_cache_1.default({ stdTTL: 3600, useClones: false })), new caching_token_list_provider_1.CachingTokenListProvider(chainId, tokenList_json_1.default, new providers_2.NodeJSCache(new node_cache_1.default({ stdTTL: 3600, useClones: false }))), new token_provider_1.TokenProvider(chainId, this.multicall2Provider));
        this.portionProvider = portionProvider !== null && portionProvider !== void 0 ? portionProvider : new portion_provider_1.PortionProvider();
        const chainName = (0, chains_1.ID_TO_NETWORK_NAME)(chainId);
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
            this.v2SubgraphProvider = new providers_2.V2SubgraphProviderWithFallBacks([
                new providers_2.CachingV2SubgraphProvider(chainId, new providers_2.URISubgraphProvider(chainId, getSubgraphV2Url(), undefined, 0), new providers_2.NodeJSCache(new node_cache_1.default({ stdTTL: 300, useClones: false }))),
                new providers_2.StaticV2SubgraphProvider(chainId),
            ]);
        }
        if (v3SubgraphProvider) {
            this.v3SubgraphProvider = v3SubgraphProvider;
        }
        else {
            this.v3SubgraphProvider = new providers_2.V3SubgraphProviderWithFallBacks([
                new providers_2.CachingV3SubgraphProvider(chainId, new providers_2.URISubgraphProvider(chainId, getSubgraphV3Url(), undefined, 0), new providers_2.NodeJSCache(new node_cache_1.default({ stdTTL: 300, useClones: false }))),
                new providers_2.StaticV3SubgraphProvider(chainId, this.v3PoolProvider),
            ]);
        }
        let gasPriceProviderInstance;
        if (providers_1.JsonRpcProvider.isProvider(this.provider)) {
            gasPriceProviderInstance = new providers_2.OnChainGasPriceProvider(chainId, new providers_2.EIP1559GasPriceProvider(this.provider), new providers_2.LegacyGasPriceProvider(this.provider));
        }
        else {
            gasPriceProviderInstance = new providers_2.ETHGasStationInfoProvider(config_1.ETH_GAS_STATION_API_URL);
        }
        this.gasPriceProvider =
            gasPriceProvider !== null && gasPriceProvider !== void 0 ? gasPriceProvider : new providers_2.CachingGasStationProvider(chainId, gasPriceProviderInstance, new providers_2.NodeJSCache(new node_cache_1.default({ stdTTL: 7, useClones: false })));
        this.v3GasModelFactory =
            v3GasModelFactory !== null && v3GasModelFactory !== void 0 ? v3GasModelFactory : new v3_heuristic_gas_model_1.V3HeuristicGasModelFactory();
        this.v2GasModelFactory =
            v2GasModelFactory !== null && v2GasModelFactory !== void 0 ? v2GasModelFactory : new v2_heuristic_gas_model_1.V2HeuristicGasModelFactory();
        this.mixedRouteGasModelFactory =
            mixedRouteGasModelFactory !== null && mixedRouteGasModelFactory !== void 0 ? mixedRouteGasModelFactory : new mixed_route_heuristic_gas_model_1.MixedRouteHeuristicGasModelFactory();
        this.swapRouterProvider =
            swapRouterProvider !== null && swapRouterProvider !== void 0 ? swapRouterProvider : new providers_2.SwapRouterProvider(this.multicall2Provider, this.chainId);
        if (chainId === sdk_core_1.ChainId.OPTIMISM || chainId === sdk_core_1.ChainId.BASE) {
            this.l2GasDataProvider =
                optimismGasDataProvider !== null && optimismGasDataProvider !== void 0 ? optimismGasDataProvider : new gas_data_provider_1.OptimismGasDataProvider(chainId, this.multicall2Provider);
        }
        if (chainId === sdk_core_1.ChainId.ARBITRUM_ONE ||
            chainId === sdk_core_1.ChainId.ARBITRUM_GOERLI) {
            this.l2GasDataProvider =
                arbitrumGasDataProvider !== null && arbitrumGasDataProvider !== void 0 ? arbitrumGasDataProvider : new gas_data_provider_1.ArbitrumGasDataProvider(chainId, this.provider);
        }
        // Initialize the Quoters.
        // Quoters are an abstraction encapsulating the business logic of fetching routes and quotes.
        this.v2Quoter = new quoters_1.V2Quoter(this.v2SubgraphProvider, this.v2PoolProvider, this.v2QuoteProvider, this.v2GasModelFactory, this.tokenProvider, this.chainId, this.blockedTokenListProvider, this.tokenValidatorProvider);
        this.v3Quoter = new quoters_1.V3Quoter(this.v3SubgraphProvider, this.v3PoolProvider, this.onChainQuoteProvider, this.tokenProvider, this.chainId, this.blockedTokenListProvider, this.tokenValidatorProvider);
        this.mixedQuoter = new quoters_1.MixedQuoter(this.v3SubgraphProvider, this.v3PoolProvider, this.v2SubgraphProvider, this.v2PoolProvider, this.onChainQuoteProvider, this.tokenProvider, this.chainId, this.blockedTokenListProvider, this.tokenValidatorProvider);
    }
    async routeToRatio(token0Balance, token1Balance, position, swapAndAddConfig, swapAndAddOptions, routingConfig = (0, config_1.DEFAULT_ROUTING_CONFIG_BY_CHAIN)(this.chainId)) {
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
            zeroForOne = new sdk_core_1.Fraction(token0Balance.quotient, token1Balance.quotient).greaterThan(preSwapOptimalRatio);
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
                log_1.log.info('max iterations exceeded');
                return {
                    status: router_1.SwapToRatioStatus.NO_ROUTE_FOUND,
                    error: 'max iterations exceeded',
                };
            }
            const amountToSwap = (0, calculate_ratio_amount_in_1.calculateRatioAmountIn)(optimalRatio, exchangeRate, inputBalance, outputBalance);
            if (amountToSwap.equalTo(0)) {
                log_1.log.info(`no swap needed: amountToSwap = 0`);
                return {
                    status: router_1.SwapToRatioStatus.NO_SWAP_NEEDED,
                };
            }
            swap = await this.route(amountToSwap, outputBalance.currency, sdk_core_1.TradeType.EXACT_INPUT, undefined, Object.assign(Object.assign(Object.assign({}, (0, config_1.DEFAULT_ROUTING_CONFIG_BY_CHAIN)(this.chainId)), routingConfig), { 
                /// @dev We do not want to query for mixedRoutes for routeToRatio as they are not supported
                /// [Protocol.V3, Protocol.V2] will make sure we only query for V3 and V2
                protocols: [router_sdk_1.Protocol.V3, router_sdk_1.Protocol.V2] }));
            if (!swap) {
                log_1.log.info('no route found from this.route()');
                return {
                    status: router_1.SwapToRatioStatus.NO_ROUTE_FOUND,
                    error: 'no route found',
                };
            }
            const inputBalanceUpdated = inputBalance.subtract(swap.trade.inputAmount);
            const outputBalanceUpdated = outputBalance.add(swap.trade.outputAmount);
            const newRatio = inputBalanceUpdated.divide(outputBalanceUpdated);
            let targetPoolPriceUpdate;
            swap.route.forEach((route) => {
                if (route.protocol === router_sdk_1.Protocol.V3) {
                    const v3Route = route;
                    v3Route.route.pools.forEach((pool, i) => {
                        if (pool.token0.equals(position.pool.token0) &&
                            pool.token1.equals(position.pool.token1) &&
                            pool.fee === position.pool.fee) {
                            targetPoolPriceUpdate = jsbi_1.default.BigInt(v3Route.sqrtPriceX96AfterList[i].toString());
                            optimalRatio = this.calculateOptimalRatio(position, jsbi_1.default.BigInt(targetPoolPriceUpdate.toString()), zeroForOne);
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
                postSwapTargetPool = new v3_sdk_1.Pool(position.pool.token0, position.pool.token1, position.pool.fee, targetPoolPriceUpdate, position.pool.liquidity, v3_sdk_1.TickMath.getTickAtSqrtRatio(targetPoolPriceUpdate), position.pool.tickDataProvider);
            }
            exchangeRate = swap.trade.outputAmount.divide(swap.trade.inputAmount);
            log_1.log.info({
                exchangeRate: exchangeRate.asFraction.toFixed(18),
                optimalRatio: optimalRatio.asFraction.toFixed(18),
                newRatio: newRatio.asFraction.toFixed(18),
                inputBalanceUpdated: inputBalanceUpdated.asFraction.toFixed(18),
                outputBalanceUpdated: outputBalanceUpdated.asFraction.toFixed(18),
                ratioErrorTolerance: swapAndAddConfig.ratioErrorTolerance.toFixed(18),
                iterationN: n.toString(),
            }, 'QuoteToRatio Iteration Parameters');
            if (exchangeRate.equalTo(0)) {
                log_1.log.info('exchangeRate to 0');
                return {
                    status: router_1.SwapToRatioStatus.NO_ROUTE_FOUND,
                    error: 'insufficient liquidity to swap to optimal ratio',
                };
            }
        }
        if (!swap) {
            return {
                status: router_1.SwapToRatioStatus.NO_ROUTE_FOUND,
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
            status: router_1.SwapToRatioStatus.SUCCESS,
            result: Object.assign(Object.assign({}, swap), { methodParameters, optimalRatio, postSwapTargetPool }),
        };
    }
    /**
     * @inheritdoc IRouter
     */
    async route(amount, quoteCurrency, tradeType, swapConfig, partialRoutingConfig = {}) {
        var _a, _c, _d, _e;
        const originalAmount = amount;
        if (tradeType === sdk_core_1.TradeType.EXACT_OUTPUT) {
            const portionAmount = this.portionProvider.getPortionAmount(amount, tradeType, swapConfig);
            if (portionAmount && portionAmount.greaterThan(router_sdk_1.ZERO)) {
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
        metric_1.metric.setProperty('chainId', this.chainId);
        metric_1.metric.setProperty('pair', `${tokenIn.symbol}/${tokenOut.symbol}`);
        metric_1.metric.setProperty('tokenIn', tokenIn.address);
        metric_1.metric.setProperty('tokenOut', tokenOut.address);
        metric_1.metric.setProperty('tradeType', tradeType === sdk_core_1.TradeType.EXACT_INPUT ? 'ExactIn' : 'ExactOut');
        metric_1.metric.putMetric(`QuoteRequestedForChain${this.chainId}`, 1, metric_1.MetricLoggerUnit.Count);
        // Get a block number to specify in all our calls. Ensures data we fetch from chain is
        // from the same block.
        const blockNumber = (_a = partialRoutingConfig.blockNumber) !== null && _a !== void 0 ? _a : this.getBlockNumberPromise();
        const routingConfig = lodash_1.default.merge({
            // These settings could be changed by the partialRoutingConfig
            useCachedRoutes: true,
            writeToCachedRoutes: true,
            optimisticCachedRoutes: false,
        }, (0, config_1.DEFAULT_ROUTING_CONFIG_BY_CHAIN)(this.chainId), partialRoutingConfig, { blockNumber });
        if (routingConfig.debugRouting) {
            log_1.log.warn(`Finalized routing config is ${JSON.stringify(routingConfig)}`);
        }
        const gasPriceWei = await this.getGasPriceWei(await blockNumber, await partialRoutingConfig.blockNumber);
        const quoteToken = quoteCurrency.wrapped;
        // const gasTokenAccessor = await this.tokenProvider.getTokens([routingConfig.gasToken!]);
        const gasToken = routingConfig.gasToken
            ? (await this.tokenProvider.getTokens([routingConfig.gasToken])).getTokenByAddress(routingConfig.gasToken)
            : undefined;
        const providerConfig = Object.assign(Object.assign({}, routingConfig), { blockNumber, additionalGasOverhead: (0, gas_costs_1.NATIVE_OVERHEAD)(this.chainId, amount.currency, quoteCurrency), gasToken });
        const [v3GasModel, mixedRouteGasModel] = await this.getGasModels(gasPriceWei, amount.currency.wrapped, quoteToken, providerConfig);
        // Create a Set to sanitize the protocols input, a Set of undefined becomes an empty set,
        // Then create an Array from the values of that Set.
        const protocols = Array.from(new Set(routingConfig.protocols).values());
        const cacheMode = (_c = routingConfig.overwriteCacheMode) !== null && _c !== void 0 ? _c : (await ((_d = this.routeCachingProvider) === null || _d === void 0 ? void 0 : _d.getCacheMode(this.chainId, amount, quoteToken, tradeType, protocols)));
        // Fetch CachedRoutes
        let cachedRoutes;
        if (routingConfig.useCachedRoutes && cacheMode !== providers_2.CacheMode.Darkmode) {
            cachedRoutes = await ((_e = this.routeCachingProvider) === null || _e === void 0 ? void 0 : _e.getCachedRoute(this.chainId, amount, quoteToken, tradeType, protocols, await blockNumber, routingConfig.optimisticCachedRoutes));
        }
        metric_1.metric.putMetric(routingConfig.useCachedRoutes
            ? 'GetQuoteUsingCachedRoutes'
            : 'GetQuoteNotUsingCachedRoutes', 1, metric_1.MetricLoggerUnit.Count);
        if (cacheMode &&
            routingConfig.useCachedRoutes &&
            cacheMode !== providers_2.CacheMode.Darkmode &&
            !cachedRoutes) {
            metric_1.metric.putMetric(`GetCachedRoute_miss_${cacheMode}`, 1, metric_1.MetricLoggerUnit.Count);
            log_1.log.info({
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
            metric_1.metric.putMetric(`GetCachedRoute_hit_${cacheMode}`, 1, metric_1.MetricLoggerUnit.Count);
            log_1.log.info({
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
        if (!cachedRoutes || cacheMode !== providers_2.CacheMode.Livemode) {
            swapRouteFromChainPromise = this.getSwapRouteFromChain(amount, tokenIn, tokenOut, protocols, quoteToken, tradeType, routingConfig, v3GasModel, mixedRouteGasModel, gasPriceWei, swapConfig);
        }
        const [swapRouteFromCache, swapRouteFromChain] = await Promise.all([
            swapRouteFromCachePromise,
            swapRouteFromChainPromise,
        ]);
        let swapRouteRaw;
        let hitsCachedRoute = false;
        if (cacheMode === providers_2.CacheMode.Livemode && swapRouteFromCache) {
            log_1.log.info(`CacheMode is ${cacheMode}, and we are using swapRoute from cache`);
            hitsCachedRoute = true;
            swapRouteRaw = swapRouteFromCache;
        }
        else {
            log_1.log.info(`CacheMode is ${cacheMode}, and we are using materialized swapRoute`);
            swapRouteRaw = swapRouteFromChain;
        }
        if (cacheMode === providers_2.CacheMode.Tapcompare &&
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
                metric_1.metric.putMetric(`TapcompareCachedRoute_quoteGasAdjustedDiffPercent`, Number(misquotePercent.toExact()), metric_1.MetricLoggerUnit.Percent);
                log_1.log.warn({
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
            cacheMode !== providers_2.CacheMode.Darkmode &&
            swapRouteFromChain) {
            // Generate the object to be cached
            const routesToCache = providers_2.CachedRoutes.fromRoutesWithValidQuotes(swapRouteFromChain.routes, this.chainId, tokenIn, tokenOut, protocols.sort(), // sort it for consistency in the order of the protocols.
            await blockNumber, tradeType, amount.toExact());
            if (routesToCache) {
                // Attempt to insert the entry in cache. This is fire and forget promise.
                // The catch method will prevent any exception from blocking the normal code execution.
                this.routeCachingProvider
                    .setCachedRoute(routesToCache, amount)
                    .then((success) => {
                    const status = success ? 'success' : 'rejected';
                    metric_1.metric.putMetric(`SetCachedRoute_${status}`, 1, metric_1.MetricLoggerUnit.Count);
                })
                    .catch((reason) => {
                    log_1.log.error({
                        reason: reason,
                        tokenPair: this.tokenPairSymbolTradeTypeChainId(tokenIn, tokenOut, tradeType),
                    }, `SetCachedRoute failure`);
                    metric_1.metric.putMetric(`SetCachedRoute_failure`, 1, metric_1.MetricLoggerUnit.Count);
                });
            }
            else {
                metric_1.metric.putMetric(`SetCachedRoute_unnecessary`, 1, metric_1.MetricLoggerUnit.Count);
            }
        }
        metric_1.metric.putMetric(`QuoteFoundForChain${this.chainId}`, 1, metric_1.MetricLoggerUnit.Count);
        // Build Trade object that represents the optimal swap.
        const trade = (0, methodParameters_1.buildTrade)(currencyIn, currencyOut, tradeType, routeAmounts);
        let methodParameters;
        // If user provided recipient, deadline etc. we also generate the calldata required to execute
        // the swap and return it too.
        if (swapConfig) {
            methodParameters = (0, methodParameters_1.buildSwapMethodParameters)(trade, swapConfig, this.chainId);
        }
        const tokenOutAmount = tradeType === sdk_core_1.TradeType.EXACT_OUTPUT
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
            blockNumber: bignumber_1.BigNumber.from(await blockNumber),
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
            log_1.log.info(JSON.stringify({ swapConfig, methodParameters, providerConfig }, null, 2), `Starting simulation`);
            const fromAddress = swapConfig.simulate.fromAddress;
            const beforeSimulate = Date.now();
            const swapRouteWithSimulation = await this.simulator.simulate(fromAddress, swapConfig, swapRoute, amount, 
            // Quote will be in WETH even if quoteCurrency is ETH
            // So we init a new CurrencyAmount object here
            amounts_1.CurrencyAmount.fromRawAmount(quoteCurrency, quote.quotient.toString()), this.l2GasDataProvider
                ? await this.l2GasDataProvider.getGasData(providerConfig)
                : undefined, providerConfig);
            metric_1.metric.putMetric('SimulateTransaction', Date.now() - beforeSimulate, metric_1.MetricLoggerUnit.Milliseconds);
            return swapRouteWithSimulation;
        }
        return swapRoute;
    }
    async getSwapRouteFromCache(cachedRoutes, blockNumber, amount, quoteToken, tradeType, routingConfig, v3GasModel, mixedRouteGasModel, gasPriceWei, swapConfig) {
        log_1.log.info({
            protocols: cachedRoutes.protocolsCovered,
            tradeType: cachedRoutes.tradeType,
            cachedBlockNumber: cachedRoutes.blockNumber,
            quoteBlockNumber: blockNumber,
        }, 'Routing across CachedRoute');
        const quotePromises = [];
        const v3Routes = cachedRoutes.routes.filter((route) => route.protocol === router_sdk_1.Protocol.V3);
        const v2Routes = cachedRoutes.routes.filter((route) => route.protocol === router_sdk_1.Protocol.V2);
        const mixedRoutes = cachedRoutes.routes.filter((route) => route.protocol === router_sdk_1.Protocol.MIXED);
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
            metric_1.metric.putMetric('SwapRouteFromCache_V3_GetQuotes_Request', 1, metric_1.MetricLoggerUnit.Count);
            const beforeGetQuotes = Date.now();
            quotePromises.push(this.v3Quoter
                .getQuotes(v3RoutesFromCache, amounts, percents, quoteToken, tradeType, routingConfig, undefined, v3GasModel)
                .then((result) => {
                metric_1.metric.putMetric(`SwapRouteFromCache_V3_GetQuotes_Load`, Date.now() - beforeGetQuotes, metric_1.MetricLoggerUnit.Milliseconds);
                return result;
            }));
        }
        if (v2Routes.length > 0) {
            const v2RoutesFromCache = v2Routes.map((cachedRoute) => cachedRoute.route);
            metric_1.metric.putMetric('SwapRouteFromCache_V2_GetQuotes_Request', 1, metric_1.MetricLoggerUnit.Count);
            const beforeGetQuotes = Date.now();
            quotePromises.push(this.v2Quoter
                .refreshRoutesThenGetQuotes(cachedRoutes.tokenIn, cachedRoutes.tokenOut, v2RoutesFromCache, amounts, percents, quoteToken, tradeType, routingConfig, gasPriceWei)
                .then((result) => {
                metric_1.metric.putMetric(`SwapRouteFromCache_V2_GetQuotes_Load`, Date.now() - beforeGetQuotes, metric_1.MetricLoggerUnit.Milliseconds);
                return result;
            }));
        }
        if (mixedRoutes.length > 0) {
            const mixedRoutesFromCache = mixedRoutes.map((cachedRoute) => cachedRoute.route);
            metric_1.metric.putMetric('SwapRouteFromCache_Mixed_GetQuotes_Request', 1, metric_1.MetricLoggerUnit.Count);
            const beforeGetQuotes = Date.now();
            quotePromises.push(this.mixedQuoter
                .getQuotes(mixedRoutesFromCache, amounts, percents, quoteToken, tradeType, routingConfig, undefined, mixedRouteGasModel)
                .then((result) => {
                metric_1.metric.putMetric(`SwapRouteFromCache_Mixed_GetQuotes_Load`, Date.now() - beforeGetQuotes, metric_1.MetricLoggerUnit.Milliseconds);
                return result;
            }));
        }
        const getQuotesResults = await Promise.all(quotePromises);
        const allRoutesWithValidQuotes = lodash_1.default.flatMap(getQuotesResults, (quoteResult) => quoteResult.routesWithValidQuotes);
        return (0, best_swap_route_1.getBestSwapRoute)(amount, percents, allRoutesWithValidQuotes, tradeType, this.chainId, routingConfig, this.portionProvider, v3GasModel, swapConfig);
    }
    async getSwapRouteFromChain(amount, tokenIn, tokenOut, protocols, quoteToken, tradeType, routingConfig, v3GasModel, mixedRouteGasModel, gasPriceWei, swapConfig) {
        // Generate our distribution of amounts, i.e. fractions of the input amount.
        // We will get quotes for fractions of the input amount for different routes, then
        // combine to generate split routes.
        const [percents, amounts] = this.getAmountDistribution(amount, routingConfig);
        const noProtocolsSpecified = protocols.length === 0;
        const v3ProtocolSpecified = protocols.includes(router_sdk_1.Protocol.V3);
        const v2ProtocolSpecified = protocols.includes(router_sdk_1.Protocol.V2);
        const v2SupportedInChain = chains_1.V2_SUPPORTED.includes(this.chainId);
        const shouldQueryMixedProtocol = protocols.includes(router_sdk_1.Protocol.MIXED) ||
            (noProtocolsSpecified && v2SupportedInChain);
        const mixedProtocolAllowed = [sdk_core_1.ChainId.MAINNET, sdk_core_1.ChainId.GOERLI].includes(this.chainId) &&
            tradeType === sdk_core_1.TradeType.EXACT_INPUT;
        const beforeGetCandidates = Date.now();
        let v3CandidatePoolsPromise = Promise.resolve(undefined);
        if (v3ProtocolSpecified ||
            noProtocolsSpecified ||
            (shouldQueryMixedProtocol && mixedProtocolAllowed)) {
            v3CandidatePoolsPromise = (0, get_candidate_pools_1.getV3CandidatePools)({
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
                metric_1.metric.putMetric('GetV3CandidatePools', Date.now() - beforeGetCandidates, metric_1.MetricLoggerUnit.Milliseconds);
                return candidatePools;
            });
        }
        let v2CandidatePoolsPromise = Promise.resolve(undefined);
        if ((v2SupportedInChain && (v2ProtocolSpecified || noProtocolsSpecified)) ||
            (shouldQueryMixedProtocol && mixedProtocolAllowed)) {
            // Fetch all the pools that we will consider routing via. There are thousands
            // of pools, so we filter them to a set of candidate pools that we expect will
            // result in good prices.
            v2CandidatePoolsPromise = (0, get_candidate_pools_1.getV2CandidatePools)({
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
                metric_1.metric.putMetric('GetV2CandidatePools', Date.now() - beforeGetCandidates, metric_1.MetricLoggerUnit.Milliseconds);
                return candidatePools;
            });
        }
        const quotePromises = [];
        // Maybe Quote V3 - if V3 is specified, or no protocol is specified
        if (v3ProtocolSpecified || noProtocolsSpecified) {
            log_1.log.info({ protocols, tradeType }, 'Routing across V3');
            metric_1.metric.putMetric('SwapRouteFromChain_V3_GetRoutesThenQuotes_Request', 1, metric_1.MetricLoggerUnit.Count);
            const beforeGetRoutesThenQuotes = Date.now();
            quotePromises.push(v3CandidatePoolsPromise.then((v3CandidatePools) => this.v3Quoter
                .getRoutesThenQuotes(tokenIn, tokenOut, amount, amounts, percents, quoteToken, v3CandidatePools, tradeType, routingConfig, v3GasModel)
                .then((result) => {
                metric_1.metric.putMetric(`SwapRouteFromChain_V3_GetRoutesThenQuotes_Load`, Date.now() - beforeGetRoutesThenQuotes, metric_1.MetricLoggerUnit.Milliseconds);
                return result;
            })));
        }
        // Maybe Quote V2 - if V2 is specified, or no protocol is specified AND v2 is supported in this chain
        if (v2SupportedInChain && (v2ProtocolSpecified || noProtocolsSpecified)) {
            log_1.log.info({ protocols, tradeType }, 'Routing across V2');
            metric_1.metric.putMetric('SwapRouteFromChain_V2_GetRoutesThenQuotes_Request', 1, metric_1.MetricLoggerUnit.Count);
            const beforeGetRoutesThenQuotes = Date.now();
            quotePromises.push(v2CandidatePoolsPromise.then((v2CandidatePools) => this.v2Quoter
                .getRoutesThenQuotes(tokenIn, tokenOut, amount, amounts, percents, quoteToken, v2CandidatePools, tradeType, routingConfig, undefined, gasPriceWei)
                .then((result) => {
                metric_1.metric.putMetric(`SwapRouteFromChain_V2_GetRoutesThenQuotes_Load`, Date.now() - beforeGetRoutesThenQuotes, metric_1.MetricLoggerUnit.Milliseconds);
                return result;
            })));
        }
        // Maybe Quote mixed routes
        // if MixedProtocol is specified or no protocol is specified and v2 is supported AND tradeType is ExactIn
        // AND is Mainnet or Gorli
        if (shouldQueryMixedProtocol && mixedProtocolAllowed) {
            log_1.log.info({ protocols, tradeType }, 'Routing across MixedRoutes');
            metric_1.metric.putMetric('SwapRouteFromChain_Mixed_GetRoutesThenQuotes_Request', 1, metric_1.MetricLoggerUnit.Count);
            const beforeGetRoutesThenQuotes = Date.now();
            quotePromises.push(Promise.all([v3CandidatePoolsPromise, v2CandidatePoolsPromise]).then(([v3CandidatePools, v2CandidatePools]) => this.mixedQuoter
                .getRoutesThenQuotes(tokenIn, tokenOut, amount, amounts, percents, quoteToken, [v3CandidatePools, v2CandidatePools], tradeType, routingConfig, mixedRouteGasModel)
                .then((result) => {
                metric_1.metric.putMetric(`SwapRouteFromChain_Mixed_GetRoutesThenQuotes_Load`, Date.now() - beforeGetRoutesThenQuotes, metric_1.MetricLoggerUnit.Milliseconds);
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
            log_1.log.info({ allRoutesWithValidQuotes }, 'Received no valid quotes');
            return null;
        }
        // Given all the quotes for all the amounts for all the routes, find the best combination.
        const bestSwapRoute = await (0, best_swap_route_1.getBestSwapRoute)(amount, percents, allRoutesWithValidQuotes, tradeType, this.chainId, routingConfig, this.portionProvider, v3GasModel, swapConfig);
        if (bestSwapRoute) {
            this.emitPoolSelectionMetrics(bestSwapRoute, allCandidatePools);
        }
        return bestSwapRoute;
    }
    tradeTypeStr(tradeType) {
        return tradeType === sdk_core_1.TradeType.EXACT_INPUT ? 'ExactIn' : 'ExactOut';
    }
    tokenPairSymbolTradeTypeChainId(tokenIn, tokenOut, tradeType) {
        return `${tokenIn.symbol}/${tokenOut.symbol}/${this.tradeTypeStr(tradeType)}/${this.chainId}`;
    }
    determineCurrencyInOutFromTradeType(tradeType, amount, quoteCurrency) {
        if (tradeType === sdk_core_1.TradeType.EXACT_INPUT) {
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
        metric_1.metric.putMetric('GasPriceLoad', Date.now() - beforeGasTimestamp, metric_1.MetricLoggerUnit.Milliseconds);
        return gasPriceWei;
    }
    async getGasModels(gasPriceWei, amountToken, quoteToken, providerConfig) {
        const beforeGasModel = Date.now();
        const usdPoolPromise = (0, gas_factory_helpers_1.getHighestLiquidityV3USDPool)(this.chainId, this.v3PoolProvider, providerConfig);
        const nativeCurrency = util_1.WRAPPED_NATIVE_CURRENCY[this.chainId];
        const nativeAndQuoteTokenV3PoolPromise = !quoteToken.equals(nativeCurrency)
            ? (0, gas_factory_helpers_1.getHighestLiquidityV3NativePool)(quoteToken, this.v3PoolProvider, providerConfig)
            : Promise.resolve(null);
        const nativeAndAmountTokenV3PoolPromise = !amountToken.equals(nativeCurrency)
            ? (0, gas_factory_helpers_1.getHighestLiquidityV3NativePool)(amountToken, this.v3PoolProvider, providerConfig)
            : Promise.resolve(null);
        // If a specific gas token is specified in the provider config
        // fetch the highest liq V3 pool with it and the native currency
        const nativeAndSpecifiedGasTokenV3PoolPromise = (providerConfig === null || providerConfig === void 0 ? void 0 : providerConfig.gasToken) &&
            !(providerConfig === null || providerConfig === void 0 ? void 0 : providerConfig.gasToken.equals(nativeCurrency))
            ? (0, gas_factory_helpers_1.getHighestLiquidityV3NativePool)(providerConfig === null || providerConfig === void 0 ? void 0 : providerConfig.gasToken, this.v3PoolProvider, providerConfig)
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
        metric_1.metric.putMetric('GasModelCreation', Date.now() - beforeGasModel, metric_1.MetricLoggerUnit.Milliseconds);
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
            amounts.push(amount.multiply(new sdk_core_1.Fraction(i * distributionPercent, 100)));
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
        return Object.assign(Object.assign({}, router_sdk_1.SwapRouter.swapAndAddCallParameters(trade, {
            recipient,
            slippageTolerance,
            deadlineOrPreviousBlockhash: deadline,
            inputTokenPermit,
        }, v3_sdk_1.Position.fromAmounts({
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
        }), addLiquidityConfig, approvalTypes.approvalTokenIn, approvalTypes.approvalTokenOut)), { to: (0, util_1.SWAP_ROUTER_02_ADDRESSES)(this.chainId) });
    }
    emitPoolSelectionMetrics(swapRouteRaw, allPoolsBySelection) {
        const poolAddressesUsed = new Set();
        const { routes: routeAmounts } = swapRouteRaw;
        (0, lodash_1.default)(routeAmounts)
            .flatMap((routeAmount) => {
            const { poolAddresses } = routeAmount;
            return poolAddresses;
        })
            .forEach((address) => {
            poolAddressesUsed.add(address.toLowerCase());
        });
        for (const poolsBySelection of allPoolsBySelection) {
            const { protocol } = poolsBySelection;
            lodash_1.default.forIn(poolsBySelection.selections, (pools, topNSelection) => {
                const topNUsed = lodash_1.default.findLastIndex(pools, (pool) => poolAddressesUsed.has(pool.id.toLowerCase())) + 1;
                metric_1.metric.putMetric(lodash_1.default.capitalize(`${protocol}${topNSelection}`), topNUsed, metric_1.MetricLoggerUnit.Count);
            });
        }
        let hasV3Route = false;
        let hasV2Route = false;
        let hasMixedRoute = false;
        for (const routeAmount of routeAmounts) {
            if (routeAmount.protocol === router_sdk_1.Protocol.V3) {
                hasV3Route = true;
            }
            if (routeAmount.protocol === router_sdk_1.Protocol.V2) {
                hasV2Route = true;
            }
            if (routeAmount.protocol === router_sdk_1.Protocol.MIXED) {
                hasMixedRoute = true;
            }
        }
        if (hasMixedRoute && (hasV3Route || hasV2Route)) {
            if (hasV3Route && hasV2Route) {
                metric_1.metric.putMetric(`MixedAndV3AndV2SplitRoute`, 1, metric_1.MetricLoggerUnit.Count);
                metric_1.metric.putMetric(`MixedAndV3AndV2SplitRouteForChain${this.chainId}`, 1, metric_1.MetricLoggerUnit.Count);
            }
            else if (hasV3Route) {
                metric_1.metric.putMetric(`MixedAndV3SplitRoute`, 1, metric_1.MetricLoggerUnit.Count);
                metric_1.metric.putMetric(`MixedAndV3SplitRouteForChain${this.chainId}`, 1, metric_1.MetricLoggerUnit.Count);
            }
            else if (hasV2Route) {
                metric_1.metric.putMetric(`MixedAndV2SplitRoute`, 1, metric_1.MetricLoggerUnit.Count);
                metric_1.metric.putMetric(`MixedAndV2SplitRouteForChain${this.chainId}`, 1, metric_1.MetricLoggerUnit.Count);
            }
        }
        else if (hasV3Route && hasV2Route) {
            metric_1.metric.putMetric(`V3AndV2SplitRoute`, 1, metric_1.MetricLoggerUnit.Count);
            metric_1.metric.putMetric(`V3AndV2SplitRouteForChain${this.chainId}`, 1, metric_1.MetricLoggerUnit.Count);
        }
        else if (hasMixedRoute) {
            if (routeAmounts.length > 1) {
                metric_1.metric.putMetric(`MixedSplitRoute`, 1, metric_1.MetricLoggerUnit.Count);
                metric_1.metric.putMetric(`MixedSplitRouteForChain${this.chainId}`, 1, metric_1.MetricLoggerUnit.Count);
            }
            else {
                metric_1.metric.putMetric(`MixedRoute`, 1, metric_1.MetricLoggerUnit.Count);
                metric_1.metric.putMetric(`MixedRouteForChain${this.chainId}`, 1, metric_1.MetricLoggerUnit.Count);
            }
        }
        else if (hasV3Route) {
            if (routeAmounts.length > 1) {
                metric_1.metric.putMetric(`V3SplitRoute`, 1, metric_1.MetricLoggerUnit.Count);
                metric_1.metric.putMetric(`V3SplitRouteForChain${this.chainId}`, 1, metric_1.MetricLoggerUnit.Count);
            }
            else {
                metric_1.metric.putMetric(`V3Route`, 1, metric_1.MetricLoggerUnit.Count);
                metric_1.metric.putMetric(`V3RouteForChain${this.chainId}`, 1, metric_1.MetricLoggerUnit.Count);
            }
        }
        else if (hasV2Route) {
            if (routeAmounts.length > 1) {
                metric_1.metric.putMetric(`V2SplitRoute`, 1, metric_1.MetricLoggerUnit.Count);
                metric_1.metric.putMetric(`V2SplitRouteForChain${this.chainId}`, 1, metric_1.MetricLoggerUnit.Count);
            }
            else {
                metric_1.metric.putMetric(`V2Route`, 1, metric_1.MetricLoggerUnit.Count);
                metric_1.metric.putMetric(`V2RouteForChain${this.chainId}`, 1, metric_1.MetricLoggerUnit.Count);
            }
        }
    }
    calculateOptimalRatio(position, sqrtRatioX96, zeroForOne) {
        const upperSqrtRatioX96 = v3_sdk_1.TickMath.getSqrtRatioAtTick(position.tickUpper);
        const lowerSqrtRatioX96 = v3_sdk_1.TickMath.getSqrtRatioAtTick(position.tickLower);
        // returns Fraction(0, 1) for any out of range position regardless of zeroForOne. Implication: function
        // cannot be used to determine the trading direction of out of range positions.
        if (jsbi_1.default.greaterThan(sqrtRatioX96, upperSqrtRatioX96) ||
            jsbi_1.default.lessThan(sqrtRatioX96, lowerSqrtRatioX96)) {
            return new sdk_core_1.Fraction(0, 1);
        }
        const precision = jsbi_1.default.BigInt('1' + '0'.repeat(18));
        let optimalRatio = new sdk_core_1.Fraction(v3_sdk_1.SqrtPriceMath.getAmount0Delta(sqrtRatioX96, upperSqrtRatioX96, precision, true), v3_sdk_1.SqrtPriceMath.getAmount1Delta(sqrtRatioX96, lowerSqrtRatioX96, precision, true));
        if (!zeroForOne)
            optimalRatio = optimalRatio.invert();
        return optimalRatio;
    }
    async userHasSufficientBalance(fromAddress, tradeType, amount, quote) {
        try {
            const neededBalance = tradeType === sdk_core_1.TradeType.EXACT_INPUT ? amount : quote;
            let balance;
            if (neededBalance.currency.isNative) {
                balance = await this.provider.getBalance(fromAddress);
            }
            else {
                const tokenContract = Erc20__factory_1.Erc20__factory.connect(neededBalance.currency.address, this.provider);
                balance = await tokenContract.balanceOf(fromAddress);
            }
            return balance.gte(bignumber_1.BigNumber.from(neededBalance.quotient.toString()));
        }
        catch (e) {
            log_1.log.error(e, 'Error while checking user balance');
            return false;
        }
    }
    absoluteValue(fraction) {
        const numeratorAbs = jsbi_1.default.lessThan(fraction.numerator, jsbi_1.default.BigInt(0))
            ? jsbi_1.default.unaryMinus(fraction.numerator)
            : fraction.numerator;
        const denominatorAbs = jsbi_1.default.lessThan(fraction.denominator, jsbi_1.default.BigInt(0))
            ? jsbi_1.default.unaryMinus(fraction.denominator)
            : fraction.denominator;
        return new sdk_core_1.Fraction(numeratorAbs, denominatorAbs);
    }
    getBlockNumberPromise() {
        return (0, async_retry_1.default)(async (_b, attempt) => {
            if (attempt > 1) {
                log_1.log.info(`Get block number attempt ${attempt}`);
            }
            return this.provider.getBlockNumber();
        }, {
            retries: 2,
            minTimeout: 100,
            maxTimeout: 1000,
        });
    }
}
exports.AlphaRouter = AlphaRouter;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiYWxwaGEtcm91dGVyLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiLi4vLi4vLi4vLi4vc3JjL3JvdXRlcnMvYWxwaGEtcm91dGVyL2FscGhhLXJvdXRlci50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiOzs7Ozs7QUFBQSx3REFBcUQ7QUFDckQsd0RBQXlFO0FBQ3pFLGdFQUFnRTtBQUNoRSxvREFBd0U7QUFDeEUsZ0RBTTJCO0FBRTNCLDRDQUEwRTtBQUMxRSw4REFBZ0M7QUFDaEMsZ0RBQXdCO0FBQ3hCLG9EQUF1QjtBQUN2Qiw0REFBbUM7QUFFbkMsK0NBK0J5QjtBQUN6Qiw2RkFHcUQ7QUFLckQsdUVBRzBDO0FBQzFDLHlFQUEyRTtBQUMzRSxtRUFBK0U7QUFDL0UsdUZBR2tEO0FBQ2xELG9FQUcwQztBQUMxQyw0RUFNOEM7QUFDOUMsb0VBRzBDO0FBRTFDLDBFQUFzRDtBQUN0RCwrRUFBNEU7QUFDNUUscUNBQStFO0FBQy9FLGdEQUFvRDtBQUNwRCw4Q0FJMkI7QUFDM0Isd0VBR3dDO0FBQ3hDLHdDQUFxQztBQUNyQyxrRUFHcUM7QUFDckMsOENBQTZEO0FBQzdELHNFQUFtRTtBQUNuRSxzQ0FjbUI7QUFFbkIscUNBR2tCO0FBTWxCLGlFQUE4RTtBQUM5RSxxRkFBK0U7QUFDL0UseUVBT3lDO0FBUXpDLDZHQUE2RztBQUM3RyxtRkFBb0Y7QUFDcEYseURBQTREO0FBQzVELG1GQUFvRjtBQUNwRix1Q0FBNkU7QUFrSDdFLE1BQWEsbUJBQXVCLFNBQVEsR0FBYztJQUMvQyxHQUFHLENBQUMsR0FBVyxFQUFFLEtBQVE7UUFDaEMsT0FBTyxLQUFLLENBQUMsR0FBRyxDQUFDLEdBQUcsQ0FBQyxXQUFXLEVBQUUsRUFBRSxLQUFLLENBQUMsQ0FBQztJQUM3QyxDQUFDO0NBQ0Y7QUFKRCxrREFJQztBQUVELE1BQWEsb0JBQXFCLFNBQVEsS0FBYTtJQUNyRCxZQUFZLEdBQUcsS0FBZTtRQUM1Qix1RUFBdUU7UUFDdkUsS0FBSyxDQUFDLEdBQUcsS0FB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