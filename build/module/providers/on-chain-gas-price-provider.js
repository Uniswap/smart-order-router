import { ChainId } from '@uniswap/sdk-core';
import { IGasPriceProvider } from './gas-price-provider';
const DEFAULT_EIP_1559_SUPPORTED_CHAINS = [
    ChainId.MAINNET,
    ChainId.GOERLI,
    ChainId.POLYGON_MUMBAI,
];
/**
 * Gets gas prices on chain. If the chain supports EIP-1559 and has the feeHistory API,
 * uses the EIP1559 provider. Otherwise it will use a legacy provider that uses eth_gasPrice
 *
 * @export
 * @class OnChainGasPriceProvider
 */
export class OnChainGasPriceProvider extends IGasPriceProvider {
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoib24tY2hhaW4tZ2FzLXByaWNlLXByb3ZpZGVyLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiLi4vLi4vLi4vc3JjL3Byb3ZpZGVycy9vbi1jaGFpbi1nYXMtcHJpY2UtcHJvdmlkZXIudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUEsT0FBTyxFQUFFLE9BQU8sRUFBRSxNQUFNLG1CQUFtQixDQUFDO0FBRzVDLE9BQU8sRUFBWSxpQkFBaUIsRUFBRSxNQUFNLHNCQUFzQixDQUFDO0FBR25FLE1BQU0saUNBQWlDLEdBQUc7SUFDeEMsT0FBTyxDQUFDLE9BQU87SUFDZixPQUFPLENBQUMsTUFBTTtJQUNkLE9BQU8sQ0FBQyxjQUFjO0NBQ3ZCLENBQUM7QUFFRjs7Ozs7O0dBTUc7QUFDSCxNQUFNLE9BQU8sdUJBQXdCLFNBQVEsaUJBQWlCO0lBQzVELFlBQ1ksT0FBZ0IsRUFDaEIsdUJBQWdELEVBQ2hELHNCQUE4QyxFQUM5QyxZQUF1QixpQ0FBaUM7UUFFbEUsS0FBSyxFQUFFLENBQUM7UUFMRSxZQUFPLEdBQVAsT0FBTyxDQUFTO1FBQ2hCLDRCQUF1QixHQUF2Qix1QkFBdUIsQ0FBeUI7UUFDaEQsMkJBQXNCLEdBQXRCLHNCQUFzQixDQUF3QjtRQUM5QyxjQUFTLEdBQVQsU0FBUyxDQUErQztJQUdwRSxDQUFDO0lBRWUsS0FBSyxDQUFDLFdBQVcsQ0FDL0IsaUJBQXlCLEVBQ3pCLGtCQUEyQjtRQUUzQixJQUFJLElBQUksQ0FBQyxTQUFTLENBQUMsUUFBUSxDQUFDLElBQUksQ0FBQyxPQUFPLENBQUMsRUFBRTtZQUN6QyxPQUFPLElBQUksQ0FBQyx1QkFBdUIsQ0FBQyxXQUFXLENBQzdDLGlCQUFpQixFQUNqQixrQkFBa0IsQ0FDbkIsQ0FBQztTQUNIO1FBRUQsT0FBTyxJQUFJLENBQUMsc0JBQXNCLENBQUMsV0FBVyxDQUM1QyxpQkFBaUIsRUFDakIsa0JBQWtCLENBQ25CLENBQUM7SUFDSixDQUFDO0NBQ0YifQ==