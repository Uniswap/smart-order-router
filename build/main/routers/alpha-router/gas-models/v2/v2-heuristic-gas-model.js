"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.V2HeuristicGasModelFactory = exports.COST_PER_EXTRA_HOP = exports.BASE_SWAP_COST = void 0;
const bignumber_1 = require("@ethersproject/bignumber");
const lodash_1 = __importDefault(require("lodash"));
const util_1 = require("../../../../util");
const amounts_1 = require("../../../../util/amounts");
const gas_model_1 = require("../gas-model");
// Constant cost for doing any swap regardless of pools.
exports.BASE_SWAP_COST = bignumber_1.BigNumber.from(135000); // 115000, bumped up by 20_000 @eric 7/8/2022
// Constant per extra hop in the route.
exports.COST_PER_EXTRA_HOP = bignumber_1.BigNumber.from(50000); // 20000, bumped up by 30_000 @eric 7/8/2022
/**
 * Computes a gas estimate for a V2 swap using heuristics.
 * Considers number of hops in the route and the typical base cost for a swap.
 *
 * We compute gas estimates off-chain because
 *  1/ Calling eth_estimateGas for a swaps requires the caller to have
 *     the full balance token being swapped, and approvals.
 *  2/ Tracking gas used using a wrapper contract is not accurate with Multicall
 *     due to EIP-2929. We would have to make a request for every swap we wanted to estimate.
 *  3/ For V2 we simulate all our swaps off-chain so have no way to track gas used.
 *
 * Note, certain tokens e.g. rebasing/fee-on-transfer, may incur higher gas costs than
 * what we estimate here. This is because they run extra logic on token transfer.
 *
 * @export
 * @class V2HeuristicGasModelFactory
 */
class V2HeuristicGasModelFactory extends gas_model_1.IV2GasModelFactory {
    constructor() {
        super();
    }
    async buildGasModel({ chainId, gasPriceWei, poolProvider, token, providerConfig, }) {
        const usdPoolPromise = this.getHighestLiquidityUSDPool(chainId, poolProvider, providerConfig);
        // Only fetch the native gasToken pool if specified by the config AND the gas token is not the native currency.
        const nativeAndSpecifiedGasTokenPoolPromise = (providerConfig === null || providerConfig === void 0 ? void 0 : providerConfig.gasToken) &&
            !(providerConfig === null || providerConfig === void 0 ? void 0 : providerConfig.gasToken.equals(util_1.WRAPPED_NATIVE_CURRENCY[chainId]))
            ? this.getEthPool(chainId, providerConfig.gasToken, poolProvider, providerConfig)
            : Promise.resolve(null);
        const [usdPool, nativeAndSpecifiedGasTokenPool] = await Promise.all([
            usdPoolPromise,
            nativeAndSpecifiedGasTokenPoolPromise,
        ]);
        let ethPool = null;
        if (!token.equals(util_1.WRAPPED_NATIVE_CURRENCY[chainId])) {
            ethPool = await this.getEthPool(chainId, token, poolProvider, providerConfig);
        }
        const usdToken = usdPool.token0.address == util_1.WRAPPED_NATIVE_CURRENCY[chainId].address
            ? usdPool.token1
            : usdPool.token0;
        return {
            estimateGasCost: (routeWithValidQuote) => {
                var _a;
                const { gasCostInEth, gasUse } = this.estimateGas(routeWithValidQuote, gasPriceWei, chainId, providerConfig);
                /** ------ MARK: USD logic  -------- */
                const gasCostInTermsOfUSD = (0, gas_model_1.getQuoteThroughNativePool)(chainId, gasCostInEth, usdPool);
                /** ------ MARK: Conditional logic run if gasToken is specified  -------- */
                let gasCostInTermsOfGasToken = undefined;
                if (nativeAndSpecifiedGasTokenPool) {
                    gasCostInTermsOfGasToken = (0, gas_model_1.getQuoteThroughNativePool)(chainId, gasCostInEth, nativeAndSpecifiedGasTokenPool);
                }
                // if the gasToken is the native currency, we can just use the gasCostInEth
                else if ((_a = providerConfig === null || providerConfig === void 0 ? void 0 : providerConfig.gasToken) === null || _a === void 0 ? void 0 : _a.equals(util_1.WRAPPED_NATIVE_CURRENCY[chainId])) {
                    gasCostInTermsOfGasToken = gasCostInEth;
                }
                /** ------ MARK: return early if quoteToken is wrapped native currency ------- */
                if (token.equals(util_1.WRAPPED_NATIVE_CURRENCY[chainId])) {
                    return {
                        gasEstimate: gasUse,
                        gasCostInToken: gasCostInEth,
                        gasCostInUSD: gasCostInTermsOfUSD,
                        gasCostInGasToken: gasCostInTermsOfGasToken,
                    };
                }
                // If the quote token is not WETH, we convert the gas cost to be in terms of the quote token.
                // We do this by getting the highest liquidity <token>/ETH pool.
                if (!ethPool) {
                    util_1.log.info('Unable to find ETH pool with the quote token to produce gas adjusted costs. Route will not account for gas.');
                    return {
                        gasEstimate: gasUse,
                        gasCostInToken: amounts_1.CurrencyAmount.fromRawAmount(token, 0),
                        gasCostInUSD: amounts_1.CurrencyAmount.fromRawAmount(usdToken, 0),
                    };
                }
                const gasCostInTermsOfQuoteToken = (0, gas_model_1.getQuoteThroughNativePool)(chainId, gasCostInEth, ethPool);
                return {
                    gasEstimate: gasUse,
                    gasCostInToken: gasCostInTermsOfQuoteToken,
                    gasCostInUSD: gasCostInTermsOfUSD,
                    gasCostInGasToken: gasCostInTermsOfGasToken,
                };
            },
        };
    }
    estimateGas(routeWithValidQuote, gasPriceWei, chainId, providerConfig) {
        const hops = routeWithValidQuote.route.pairs.length;
        let gasUse = exports.BASE_SWAP_COST.add(exports.COST_PER_EXTRA_HOP.mul(hops - 1));
        if (providerConfig === null || providerConfig === void 0 ? void 0 : providerConfig.additionalGasOverhead) {
            gasUse = gasUse.add(providerConfig.additionalGasOverhead);
        }
        const totalGasCostWei = gasPriceWei.mul(gasUse);
        const weth = util_1.WRAPPED_NATIVE_CURRENCY[chainId];
        const gasCostInEth = amounts_1.CurrencyAmount.fromRawAmount(weth, totalGasCostWei.toString());
        return { gasCostInEth, gasUse };
    }
    async getEthPool(chainId, token, poolProvider, providerConfig) {
        const weth = util_1.WRAPPED_NATIVE_CURRENCY[chainId];
        const poolAccessor = await poolProvider.getPools([[weth, token]], providerConfig);
        const pool = poolAccessor.getPool(weth, token);
        if (!pool || pool.reserve0.equalTo(0) || pool.reserve1.equalTo(0)) {
            util_1.log.error({
                weth,
                token,
                reserve0: pool === null || pool === void 0 ? void 0 : pool.reserve0.toExact(),
                reserve1: pool === null || pool === void 0 ? void 0 : pool.reserve1.toExact(),
            }, `Could not find a valid WETH pool with ${token.symbol} for computing gas costs.`);
            return null;
        }
        return pool;
    }
    async getHighestLiquidityUSDPool(chainId, poolProvider, providerConfig) {
        const usdTokens = gas_model_1.usdGasTokensByChain[chainId];
        if (!usdTokens) {
            throw new Error(`Could not find a USD token for computing gas costs on ${chainId}`);
        }
        const usdPools = lodash_1.default.map(usdTokens, (usdToken) => [
            usdToken,
            util_1.WRAPPED_NATIVE_CURRENCY[chainId],
        ]);
        const poolAccessor = await poolProvider.getPools(usdPools, providerConfig);
        const poolsRaw = poolAccessor.getAllPools();
        const pools = lodash_1.default.filter(poolsRaw, (pool) => pool.reserve0.greaterThan(0) &&
            pool.reserve1.greaterThan(0) &&
            // this case should never happen in production, but when we mock the pool provider it may return non native pairs
            (pool.token0.equals(util_1.WRAPPED_NATIVE_CURRENCY[chainId]) ||
                pool.token1.equals(util_1.WRAPPED_NATIVE_CURRENCY[chainId])));
        if (pools.length == 0) {
            util_1.log.error({ pools }, `Could not find a USD/WETH pool for computing gas costs.`);
            throw new Error(`Can't find USD/WETH pool for computing gas costs.`);
        }
        const maxPool = lodash_1.default.maxBy(pools, (pool) => {
            if (pool.token0.equals(util_1.WRAPPED_NATIVE_CURRENCY[chainId])) {
                return parseFloat(pool.reserve0.toSignificant(2));
            }
            else {
                return parseFloat(pool.reserve1.toSignificant(2));
            }
        });
        return maxPool;
    }
}
exports.V2HeuristicGasModelFactory = V2HeuristicGasModelFactory;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidjItaGV1cmlzdGljLWdhcy1tb2RlbC5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbIi4uLy4uLy4uLy4uLy4uLy4uL3NyYy9yb3V0ZXJzL2FscGhhLXJvdXRlci9nYXMtbW9kZWxzL3YyL3YyLWhldXJpc3RpYy1nYXMtbW9kZWwudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7Ozs7O0FBQUEsd0RBQXFEO0FBR3JELG9EQUF1QjtBQUl2QiwyQ0FBZ0U7QUFDaEUsc0RBQTBEO0FBRTFELDRDQU9zQjtBQUV0Qix3REFBd0Q7QUFDM0MsUUFBQSxjQUFjLEdBQUcscUJBQVMsQ0FBQyxJQUFJLENBQUMsTUFBTSxDQUFDLENBQUMsQ0FBQyw2Q0FBNkM7QUFFbkcsdUNBQXVDO0FBQzFCLFFBQUEsa0JBQWtCLEdBQUcscUJBQVMsQ0FBQyxJQUFJLENBQUMsS0FBSyxDQUFDLENBQUMsQ0FBQyw0Q0FBNEM7QUFFckc7Ozs7Ozs7Ozs7Ozs7Ozs7R0FnQkc7QUFDSCxNQUFhLDBCQUEyQixTQUFRLDhCQUFrQjtJQUNoRTtRQUNFLEtBQUssRUFBRSxDQUFDO0lBQ1YsQ0FBQztJQUVNLEtBQUssQ0FBQyxhQUFhLENBQUMsRUFDekIsT0FBTyxFQUNQLFdBQVcsRUFDWCxZQUFZLEVBQ1osS0FBSyxFQUNMLGNBQWMsR0FDYTtRQUMzQixNQUFNLGNBQWMsR0FBa0IsSUFBSSxDQUFDLDBCQUEwQixDQUNuRSxPQUFPLEVBQ1AsWUFBWSxFQUNaLGNBQWMsQ0FDZixDQUFDO1FBRUYsK0dBQStHO1FBQy9HLE1BQU0scUNBQXFDLEdBQ3pDLENBQUEsY0FBYyxhQUFkLGNBQWMsdUJBQWQsY0FBYyxDQUFFLFFBQVE7WUFDeEIsQ0FBQyxDQUFBLGNBQWMsYUFBZCxjQUFjLHVCQUFkLGNBQWMsQ0FBRSxRQUFRLENBQUMsTUFBTSxDQUFDLDhCQUF1QixDQUFDLE9BQU8sQ0FBRSxDQUFDLENBQUE7WUFDakUsQ0FBQyxDQUFDLElBQUksQ0FBQyxVQUFVLENBQ2IsT0FBTyxFQUNQLGNBQWMs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