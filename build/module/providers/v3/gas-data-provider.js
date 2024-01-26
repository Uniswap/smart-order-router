import { ChainId } from '@uniswap/sdk-core';
import { GasDataArbitrum__factory } from '../../types/other/factories/GasDataArbitrum__factory';
import { GasPriceOracle__factory } from '../../types/other/factories/GasPriceOracle__factory';
import { ARB_GASINFO_ADDRESS, log, OVM_GASPRICE_ADDRESS } from '../../util';
export class OptimismGasDataProvider {
    constructor(chainId, multicall2Provider, gasPriceAddress) {
        this.chainId = chainId;
        this.multicall2Provider = multicall2Provider;
        if (chainId !== ChainId.OPTIMISM && chainId !== ChainId.BASE) {
            throw new Error('This data provider is used only on optimism networks.');
        }
        this.gasOracleAddress = gasPriceAddress !== null && gasPriceAddress !== void 0 ? gasPriceAddress : OVM_GASPRICE_ADDRESS;
    }
    /**
     * Gets the data constants needed to calculate the l1 security fee on Optimism.
     * @returns An OptimismGasData object that includes the l1BaseFee,
     * scalar, decimals, and overhead values.
     */
    async getGasData(providerConfig) {
        var _a, _b, _c, _d;
        // TODO: Also get the gasPrice from GasPriceOracle.sol
        const funcNames = ['l1BaseFee', 'scalar', 'decimals', 'overhead'];
        const tx = await this.multicall2Provider.callMultipleFunctionsOnSameContract({
            address: this.gasOracleAddress,
            contractInterface: GasPriceOracle__factory.createInterface(),
            functionNames: funcNames,
            providerConfig: providerConfig,
        });
        if (!((_a = tx.results[0]) === null || _a === void 0 ? void 0 : _a.success) ||
            !((_b = tx.results[1]) === null || _b === void 0 ? void 0 : _b.success) ||
            !((_c = tx.results[2]) === null || _c === void 0 ? void 0 : _c.success) ||
            !((_d = tx.results[3]) === null || _d === void 0 ? void 0 : _d.success)) {
            log.info({ results: tx.results }, 'Failed to get gas constants data from the optimism gas oracle');
            throw new Error('Failed to get gas constants data from the optimism gas oracle');
        }
        const { result: l1BaseFee } = tx.results[0];
        const { result: scalar } = tx.results[1];
        const { result: decimals } = tx.results[2];
        const { result: overhead } = tx.results[3];
        return {
            l1BaseFee: l1BaseFee[0],
            scalar: scalar[0],
            decimals: decimals[0],
            overhead: overhead[0],
        };
    }
}
export class ArbitrumGasDataProvider {
    constructor(chainId, provider, gasDataAddress) {
        this.chainId = chainId;
        this.provider = provider;
        this.gasFeesAddress = gasDataAddress ? gasDataAddress : ARB_GASINFO_ADDRESS;
    }
    async getGasData(providerConfig) {
        const gasDataContract = GasDataArbitrum__factory.connect(this.gasFeesAddress, this.provider);
        const gasData = await gasDataContract.getPricesInWei({
            blockTag: providerConfig === null || providerConfig === void 0 ? void 0 : providerConfig.blockNumber,
        });
        const perL1CalldataByte = gasData[1];
        return {
            perL2TxFee: gasData[0],
            perL1CalldataFee: perL1CalldataByte.div(16),
            perArbGasTotal: gasData[5],
        };
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZ2FzLWRhdGEtcHJvdmlkZXIuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi8uLi8uLi8uLi9zcmMvcHJvdmlkZXJzL3YzL2dhcy1kYXRhLXByb3ZpZGVyLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUVBLE9BQU8sRUFBRSxPQUFPLEVBQUUsTUFBTSxtQkFBbUIsQ0FBQztBQUU1QyxPQUFPLEVBQUUsd0JBQXdCLEVBQUUsTUFBTSxzREFBc0QsQ0FBQztBQUNoRyxPQUFPLEVBQUUsdUJBQXVCLEVBQUUsTUFBTSxxREFBcUQsQ0FBQztBQUM5RixPQUFPLEVBQUUsbUJBQW1CLEVBQUUsR0FBRyxFQUFFLG9CQUFvQixFQUFFLE1BQU0sWUFBWSxDQUFDO0FBeUI1RSxNQUFNLE9BQU8sdUJBQXVCO0lBS2xDLFlBQ1ksT0FBZ0IsRUFDaEIsa0JBQXNDLEVBQ2hELGVBQXdCO1FBRmQsWUFBTyxHQUFQLE9BQU8sQ0FBUztRQUNoQix1QkFBa0IsR0FBbEIsa0JBQWtCLENBQW9CO1FBR2hELElBQUksT0FBTyxLQUFLLE9BQU8sQ0FBQyxRQUFRLElBQUksT0FBTyxLQUFLLE9BQU8sQ0FBQyxJQUFJLEVBQUU7WUFDNUQsTUFBTSxJQUFJLEtBQUssQ0FBQyx1REFBdUQsQ0FBQyxDQUFDO1NBQzFFO1FBQ0QsSUFBSSxDQUFDLGdCQUFnQixHQUFHLGVBQWUsYUFBZixlQUFlLGNBQWYsZUFBZSxHQUFJLG9CQUFvQixDQUFDO0lBQ2xFLENBQUM7SUFFRDs7OztPQUlHO0lBQ0ksS0FBSyxDQUFDLFVBQVUsQ0FDckIsY0FBK0I7O1FBRS9CLHNEQUFzRDtRQUN0RCxNQUFNLFNBQVMsR0FBRyxDQUFDLFdBQVcsRUFBRSxRQUFRLEVBQUUsVUFBVSxFQUFFLFVBQVUsQ0FBQyxDQUFDO1FBQ2xFLE1BQU0sRUFBRSxHQUNOLE1BQU0sSUFBSSxDQUFDLGtCQUFrQixDQUFDLG1DQUFtQyxDQUcvRDtZQUNBLE9BQU8sRUFBRSxJQUFJLENBQUMsZ0JBQWdCO1lBQzlCLGlCQUFp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