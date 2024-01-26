import { IGasPriceProvider } from './gas-price-provider';
export class LegacyGasPriceProvider extends IGasPriceProvider {
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibGVnYWN5LWdhcy1wcmljZS1wcm92aWRlci5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbIi4uLy4uLy4uL3NyYy9wcm92aWRlcnMvbGVnYWN5LWdhcy1wcmljZS1wcm92aWRlci50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFFQSxPQUFPLEVBQVksaUJBQWlCLEVBQUUsTUFBTSxzQkFBc0IsQ0FBQztBQUVuRSxNQUFNLE9BQU8sc0JBQXVCLFNBQVEsaUJBQWlCO0lBQzNELFlBQXNCLFFBQXlCO1FBQzdDLEtBQUssRUFBRSxDQUFDO1FBRFksYUFBUSxHQUFSLFFBQVEsQ0FBaUI7SUFFL0MsQ0FBQztJQUVlLEtBQUssQ0FBQyxXQUFXLENBQy9CLGtCQUEwQixFQUMxQixtQkFBNEI7UUFFNUIsTUFBTSxXQUFXLEdBQUcsTUFBTSxJQUFJLENBQUMsUUFBUSxDQUFDLFdBQVcsRUFBRSxDQUFDO1FBQ3RELE9BQU87WUFDTCxXQUFXO1NBQ1osQ0FBQztJQUNKLENBQUM7Q0FDRiJ9