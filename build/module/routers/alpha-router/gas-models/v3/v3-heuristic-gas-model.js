import { BigNumber } from '@ethersproject/bignumber';
import { ChainId, Percent, Price, TradeType } from '@uniswap/sdk-core';
import _ from 'lodash';
import { SwapType, WRAPPED_NATIVE_CURRENCY, } from '../../../..';
import { CurrencyAmount } from '../../../../util/amounts';
import { calculateArbitrumToL1FeeFromCalldata, getL2ToL1GasUsed, } from '../../../../util/gas-factory-helpers';
import { log } from '../../../../util/log';
import { buildSwapMethodParameters, buildTrade, } from '../../../../util/methodParameters';
import { getQuoteThroughNativePool, IOnChainGasModelFactory, } from '../gas-model';
import { BASE_SWAP_COST, COST_PER_HOP, COST_PER_INIT_TICK, COST_PER_UNINIT_TICK, SINGLE_HOP_OVERHEAD, TOKEN_OVERHEAD, } from './gas-costs';
/**
 * Computes a gas estimate for a V3 swap using heuristics.
 * Considers number of hops in the route, number of ticks crossed
 * and the typical base cost for a swap.
 *
 * We get the number of ticks crossed in a swap from the QuoterV2
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
 * @class V3HeuristicGasModelFactory
 */
export class V3HeuristicGasModelFactory extends IOnChainGasModelFactory {
    constructor() {
        super();
    }
    async buildGasModel({ chainId, gasPriceWei, pools, amountToken, quoteToken, l2GasDataProvider, providerConfig, }) {
        const l2GasData = l2GasDataProvider
            ? await l2GasDataProvider.getGasData(providerConfig)
            : undefined;
        const usdPool = pools.usdPool;
        const calculateL1GasFees = async (route) => {
            const swapOptions = {
                type: SwapType.UNIVERSAL_ROUTER,
                recipient: '0x0000000000000000000000000000000000000001',
                deadlineOrPreviousBlockhash: 100,
                slippageTolerance: new Percent(5, 10000),
            };
            let l1Used = BigNumber.from(0);
            let l1FeeInWei = BigNumber.from(0);
            let gasUsedL1OnL2 = BigNumber.from(0);
            const opStackChains = [
                ChainId.OPTIMISM,
                ChainId.OPTIMISM_GOERLI,
                ChainId.BASE,
                ChainId.BASE_GOERLI,
            ];
            if (opStackChains.includes(chainId)) {
                [l1Used, l1FeeInWei] = this.calculateOptimismToL1SecurityFee(route, swapOptions, l2GasData, chainId);
            }
            else if (chainId == ChainId.ARBITRUM_ONE ||
                chainId == ChainId.ARBITRUM_GOERLI) {
                [l1Used, l1FeeInWei, gasUsedL1OnL2] =
                    this.calculateArbitrumToL1SecurityFee(route, swapOptions, l2GasData, chainId);
            }
            // wrap fee to native currency
            const nativeCurrency = WRAPPED_NATIVE_CURRENCY[chainId];
            const costNativeCurrency = CurrencyAmount.fromRawAmount(nativeCurrency, l1FeeInWei.toString());
            // convert fee into usd
            const nativeTokenPrice = usdPool.token0.address == nativeCurrency.address
                ? usdPool.token0Price
                : usdPool.token1Price;
            const gasCostL1USD = nativeTokenPrice.quote(costNativeCurrency);
            let gasCostL1QuoteToken = costNativeCurrency;
            // if the inputted token is not in the native currency, quote a native/quote token pool to get the gas cost in terms of the quote token
            if (!quoteToken.equals(nativeCurrency)) {
                const nativePool = pools.nativeAndQuoteTokenV3Pool;
                if (!nativePool) {
                    log.info('Could not find a pool to convert the cost into the quote token');
                    gasCostL1QuoteToken = CurrencyAmount.fromRawAmount(quoteToken, 0);
                }
                else {
                    const nativeTokenPrice = nativePool.token0.address == nativeCurrency.address
                        ? nativePool.token0Price
                        : nativePool.token1Price;
                    gasCostL1QuoteToken = nativeTokenPrice.quote(costNativeCurrency);
                }
            }
            // gasUsedL1 is the gas units used calculated from the bytes of the calldata
            // gasCostL1USD and gasCostL1QuoteToken is the cost of gas in each of those tokens
            return {
                gasUsedL1: l1Used,
                gasUsedL1OnL2,
                gasCostL1USD,
                gasCostL1QuoteToken,
            };
        };
        const nativeCurrency = WRAPPED_NATIVE_CURRENCY[chainId];
        let nativeAmountPool = null;
        if (!amountToken.equals(nativeCurrency)) {
            nativeAmountPool = pools.nativeAndAmountTokenV3Pool;
        }
        const usdToken = usdPool.token0.equals(nativeCurrency)
            ? usdPool.token1
            : usdPool.token0;
        const estimateGasCost = (routeWithValidQuote) => {
            var _a;
            const { totalGasCostNativeCurrency, baseGasUse } = this.estimateGas(routeWithValidQuote, gasPriceWei, chainId, providerConfig);
            /** ------ MARK: USD logic  -------- */
            const gasCostInTermsOfUSD = getQuoteThroughNativePool(chainId, totalGasCostNativeCurrency, usdPool);
            /** ------ MARK: Conditional logic run if gasToken is specified  -------- */
            const nativeAndSpecifiedGasTokenPool = pools.nativeAndSpecifiedGasTokenV3Pool;
            let gasCostInTermsOfGasToken = undefined;
            // we don't want to fetch the gasToken pool if the gasToken is the native currency
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
            // Since the quote token is not in the native currency, we convert the gas cost to be in terms of the quote token.
            // We do this by getting the highest liquidity <quoteToken>/<nativeCurrency> pool. eg. <quoteToken>/ETH pool.
            const nativeAndQuoteTokenPool = pools.nativeAndQuoteTokenV3Pool;
            let gasCostInTermsOfQuoteToken = null;
            if (nativeAndQuoteTokenPool) {
                gasCostInTermsOfQuoteToken = getQuoteThroughNativePool(chainId, totalGasCostNativeCurrency, nativeAndQuoteTokenPool);
            }
            // We may have a nativeAmountPool, but not a nativePool
            else {
                log.info(`Unable to find ${nativeCurrency.symbol} pool with the quote token, ${quoteToken.symbol} to produce gas adjusted costs. Using amountToken to calculate gas costs.`);
            }
            /** ------ MARK: (V3 ONLY) Logic for calculating synthetic gas cost in terms of amount token -------- */
            // TODO: evaluate effectiveness and potentially refactor
            // Highest liquidity pool for the non quote token / ETH
            // A pool with the non quote token / ETH should not be required and errors should be handled separately
            if (nativeAmountPool) {
                // get current execution price (amountToken / quoteToken)
                const executionPrice = new Price(routeWithValidQuote.amount.currency, routeWithValidQuote.quote.currency, routeWithValidQuote.amount.quotient, routeWithValidQuote.quote.quotient);
                const inputIsToken0 = nativeAmountPool.token0.address == nativeCurrency.address;
                // ratio of input / native
                const nativeAndAmountTokenPrice = inputIsToken0
                    ? nativeAmountPool.token0Price
                    : nativeAmountPool.token1Price;
                const gasCostInTermsOfAmountToken = nativeAndAmountTokenPrice.quote(totalGasCostNativeCurrency);
                // Convert gasCostInTermsOfAmountToken to quote token using execution price
                const syntheticGasCostInTermsOfQuoteToken = executionPrice.quote(gasCostInTermsOfAmountToken);
                // Note that the syntheticGasCost being lessThan the original quoted value is not always strictly better
                // e.g. the scenario where the amountToken/ETH pool is very illiquid as well and returns an extremely small number
                // however, it is better to have the gasEstimation be almost 0 than almost infinity, as the user will still receive a quote
                if (gasCostInTermsOfQuoteToken === null ||
                    syntheticGasCostInTermsOfQuoteToken.lessThan(gasCostInTermsOfQuoteToken.asFraction)) {
                    log.info({
                        nativeAndAmountTokenPrice: nativeAndAmountTokenPrice.toSignificant(6),
                        gasCostInTermsOfQuoteToken: gasCostInTermsOfQuoteToken
                            ? gasCostInTermsOfQuoteToken.toExact()
                            : 0,
                        gasCostInTermsOfAmountToken: gasCostInTermsOfAmountToken.toExact(),
                        executionPrice: executionPrice.toSignificant(6),
                        syntheticGasCostInTermsOfQuoteToken: syntheticGasCostInTermsOfQuoteToken.toSignificant(6),
                    }, 'New gasCostInTermsOfQuoteToken calculated with synthetic quote token price is less than original');
                    gasCostInTermsOfQuoteToken = syntheticGasCostInTermsOfQuoteToken;
                }
            }
            // If gasCostInTermsOfQuoteToken is null, both attempts to calculate gasCostInTermsOfQuoteToken failed (nativePool and amountNativePool)
            if (gasCostInTermsOfQuoteToken === null) {
                log.info(`Unable to find ${nativeCurrency.symbol} pool with the quote token, ${quoteToken.symbol}, or amount Token, ${amountToken.symbol} to produce gas adjusted costs. Route will not account for gas.`);
                return {
                    gasEstimate: baseGasUse,
                    gasCostInToken: CurrencyAmount.fromRawAmount(quoteToken, 0),
                    gasCostInUSD: CurrencyAmount.fromRawAmount(usdToken, 0),
                };
            }
            return {
                gasEstimate: baseGasUse,
                gasCostInToken: gasCostInTermsOfQuoteToken,
                gasCostInUSD: gasCostInTermsOfUSD,
                gasCostInGasToken: gasCostInTermsOfGasToken,
            };
        };
        return {
            estimateGasCost: estimateGasCost.bind(this),
            calculateL1GasFees,
        };
    }
    estimateGas(routeWithValidQuote, gasPriceWei, chainId, providerConfig) {
        var _a;
        const totalInitializedTicksCrossed = BigNumber.from(Math.max(1, _.sum(routeWithValidQuote.initializedTicksCrossedList)));
        const totalHops = BigNumber.from(routeWithValidQuote.route.pools.length);
        let hopsGasUse = COST_PER_HOP(chainId).mul(totalHops);
        // We have observed that this algorithm tends to underestimate single hop swaps.
        // We add a buffer in the case of a single hop swap.
        if (totalHops.eq(1)) {
            hopsGasUse = hopsGasUse.add(SINGLE_HOP_OVERHEAD(chainId));
        }
        // Some tokens have extremely expensive transferFrom functions, which causes
        // us to underestimate them by a large amount. For known tokens, we apply an
        // adjustment.
        const tokenOverhead = TOKEN_OVERHEAD(chainId, routeWithValidQuote.route);
        const tickGasUse = COST_PER_INIT_TICK(chainId).mul(totalInitializedTicksCrossed);
        const uninitializedTickGasUse = COST_PER_UNINIT_TICK.mul(0);
        // base estimate gas used based on chainId estimates for hops and ticks gas useage
        const baseGasUse = BASE_SWAP_COST(chainId)
            .add(hopsGasUse)
            .add(tokenOverhead)
            .add(tickGasUse)
            .add(uninitializedTickGasUse)
            .add((_a = providerConfig === null || providerConfig === void 0 ? void 0 : providerConfig.additionalGasOverhead) !== null && _a !== void 0 ? _a : BigNumber.from(0));
        const baseGasCostWei = gasPriceWei.mul(baseGasUse);
        const wrappedCurrency = WRAPPED_NATIVE_CURRENCY[chainId];
        const totalGasCostNativeCurrency = CurrencyAmount.fromRawAmount(wrappedCurrency, baseGasCostWei.toString());
        return {
            totalGasCostNativeCurrency,
            totalInitializedTicksCrossed,
            baseGasUse,
        };
    }
    /**
     * To avoid having a call to optimism's L1 security fee contract for every route and amount combination,
     * we replicate the gas cost accounting here.
     */
    calculateOptimismToL1SecurityFee(routes, swapConfig, gasData, chainId) {
        const { l1BaseFee, scalar, decimals, overhead } = gasData;
        const route = routes[0];
        const amountToken = route.tradeType == TradeType.EXACT_INPUT
            ? route.amount.currency
            : route.quote.currency;
        const outputToken = route.tradeType == TradeType.EXACT_INPUT
            ? route.quote.currency
            : route.amount.currency;
        // build trade for swap calldata
        const trade = buildTrade(amountToken, outputToken, route.tradeType, routes);
        const data = buildSwapMethodParameters(trade, swapConfig, ChainId.OPTIMISM).calldata;
        const l1GasUsed = getL2ToL1GasUsed(data, overhead, chainId);
        // l1BaseFee is L1 Gas Price on etherscan
        const l1Fee = l1GasUsed.mul(l1BaseFee);
        const unscaled = l1Fee.mul(scalar);
        // scaled = unscaled / (10 ** decimals)
        const scaledConversion = BigNumber.from(10).pow(decimals);
        const scaled = unscaled.div(scaledConversion);
        // TODO: also return the gasUsedL1OnL2 because the final estimateGasUsed should include L1 calldata posting fee
        return [l1GasUsed, scaled];
    }
    calculateArbitrumToL1SecurityFee(routes, swapConfig, gasData, chainId) {
        const route = routes[0];
        const amountToken = route.tradeType == TradeType.EXACT_INPUT
            ? route.amount.currency
            : route.quote.currency;
        const outputToken = route.tradeType == TradeType.EXACT_INPUT
            ? route.quote.currency
            : route.amount.currency;
        // build trade for swap calldata
        const trade = buildTrade(amountToken, outputToken, route.tradeType, routes);
        const data = buildSwapMethodParameters(trade, swapConfig, ChainId.ARBITRUM_ONE).calldata;
        return calculateArbitrumToL1FeeFromCalldata(data, gasData, chainId);
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidjMtaGV1cmlzdGljLWdhcy1tb2RlbC5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbIi4uLy4uLy4uLy4uLy4uLy4uL3NyYy9yb3V0ZXJzL2FscGhhLXJvdXRlci9nYXMtbW9kZWxzL3YzL3YzLWhldXJpc3RpYy1nYXMtbW9kZWwudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUEsT0FBTyxFQUFFLFNBQVMsRUFBRSxNQUFNLDBCQUEwQixDQUFDO0FBQ3JELE9BQU8sRUFBRSxPQUFPLEVBQUUsT0FBTyxFQUFFLEtBQUssRUFBRSxTQUFTLEVBQUUsTUFBTSxtQkFBbUIsQ0FBQztBQUV2RSxPQUFPLENBQUMsTUFBTSxRQUFRLENBQUM7QUFFdkIsT0FBTyxFQUVMLFFBQVEsRUFDUix1QkFBdUIsR0FDeEIsTUFBTSxhQUFhLENBQUM7QUFLckIsT0FBTyxFQUFFLGNBQWMsRUFBRSxNQUFNLDBCQUEwQixDQUFDO0FBQzFELE9BQU8sRUFDTCxvQ0FBb0MsRUFDcEMsZ0JBQWdCLEdBQ2pCLE1BQU0sc0NBQXNDLENBQUM7QUFDOUMsT0FBTyxFQUFFLEdBQUcsRUFBRSxNQUFNLHNCQUFzQixDQUFDO0FBQzNDLE9BQU8sRUFDTCx5QkFBeUIsRUFDekIsVUFBVSxHQUNYLE1BQU0sbUNBQW1DLENBQUM7QUFFM0MsT0FBTyxFQUdMLHlCQUF5QixFQUV6Qix1QkFBdUIsR0FDeEIsTUFBTSxjQUFjLENBQUM7QUFFdEIsT0FBTyxFQUNMLGNBQWMsRUFDZCxZQUFZLEVBQ1osa0JBQWtCLEVBQ2xCLG9CQUFvQixFQUNwQixtQkFBbUIsRUFDbkIsY0FBYyxHQUNmLE1BQU0sYUFBYSxDQUFDO0FBRXJCOzs7Ozs7Ozs7Ozs7Ozs7OztHQWlCRztBQUNILE1BQU0sT0FBTywwQkFBMkIsU0FBUSx1QkFBdUI7SUFDckU7UUFDRSxLQUFLLEVBQUUsQ0FBQztJQUNWLENBQUM7SUFFTSxLQUFLLENBQUMsYUFBYSxDQUFDLEVBQ3pCLE9BQU8sRUFDUCxXQUFXLEVBQ1gsS0FBSyxFQUNM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