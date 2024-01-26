import { BigNumber } from '@ethersproject/bignumber';
import retry from 'async-retry';
import axios from 'axios';
import { log } from '../util/log';
import { IGasPriceProvider } from './gas-price-provider';
export class ETHGasStationInfoProvider extends IGasPriceProvider {
    constructor(url) {
        super();
        this.url = url;
    }
    async getGasPrice(_latestBlockNumber, _requestBlockNumber) {
        const response = await retry(async () => {
            return axios.get(this.url);
        }, { retries: 1 });
        const { data: gasPriceResponse, status } = response;
        if (status != 200) {
            log.error({ response }, `Unabled to get gas price from ${this.url}.`);
            throw new Error(`Unable to get gas price from ${this.url}`);
        }
        log.info({ gasPriceResponse }, 'Gas price response from API. About to parse "fast" to big number');
        // Gas prices from ethgasstation are in GweiX10.
        const gasPriceWei = BigNumber.from(gasPriceResponse.fast)
            .div(BigNumber.from(10))
            .mul(BigNumber.from(10).pow(9));
        log.info(`Gas price in wei: ${gasPriceWei} as of block ${gasPriceResponse.blockNum}`);
        return { gasPriceWei: gasPriceWei };
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZXRoLWdhcy1zdGF0aW9uLWluZm8tZ2FzLXByaWNlLXByb3ZpZGVyLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiLi4vLi4vLi4vc3JjL3Byb3ZpZGVycy9ldGgtZ2FzLXN0YXRpb24taW5mby1nYXMtcHJpY2UtcHJvdmlkZXIudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUEsT0FBTyxFQUFFLFNBQVMsRUFBRSxNQUFNLDBCQUEwQixDQUFDO0FBQ3JELE9BQU8sS0FBSyxNQUFNLGFBQWEsQ0FBQztBQUNoQyxPQUFPLEtBQUssTUFBTSxPQUFPLENBQUM7QUFFMUIsT0FBTyxFQUFFLEdBQUcsRUFBRSxNQUFNLGFBQWEsQ0FBQztBQUVsQyxPQUFPLEVBQVksaUJBQWlCLEVBQUUsTUFBTSxzQkFBc0IsQ0FBQztBQWlCbkUsTUFBTSxPQUFPLHlCQUEwQixTQUFRLGlCQUFpQjtJQUU5RCxZQUFZLEdBQVc7UUFDckIsS0FBSyxFQUFFLENBQUM7UUFDUixJQUFJLENBQUMsR0FBRyxHQUFHLEdBQUcsQ0FBQztJQUNqQixDQUFDO0lBRWUsS0FBSyxDQUFDLFdBQVcsQ0FDL0Isa0JBQTBCLEVBQzFCLG1CQUE0QjtRQUU1QixNQUFNLFFBQVEsR0FBRyxNQUFNLEtBQUssQ0FDMUIsS0FBSyxJQUFJLEVBQUU7WUFDVCxPQUFPLEtBQUssQ0FBQyxHQUFHLENBQXdCLElBQUksQ0FBQyxHQUFHLENBQUMsQ0FBQztRQUNwRCxDQUFDLEVBQ0QsRUFBRSxPQUFPLEVBQUUsQ0FBQyxFQUFFLENBQ2YsQ0FBQztRQUVGLE1BQU0sRUFBRSxJQUFJLEVBQUUsZ0JBQWdCLEVBQUUsTUFBTSxFQUFFLEdBQUcsUUFBUSxDQUFDO1FBRXBELElBQUksTUFBTSxJQUFJLEdBQUcsRUFBRTtZQUNqQixHQUFHLENBQUMsS0FBSyxDQUFDLEVBQUUsUUFBUSxFQUFFLEVBQUUsaUNBQWlDLElBQUksQ0FBQyxHQUFHLEdBQUcsQ0FBQyxDQUFDO1lBRXRFLE1BQU0sSUFBSSxLQUFLLENBQUMsZ0NBQWdDLElBQUksQ0FBQyxHQUFHLEVBQUUsQ0FBQyxDQUFDO1NBQzdEO1FBRUQsR0FBRyxDQUFDLElBQUksQ0FDTixFQUFFLGdCQUFnQixFQUFFLEVBQ3BCLGtFQUFrRSxDQUNuRSxDQUFDO1FBRUYsZ0RBQWdEO1FBQ2hELE1BQU0sV0FBVyxHQUFHLFNBQVMsQ0FBQyxJQUFJLENBQUMsZ0JBQWdCLENBQUMsSUFBSSxDQUFDO2FBQ3RELEdBQUcsQ0FBQyxTQUFTLENBQUMsSUFBSSxDQUFDLEVBQUUsQ0FBQyxDQUFDO2FBQ3ZCLEdBQUcsQ0FBQyxTQUFTLENBQUMsSUFBSSxDQUFDLEVBQUUsQ0FBQyxDQUFDLEdBQUcsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDO1FBRWxDLEdBQUcsQ0FBQyxJQUFJLENBQ04scUJBQXFCLFdBQVcsZ0JBQWdCLGdCQUFnQixDQUFDLFFBQVEsRUFBRSxDQUM1RSxDQUFDO1FBRUYsT0FBTyxFQUFFLFdBQVcsRUFBRSxXQUFXLEVBQUUsQ0FBQztJQUN0QyxDQUFDO0NBQ0YifQ==