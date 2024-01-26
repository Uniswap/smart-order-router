"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.OnChainGasPriceProvider = void 0;
const sdk_core_1 = require("@uniswap/sdk-core");
const gas_price_provider_1 = require("./gas-price-provider");
const DEFAULT_EIP_1559_SUPPORTED_CHAINS = [
    sdk_core_1.ChainId.MAINNET,
    sdk_core_1.ChainId.GOERLI,
    sdk_core_1.ChainId.POLYGON_MUMBAI,
];
/**
 * Gets gas prices on chain. If the chain supports EIP-1559 and has the feeHistory API,
 * uses the EIP1559 provider. Otherwise it will use a legacy provider that uses eth_gasPrice
 *
 * @export
 * @class OnChainGasPriceProvider
 */
class OnChainGasPriceProvider extends gas_price_provider_1.IGasPriceProvider {
    constructor(chainId, eip1559GasPriceProvider, legacyGasPriceProvider, eipChains = DEFAULT_EIP_1559_SUPPORTED_CHAINS) {
        super();
        this.chainId = chainId;
        this.eip1559GasPriceProvider = eip1559GasPriceProvider;
        this.legacyGasPriceProvider = legacyGasPriceProvider;
        this.eipChains = eipChains;
    }
    async getGasPrice(latestBlockNumber, requestBlockNumber) {
        if (this.eipChains.includes(this.chainId)) {
            return this.eip1559GasPriceProvider.getGasPrice(latestBlockNumber, requestBlockNumber);
        }
        return this.legacyGasPriceProvider.getGasPrice(latestBlockNumber, requestBlockNumber);
    }
}
exports.OnChainGasPriceProvider = OnChainGasPriceProvider;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoib24tY2hhaW4tZ2FzLXByaWNlLXByb3ZpZGVyLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiLi4vLi4vLi4vc3JjL3Byb3ZpZGVycy9vbi1jaGFpbi1nYXMtcHJpY2UtcHJvdmlkZXIudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7O0FBQUEsZ0RBQTRDO0FBRzVDLDZEQUFtRTtBQUduRSxNQUFNLGlDQUFpQyxHQUFHO0lBQ3hDLGtCQUFPLENBQUMsT0FBTztJQUNmLGtCQUFPLENBQUMsTUFBTTtJQUNkLGtCQUFPLENBQUMsY0FBYztDQUN2QixDQUFDO0FBRUY7Ozs7OztHQU1HO0FBQ0gsTUFBYSx1QkFBd0IsU0FBUSxzQ0FBaUI7SUFDNUQsWUFDWSxPQUFnQixFQUNoQix1QkFBZ0QsRUFDaEQsc0JBQThDLEVBQzlDLFlBQXVCLGlDQUFpQztRQUVsRSxLQUFLLEVBQUUsQ0FBQztRQUxFLFlBQU8sR0FBUCxPQUFPLENBQVM7UUFDaEIsNEJBQXVCLEdBQXZCLHVCQUF1QixDQUF5QjtRQUNoRCwyQkFBc0IsR0FBdEIsc0JBQXNCLENBQXdCO1FBQzlDLGNBQVMsR0FBVCxTQUFTLENBQStDO0lBR3BFLENBQUM7SUFFZSxLQUFLLENBQUMsV0FBVyxDQUMvQixpQkFBeUIsRUFDekIsa0JBQTJCO1FBRTNCLElBQUksSUFBSSxDQUFDLFNBQVMsQ0FBQyxRQUFRLENBQUMsSUFBSSxDQUFDLE9BQU8sQ0FBQyxFQUFFO1lBQ3pDLE9BQU8sSUFBSSxDQUFDLHVCQUF1QixDQUFDLFdBQVcsQ0FDN0MsaUJBQWlCLEVBQ2pCLGtCQUFrQixDQUNuQixDQUFDO1NBQ0g7UUFFRCxPQUFPLElBQUksQ0FBQyxzQkFBc0IsQ0FBQyxXQUFXLENBQzVDLGlCQUFpQixFQUNqQixrQkFBa0IsQ0FDbkIsQ0FBQztJQUNKLENBQUM7Q0FDRjtBQTFCRCwwREEwQkMifQ==