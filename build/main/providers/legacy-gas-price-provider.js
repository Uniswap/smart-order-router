"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.LegacyGasPriceProvider = void 0;
const gas_price_provider_1 = require("./gas-price-provider");
class LegacyGasPriceProvider extends gas_price_provider_1.IGasPriceProvider {
    constructor(provider) {
        super();
        this.provider = provider;
    }
    async getGasPrice(_latestBlockNumber, _requestBlockNumber) {
        const gasPriceWei = await this.provider.getGasPrice();
        return {
            gasPriceWei,
        };
    }
}
exports.LegacyGasPriceProvider = LegacyGasPriceProvider;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibGVnYWN5LWdhcy1wcmljZS1wcm92aWRlci5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbIi4uLy4uLy4uL3NyYy9wcm92aWRlcnMvbGVnYWN5LWdhcy1wcmljZS1wcm92aWRlci50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiOzs7QUFFQSw2REFBbUU7QUFFbkUsTUFBYSxzQkFBdUIsU0FBUSxzQ0FBaUI7SUFDM0QsWUFBc0IsUUFBeUI7UUFDN0MsS0FBSyxFQUFFLENBQUM7UUFEWSxhQUFRLEdBQVIsUUFBUSxDQUFpQjtJQUUvQyxDQUFDO0lBRWUsS0FBSyxDQUFDLFdBQVcsQ0FDL0Isa0JBQTBCLEVBQzFCLG1CQUE0QjtRQUU1QixNQUFNLFdBQVcsR0FBRyxNQUFNLElBQUksQ0FBQyxRQUFRLENBQUMsV0FBVyxFQUFFLENBQUM7UUFDdEQsT0FBTztZQUNMLFdBQVc7U0FDWixDQUFDO0lBQ0osQ0FBQztDQUNGO0FBZEQsd0RBY0MifQ==