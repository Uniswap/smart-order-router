"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ArbitrumGasDataProvider = exports.OptimismGasDataProvider = void 0;
const sdk_core_1 = require("@uniswap/sdk-core");
const GasDataArbitrum__factory_1 = require("../../types/other/factories/GasDataArbitrum__factory");
const GasPriceOracle__factory_1 = require("../../types/other/factories/GasPriceOracle__factory");
const util_1 = require("../../util");
class OptimismGasDataProvider {
    constructor(chainId, multicall2Provider, gasPriceAddress) {
        this.chainId = chainId;
        this.multicall2Provider = multicall2Provider;
        if (chainId !== sdk_core_1.ChainId.OPTIMISM && chainId !== sdk_core_1.ChainId.BASE) {
            throw new Error('This data provider is used only on optimism networks.');
        }
        this.gasOracleAddress = gasPriceAddress !== null && gasPriceAddress !== void 0 ? gasPriceAddress : util_1.OVM_GASPRICE_ADDRESS;
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
            contractInterface: GasPriceOracle__factory_1.GasPriceOracle__factory.createInterface(),
            functionNames: funcNames,
            providerConfig: providerConfig,
        });
        if (!((_a = tx.results[0]) === null || _a === void 0 ? void 0 : _a.success) ||
            !((_b = tx.results[1]) === null || _b === void 0 ? void 0 : _b.success) ||
            !((_c = tx.results[2]) === null || _c === void 0 ? void 0 : _c.success) ||
            !((_d = tx.results[3]) === null || _d === void 0 ? void 0 : _d.success)) {
            util_1.log.info({ results: tx.results }, 'Failed to get gas constants data from the optimism gas oracle');
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
exports.OptimismGasDataProvider = OptimismGasDataProvider;
class ArbitrumGasDataProvider {
    constructor(chainId, provider, gasDataAddress) {
        this.chainId = chainId;
        this.provider = provider;
        this.gasFeesAddress = gasDataAddress ? gasDataAddress : util_1.ARB_GASINFO_ADDRESS;
    }
    async getGasData(providerConfig) {
        const gasDataContract = GasDataArbitrum__factory_1.GasDataArbitrum__factory.connect(this.gasFeesAddress, this.provider);
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
exports.ArbitrumGasDataProvider = ArbitrumGasDataProvider;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZ2FzLWRhdGEtcHJvdmlkZXIuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi8uLi8uLi8uLi9zcmMvcHJvdmlkZXJzL3YzL2dhcy1kYXRhLXByb3ZpZGVyLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7OztBQUVBLGdEQUE0QztBQUU1QyxtR0FBZ0c7QUFDaEcsaUdBQThGO0FBQzlGLHFDQUE0RTtBQXlCNUUsTUFBYSx1QkFBdUI7SUFLbEMsWUFDWSxPQUFnQixFQUNoQixrQkFBc0MsRUFDaEQsZUFBd0I7UUFGZCxZQUFPLEdBQVAsT0FBTyxDQUFTO1FBQ2hCLHVCQUFrQixHQUFsQixrQkFBa0IsQ0FBb0I7UUFHaEQsSUFBSSxPQUFPLEtBQUssa0JBQU8sQ0FBQyxRQUFRLElBQUksT0FBTyxLQUFLLGtCQUFPLENBQUMsSUFBSSxFQUFFO1lBQzVELE1BQU0sSUFBSSxLQUFLLENBQUMsdURBQXVELENBQUMsQ0FBQztTQUMxRTtRQUNELElBQUksQ0FBQyxnQkFBZ0IsR0FBRyxlQUFlLGFBQWYsZUFBZSxjQUFmLGVBQWUsR0FBSSwyQkFBb0IsQ0FBQztJQUNsRSxDQUFDO0lBRUQ7Ozs7T0FJRztJQUNJLEtBQUssQ0FBQyxVQUFVLENBQ3JCLGNBQStCOztRQUUvQixzREFBc0Q7UUFDdEQsTUFBTSxTQUFTLEdBQUcsQ0FBQyxXQUFXLEVBQUUsUUFBUSxFQUFFLFVBQVUsRUFBRSxVQUFVLENBQUMsQ0FBQztRQUNsRSxNQUFNLEVBQUUsR0FDTixNQUFNLElBQUksQ0FBQyxrQkFBa0IsQ0FBQyxtQ0FBbUMsQ0FHL0Q7WUFDQSxPQUFPLEVBQUUsSUFBSSxDQUFDLGdCQUFnQjtZQUM5QixpQkFBaUIsRUFBRSxpREFBdUIsQ0FBQyxlQUFlLEVBQUU7WUFDNUQsYUFBYSxFQUFFLFNBQVM7WUFDeEIsY0FBYyxFQUFFLGNBQWM7U0FDL0IsQ0FBQyxDQUFDO1FBRUwsSUFDRSxDQUFDLENBQUEsTUFBQSxFQUFFLENBQUMsT0FBTyxDQUFDLENBQUMsQ0FBQywwQ0FB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