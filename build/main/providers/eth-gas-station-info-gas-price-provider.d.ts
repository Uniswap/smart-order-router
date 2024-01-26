import { GasPrice, IGasPriceProvider } from './gas-price-provider';
export type ETHGasStationResponse = {
    fast: number;
    fastest: number;
    safeLow: number;
    average: number;
    block_time: number;
    blockNum: number;
    speed: number;
    safeLowWait: number;
    avgWait: number;
    fastWait: number;
    fastestWait: number;
};
export declare class ETHGasStationInfoProvider extends IGasPriceProvider {
    private url;
    constructor(url: string);
    getGasPrice(_latestBlockNumber: number, _requestBlockNumber?: number): Promise<GasPrice>;
}
