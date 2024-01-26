"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getQuoteThroughNativePool = exports.IOnChainGasModelFactory = exports.IV2GasModelFactory = exports.usdGasTokensByChain = void 0;
const sdk_core_1 = require("@uniswap/sdk-core");
const token_provider_1 = require("../../../providers/token-provider");
const util_1 = require("../../../util");
// When adding new usd gas tokens, ensure the tokens are ordered
// from tokens with highest decimals to lowest decimals. For example,
// DAI_AVAX has 18 decimals and comes before USDC_AVAX which has 6 decimals.
exports.usdGasTokensByChain = {
    [sdk_core_1.ChainId.MAINNET]: [token_provider_1.DAI_MAINNET, token_provider_1.USDC_MAINNET, token_provider_1.USDT_MAINNET],
    [sdk_core_1.ChainId.ARBITRUM_ONE]: [token_provider_1.DAI_ARBITRUM, token_provider_1.USDC_ARBITRUM, token_provider_1.USDT_ARBITRUM],
    [sdk_core_1.ChainId.OPTIMISM]: [token_provider_1.DAI_OPTIMISM, token_provider_1.USDC_OPTIMISM, token_provider_1.USDT_OPTIMISM],
    [sdk_core_1.ChainId.OPTIMISM_GOERLI]: [
        token_provider_1.DAI_OPTIMISM_GOERLI,
        token_provider_1.USDC_OPTIMISM_GOERLI,
        token_provider_1.USDT_OPTIMISM_GOERLI,
    ],
    [sdk_core_1.ChainId.ARBITRUM_GOERLI]: [token_provider_1.USDC_ARBITRUM_GOERLI],
    [sdk_core_1.ChainId.GOERLI]: [token_provider_1.DAI_GOERLI, token_provider_1.USDC_GOERLI, token_provider_1.USDT_GOERLI, token_provider_1.WBTC_GOERLI],
    [sdk_core_1.ChainId.SEPOLIA]: [token_provider_1.USDC_SEPOLIA, token_provider_1.DAI_SEPOLIA],
    [sdk_core_1.ChainId.POLYGON]: [token_provider_1.USDC_POLYGON],
    [sdk_core_1.ChainId.POLYGON_MUMBAI]: [token_provider_1.DAI_POLYGON_MUMBAI],
    [sdk_core_1.ChainId.CELO]: [token_provider_1.CUSD_CELO],
    [sdk_core_1.ChainId.CELO_ALFAJORES]: [token_provider_1.CUSD_CELO_ALFAJORES],
    [sdk_core_1.ChainId.GNOSIS]: [token_provider_1.USDC_ETHEREUM_GNOSIS],
    [sdk_core_1.ChainId.MOONBEAM]: [token_provider_1.USDC_MOONBEAM],
    [sdk_core_1.ChainId.BNB]: [token_provider_1.USDT_BNB, token_provider_1.USDC_BNB, token_provider_1.DAI_BNB],
    [sdk_core_1.ChainId.AVALANCHE]: [token_provider_1.DAI_AVAX, token_provider_1.USDC_AVAX],
    [sdk_core_1.ChainId.BASE]: [token_provider_1.USDC_BASE],
    [sdk_core_1.ChainId.UNREAL]: [token_provider_1.DAI_UNREAL],
};
/**
 * Factory for building gas models that can be used with any route to generate
 * gas estimates.
 *
 * Factory model is used so that any supporting data can be fetched once and
 * returned as part of the model.
 *
 * @export
 * @abstract
 * @class IV2GasModelFactory
 */
class IV2GasModelFactory {
}
exports.IV2GasModelFactory = IV2GasModelFactory;
/**
 * Factory for building gas models that can be used with any route to generate
 * gas estimates.
 *
 * Factory model is used so that any supporting data can be fetched once and
 * returned as part of the model.
 *
 * @export
 * @abstract
 * @class IOnChainGasModelFactory
 */
class IOnChainGasModelFactory {
}
exports.IOnChainGasModelFactory = IOnChainGasModelFactory;
// Determines if native currency is token0
// Gets the native price of the pool, dependent on 0 or 1
// quotes across the pool
const getQuoteThroughNativePool = (chainId, nativeTokenAmount, nativeTokenPool) => {
    const nativeCurrency = util_1.WRAPPED_NATIVE_CURRENCY[chainId];
    const isToken0 = nativeTokenPool.token0.equals(nativeCurrency);
    // returns mid price in terms of the native currency (the ratio of token/nativeToken)
    const nativeTokenPrice = isToken0
        ? nativeTokenPool.token0Price
        : nativeTokenPool.token1Price;
    // return gas cost in terms of the non native currency
    return nativeTokenPrice.quote(nativeTokenAmount);
};
exports.getQuoteThroughNativePool = getQuoteThroughNativePool;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZ2FzLW1vZGVsLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiLi4vLi4vLi4vLi4vLi4vc3JjL3JvdXRlcnMvYWxwaGEtcm91dGVyL2dhcy1tb2RlbHMvZ2FzLW1vZGVsLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7OztBQUNBLGdEQUkyQjtBQUszQixzRUFpQzJDO0FBTzNDLHdDQUF3RDtBQVN4RCxnRUFBZ0U7QUFDaEUscUVBQXFFO0FBQ3JFLDRFQUE0RTtBQUMvRCxRQUFBLG1CQUFtQixHQUF1QztJQUNyRSxDQUFDLGtCQUFPLENBQUMsT0FBTyxDQUFDLEVBQUUsQ0FBQyw0QkFBVyxFQUFFLDZCQUFZLEVBQUUsNkJBQVksQ0FBQztJQUM1RCxDQUFDLGtCQUFPLENBQUMsWUFBWSxDQUFDLEVBQUUsQ0FBQyw2QkFBWSxFQUFFLDhCQUFhLEVBQUUsOEJBQWEsQ0FBQztJQUNwRSxDQUFDLGtCQUFPLENBQUMsUUFBUSxDQUFDLEVBQUUsQ0FBQyw2QkFBWSxFQUFFLDhCQUFhLEVBQUUsOEJBQWEsQ0FBQztJQUNoRSxDQUFDLGtCQUFPLENBQUMsZUFBZSxDQUFDLEVBQUU7UUFDekIsb0NBQW1CO1FBQ25CLHFDQUFvQjtRQUNwQixxQ0FBb0I7S0FDckI7SUFDRCxDQUFDLGtCQUFPLENBQUMsZUFBZSxDQUFDLEVBQUUsQ0FBQyxxQ0FBb0IsQ0FBQztJQUNqRCxDQUFDLGtCQUFPLENBQUMsTUFBTSxDQUFDLEVBQUUsQ0FBQywyQkFBVSxFQUFFLDRCQUFXLEVBQUUsNEJBQVcsRUFBRSw0QkFBVyxDQUFDO0lBQ3JFLENBQUMsa0JBQU8sQ0FBQyxPQUFPLENBQUMsRUFBRSxDQUFDLDZCQUFZLEVBQUUsNEJBQVcsQ0FBQztJQUM5QyxDQUFDLGtCQUFPLENBQUMsT0FBTyxDQUFDLEVBQUUsQ0FBQyw2QkFBWSxDQUFDO0lBQ2pDLENBQUMsa0JBQU8sQ0FBQyxjQUFjLENBQUMsRUFBRSxDQUFDLG1DQUFrQixDQUFDO0lBQzlDLENBQUMsa0JBQU8sQ0FBQyxJQUFJLENBQUMsRUFBRSxDQUFDLDBCQUFTLENBQUM7SUFDM0IsQ0FBQyxrQkFBTyxDQUFDLGNBQWMsQ0FBQyxFQUFFLENBQUMsb0NBQW1CLENBQUM7SUFDL0MsQ0FBQyxrQkFBTyxDQUFDLE1BQU0sQ0FBQyxFQUFFLENBQUMscUNBQW9CLENBQUM7SUFDeEMsQ0FBQyxrQkFBTyxDQUFDLFFBQVEsQ0FBQyxFQUFFLENBQUMsOEJBQWEsQ0FBQztJQUNuQyxDQUFDLGtCQUFPLENBQUMsR0FBRyxDQUFDLEVBQUUsQ0FBQyx5QkFBUSxFQUFFLHlCQUFRLEVBQUUsd0JBQU8sQ0FBQztJQUM1QyxDQUFDLGtCQUFPLENBQUMsU0FBUyxDQUFDLEVBQUUsQ0FBQyx5QkFBUSxFQUFFLDBCQUFTLENBQUM7SUFDMUMsQ0FBQyxrQkFBTyxDQUFDLElBQUksQ0FBQyxFQUFFLENBQUMsMEJBQVMsQ0FBQztJQUMzQixDQUFDLGtCQUFPLENBQUMsTUFBTSxDQUFDLEVBQUUsQ0FBQywyQkFBVSxDQUFDO0NBQy9CLENBQUM7QUF3RUY7Ozs7Ozs7Ozs7R0FVRztBQUNILE1BQXNCLGtCQUFrQjtDQVF2QztBQVJELGdEQVFDO0FBRUQ7Ozs7Ozs7Ozs7R0FVRztBQUNILE1BQXNCLHVCQUF1QjtDQWE1QztBQWJELDBEQWFDO0FBRUQsMENBQTBDO0FBQzFDLHlEQUF5RDtBQUN6RCx5QkFBeUI7QUFDbEIsTUFBTSx5QkFBeUIsR0FBRyxDQUN2QyxPQUFnQixFQUNoQixpQkFBMkMsRUFDM0MsZUFBNEIsRUFDWixFQUFFO0lBQ2xCLE1BQU0sY0FBYyxHQUFHLDhCQUF1QixDQUFDLE9BQU8sQ0FBQyxDQUFDO0lBQ3hELE1BQU0sUUFBUSxHQUFHLGVBQWUsQ0FBQyxNQUFNLENBQUMsTUFBTSxDQUFDLGNBQWMsQ0FBQyxDQUFDO0lBQy9ELHFGQUFxRjtJQUNyRixNQUFNLGdCQUFnQixHQUFHLFFBQVE7UUFDL0IsQ0FBQyxDQUFDLGVBQWUsQ0FBQyxXQUFXO1FBQzdCLENBQUMsQ0FBQyxlQUFlLENBQUMsV0FBVyxDQUFDO0lBQ2hDLHNEQUFzRDtJQUN0RCxPQUFPLGdCQUFnQixDQUFDLEtBQUssQ0FBQyxpQkFBaUIsQ0FBbUIsQ0FBQztBQUNyRSxDQUFDLENBQUM7QUFiVyxRQUFBLHlCQUF5Qiw2QkFhcEMifQ==