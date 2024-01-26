import { BigNumber } from '@ethersproject/bignumber';
import { partitionMixedRouteByProtocol } from '@uniswap/router-sdk';
import { Pair } from '@uniswap/v2-sdk';
import { Pool } from '@uniswap/v3-sdk';
import JSBI from 'jsbi';
import _ from 'lodash';
import { WRAPPED_NATIVE_CURRENCY } from '../../../..';
import { log } from '../../../../util';
import { CurrencyAmount } from '../../../../util/amounts';
import { getV2NativePool } from '../../../../util/gas-factory-helpers';
import { getQuoteThroughNativePool, IOnChainGasModelFactory, } from '../gas-model';
import { BASE_SWAP_COST as BASE_SWAP_COST_V2, COST_PER_EXTRA_HOP as COST_PER_EXTRA_HOP_V2, } from '../v2/v2-heuristic-gas-model';
import { BASE_SWAP_COST, COST_PER_HOP, COST_PER_INIT_TICK, COST_PER_UNINIT_TICK, } from '../v3/gas-costs';
/**
 * Computes a gas estimate for a mixed route swap using heuristics.
 * Considers number of hops in the route, number of ticks crossed
 * and the typical base cost for a swap.
 *
 * We get the number of ticks crossed in a swap from the MixedRouteQuoterV1
 * contract.
 *
 * We compute gas estimates off-chain because
 *  1/ Calling eth_estimateGas for a swaps requires the caller to have
 *     the full balance token being swapped, and approvals.
 *  2/ Tracking gas used using a wrapper contract is not accurate with Multicall
 *     due to EIP-2929. We would have to make a request for every swap we wanted to estimate.
 *  3/ For V2 we simulate all our swaps off-chain so have no way to track gas used.
 *
 * @export
 * @class MixedRouteHeuristicGasModelFactory
 */
export class MixedRouteHeuristicGasModelFactory extends IOnChainGasModelFactory {
    constructor() {
        super();
    }
    async buildGasModel({ chainId, gasPriceWei, pools, quoteToken, v2poolProvider: V2poolProvider, providerConfig, }) {
        const nativeCurrency = WRAPPED_NATIVE_CURRENCY[chainId];
        const usdPool = pools.usdPool;
        const usdToken = usdPool.token0.equals(nativeCurrency)
            ? usdPool.token1
            : usdPool.token0;
        let nativeV2Pool;
        // Avoid fetching for a (WETH,WETH) pool here, we handle the quoteToken = wrapped native case in estimateGasCost
        if (!quoteToken.equals(nativeCurrency) && V2poolProvider) {
            /// MixedRoutes
            nativeV2Pool = await getV2NativePool(quoteToken, V2poolProvider, providerConfig);
        }
        const estimateGasCost = (routeWithValidQuote) => {
            var _a;
            const { totalGasCostNativeCurrency, baseGasUse } = this.estimateGas(routeWithValidQuote, gasPriceWei, chainId, providerConfig);
            /** ------ MARK: USD Logic -------- */
            const gasCostInTermsOfUSD = getQuoteThroughNativePool(chainId, totalGasCostNativeCurrency, usdPool);
            /** ------ MARK: Conditional logic run if gasToken is specified  -------- */
            const nativeAndSpecifiedGasTokenPool = pools.nativeAndSpecifiedGasTokenV3Pool;
            let gasCostInTermsOfGasToken = undefined;
            if (nativeAndSpecifiedGasTokenPool) {
                gasCostInTermsOfGasToken = getQuoteThroughNativePool(chainId, totalGasCostNativeCurrency, nativeAndSpecifiedGasTokenPool);
            }
            // if the gasToken is the native currency, we can just use the totalGasCostNativeCurrency
            else if ((_a = providerConfig === null || providerConfig === void 0 ? void 0 : providerConfig.gasToken) === null || _a === void 0 ? void 0 : _a.equals(nativeCurrency)) {
                gasCostInTermsOfGasToken = totalGasCostNativeCurrency;
            }
            /** ------ MARK: return early if quoteToken is wrapped native currency ------- */
            if (quoteToken.equals(nativeCurrency)) {
                return {
                    gasEstimate: baseGasUse,
                    gasCostInToken: totalGasCostNativeCurrency,
                    gasCostInUSD: gasCostInTermsOfUSD,
                    gasCostInGasToken: gasCostInTermsOfGasToken,
                };
            }
            /** ------ MARK: Main gas logic in terms of quote token -------- */
            // If the quote token is not in the native currency, we convert the gas cost to be in terms of the quote token.
            // We do this by getting the highest liquidity <quoteToken>/<nativeCurrency> pool. eg. <quoteToken>/ETH pool.
            const nativeV3Pool = pools.nativeAndQuoteTokenV3Pool;
            if (!nativeV3Pool && !nativeV2Pool) {
                log.info(`Unable to find ${nativeCurrency.symbol} pool with the quote token, ${quoteToken.symbol} to produce gas adjusted costs. Route will not account for gas.`);
                return {
                    gasEstimate: baseGasUse,
                    gasCostInToken: CurrencyAmount.fromRawAmount(quoteToken, 0),
                    gasCostInUSD: CurrencyAmount.fromRawAmount(usdToken, 0),
                };
            }
            /// we will use nativeV2Pool for fallback if nativeV3 does not exist or has 0 liquidity
            /// can use ! here because we return above if v3Pool and v2Pool are null
            const nativePool = (!nativeV3Pool || JSBI.equal(nativeV3Pool.liquidity, JSBI.BigInt(0))) &&
                nativeV2Pool
                ? nativeV2Pool
                : nativeV3Pool;
            const gasCostInTermsOfQuoteToken = getQuoteThroughNativePool(chainId, totalGasCostNativeCurrency, nativePool);
            return {
                gasEstimate: baseGasUse,
                gasCostInToken: gasCostInTermsOfQuoteToken,
                gasCostInUSD: gasCostInTermsOfUSD,
                gasCostInGasToken: gasCostInTermsOfGasToken,
            };
        };
        return {
            estimateGasCost: estimateGasCost.bind(this),
        };
    }
    estimateGas(routeWithValidQuote, gasPriceWei, chainId, providerConfig) {
        const totalInitializedTicksCrossed = BigNumber.from(Math.max(1, _.sum(routeWithValidQuote.initializedTicksCrossedList)));
        /**
         * Since we must make a separate call to multicall for each v3 and v2 section, we will have to
         * add the BASE_SWAP_COST to each section.
         */
        let baseGasUse = BigNumber.from(0);
        const route = routeWithValidQuote.route;
        const res = partitionMixedRouteByProtocol(route);
        res.map((section) => {
            if (section.every((pool) => pool instanceof Pool)) {
                baseGasUse = baseGasUse.add(BASE_SWAP_COST(chainId));
                baseGasUse = baseGasUse.add(COST_PER_HOP(chainId).mul(section.length));
            }
            else if (section.every((pool) => pool instanceof Pair)) {
                baseGasUse = baseGasUse.add(BASE_SWAP_COST_V2);
                baseGasUse = baseGasUse.add(
                /// same behavior in v2 heuristic gas model factory
                COST_PER_EXTRA_HOP_V2.mul(section.length - 1));
            }
        });
        const tickGasUse = COST_PER_INIT_TICK(chainId).mul(totalInitializedTicksCrossed);
        const uninitializedTickGasUse = COST_PER_UNINIT_TICK.mul(0);
        // base estimate gas used based on chainId estimates for hops and ticks gas useage
        baseGasUse = baseGasUse.add(tickGasUse).add(uninitializedTickGasUse);
        if (providerConfig === null || providerConfig === void 0 ? void 0 : providerConfig.additionalGasOverhead) {
            baseGasUse = baseGasUse.add(providerConfig.additionalGasOverhead);
        }
        const baseGasCostWei = gasPriceWei.mul(baseGasUse);
        const wrappedCurrency = WRAPPED_NATIVE_CURRENCY[chainId];
        const totalGasCostNativeCurrency = CurrencyAmount.fromRawAmount(wrappedCurrency, baseGasCostWei.toString());
        return {
            totalGasCostNativeCurrency,
            totalInitializedTicksCrossed,
            baseGasUse,
        };
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibWl4ZWQtcm91dGUtaGV1cmlzdGljLWdhcy1tb2RlbC5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbIi4uLy4uLy4uLy4uLy4uLy4uL3NyYy9yb3V0ZXJzL2FscGhhLXJvdXRlci9nYXMtbW9kZWxzL21peGVkUm91dGUvbWl4ZWQtcm91dGUtaGV1cmlzdGljLWdhcy1tb2RlbC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQSxPQUFPLEVBQUUsU0FBUyxFQUFFLE1BQU0sMEJBQTBCLENBQUM7QUFDckQsT0FBTyxFQUFFLDZCQUE2QixFQUFFLE1BQU0scUJBQXFCLENBQUM7QUFFcEUsT0FBTyxFQUFFLElBQUksRUFBRSxNQUFNLGlCQUFpQixDQUFDO0FBQ3ZDLE9BQU8sRUFBRSxJQUFJLEVBQUUsTUFBTSxpQkFBaUIsQ0FBQztBQUN2QyxPQUFPLElBQUksTUFBTSxNQUFNLENBQUM7QUFDeEIsT0FBTyxDQUFDLE1BQU0sUUFBUSxDQUFDO0FBRXZCLE9BQU8sRUFBRSx1QkFBdUIsRUFBRSxNQUFNLGFBQWEsQ0FBQztBQUN0RCxPQUFPLEVBQUUsR0FBRyxFQUFFLE1BQU0sa0JBQWtCLENBQUM7QUFDdkMsT0FBTyxFQUFFLGNBQWMsRUFBRSxNQUFNLDBCQUEwQixDQUFDO0FBQzFELE9BQU8sRUFBRSxlQUFlLEVBQUUsTUFBTSxzQ0FBc0MsQ0FBQztBQUV2RSxPQUFPLEVBR0wseUJBQXlCLEVBRXpCLHVCQUF1QixHQUN4QixNQUFNLGNBQWMsQ0FBQztBQUN0QixPQUFPLEVBQ0wsY0FBYyxJQUFJLGlCQUFpQixFQUNuQyxrQkFBa0IsSUFBSSxxQkFBcUIsR0FDNUMsTUFBTSw4QkFBOEIsQ0FBQztBQUN0QyxPQUFPLEVBQ0wsY0FBYyxFQUNkLFlBQVksRUFDWixrQkFBa0IsRUFDbEIsb0JBQW9CLEdBQ3JCLE1BQU0saUJBQWlCLENBQUM7QUFFekI7Ozs7Ozs7Ozs7Ozs7Ozs7O0dBaUJHO0FBQ0gsTUFBTSxPQUFPLGtDQUFtQyxTQUFRLHVCQUF1QjtJQUM3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