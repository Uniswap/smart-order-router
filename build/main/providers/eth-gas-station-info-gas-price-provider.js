"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ETHGasStationInfoProvider = void 0;
const bignumber_1 = require("@ethersproject/bignumber");
const async_retry_1 = __importDefault(require("async-retry"));
const axios_1 = __importDefault(require("axios"));
const log_1 = require("../util/log");
const gas_price_provider_1 = require("./gas-price-provider");
class ETHGasStationInfoProvider extends gas_price_provider_1.IGasPriceProvider {
    constructor(url) {
        super();
        this.url = url;
    }
    async getGasPrice(_latestBlockNumber, _requestBlockNumber) {
        const response = await (0, async_retry_1.default)(async () => {
            return axios_1.default.get(this.url);
        }, { retries: 1 });
        const { data: gasPriceResponse, status } = response;
        if (status != 200) {
            log_1.log.error({ response }, `Unabled to get gas price from ${this.url}.`);
            throw new Error(`Unable to get gas price from ${this.url}`);
        }
        log_1.log.info({ gasPriceResponse }, 'Gas price response from API. About to parse "fast" to big number');
        // Gas prices from ethgasstation are in GweiX10.
        const gasPriceWei = bignumber_1.BigNumber.from(gasPriceResponse.fast)
            .div(bignumber_1.BigNumber.from(10))
            .mul(bignumber_1.BigNumber.from(10).pow(9));
        log_1.log.info(`Gas price in wei: ${gasPriceWei} as of block ${gasPriceResponse.blockNum}`);
        return { gasPriceWei: gasPriceWei };
    }
}
exports.ETHGasStationInfoProvider = ETHGasStationInfoProvider;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZXRoLWdhcy1zdGF0aW9uLWluZm8tZ2FzLXByaWNlLXByb3ZpZGVyLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiLi4vLi4vLi4vc3JjL3Byb3ZpZGVycy9ldGgtZ2FzLXN0YXRpb24taW5mby1nYXMtcHJpY2UtcHJvdmlkZXIudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7Ozs7O0FBQUEsd0RBQXFEO0FBQ3JELDhEQUFnQztBQUNoQyxrREFBMEI7QUFFMUIscUNBQWtDO0FBRWxDLDZEQUFtRTtBQWlCbkUsTUFBYSx5QkFBMEIsU0FBUSxzQ0FBaUI7SUFFOUQsWUFBWSxHQUFXO1FBQ3JCLEtBQUssRUFBRSxDQUFDO1FBQ1IsSUFBSSxDQUFDLEdBQUcsR0FBRyxHQUFHLENBQUM7SUFDakIsQ0FBQztJQUVlLEtBQUssQ0FBQyxXQUFXLENBQy9CLGtCQUEwQixFQUMxQixtQkFBNEI7UUFFNUIsTUFBTSxRQUFRLEdBQUcsTUFBTSxJQUFBLHFCQUFLLEVBQzFCLEtBQUssSUFBSSxFQUFFO1lBQ1QsT0FBTyxlQUFLLENBQUMsR0FBRyxDQUF3QixJQUFJLENBQUMsR0FBRyxDQUFDLENBQUM7UUFDcEQsQ0FBQyxFQUNELEVBQUUsT0FBTyxFQUFFLENBQUMsRUFBRSxDQUNmLENBQUM7UUFFRixNQUFNLEVBQUUsSUFBSSxFQUFFLGdCQUFnQixFQUFFLE1BQU0sRUFBRSxHQUFHLFFBQVEsQ0FBQztRQUVwRCxJQUFJLE1BQU0sSUFBSSxHQUFHLEVBQUU7WUFDakIsU0FBRyxDQUFDLEtBQUssQ0FBQyxFQUFFLFFBQVEsRUFBRSxFQUFFLGlDQUFpQyxJQUFJLENBQUMsR0FBRyxHQUFHLENBQUMsQ0FBQztZQUV0RSxNQUFNLElBQUksS0FBSyxDQUFDLGdDQUFnQyxJQUFJLENBQUMsR0FBRyxFQUFFLENBQUMsQ0FBQztTQUM3RDtRQUVELFNBQUcsQ0FBQyxJQUFJLENBQ04sRUFBRSxnQkFBZ0IsRUFBRSxFQUNwQixrRUFBa0UsQ0FDbkUsQ0FBQztRQUVGLGdEQUFnRDtRQUNoRCxNQUFNLFdBQVcsR0FBRyxxQkFBUyxDQUFDLElBQUksQ0FBQyxnQkFBZ0IsQ0FBQyxJQUFJLENBQUM7YUFDdEQsR0FBRyxDQUFDLHFCQUFTLENBQUMsSUFBSSxDQUFDLEVBQUUsQ0FBQyxDQUFDO2FBQ3ZCLEdBQUcsQ0FBQyxxQkFBUyxDQUFDLElBQUksQ0FBQyxFQUFFLENBQUMsQ0FBQyxHQUFHLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQztRQUVsQyxTQUFHLENBQUMsSUFBSSxDQUNOLHFCQUFxQixXQUFXLGdCQUFnQixnQkFBZ0IsQ0FBQyxRQUFRLEVBQUUsQ0FDNUUsQ0FBQztRQUVGLE9BQU8sRUFBRSxXQUFXLEVBQUUsV0FBVyxFQUFFLENBQUM7SUFDdEMsQ0FBQztDQUNGO0FBMUNELDhEQTBDQyJ9