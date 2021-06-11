import axios from 'axios';
import Logger from 'bunyan';
import { BigNumber } from 'ethers';
import { MetricLogger, MetricLoggerUnit } from '../routers/metric';

const gasStationUrl = `https://ethgasstation.info/api/ethgasAPI.json?api-key=${process.env.ETH_GAS_STATION_INFO_KEY}`;

export type GasPrice = {
  gasPriceWei: BigNumber;
};

export abstract class GasPriceProvider {
  public abstract getGasPrice(): Promise<GasPrice>;
}

// Gas prices from ethgasstation are in x10 Gwei. Must divide by 10 to use.
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

export class ETHGasStationInfoProvider extends GasPriceProvider {
  constructor(private log: Logger, private metricLogger: MetricLogger) {
    super();
  }

  public async getGasPrice(): Promise<GasPrice> {
    const now = Date.now();
    this.log.info(`About to get gas prices from gas station ${gasStationUrl}`);
    const response = await axios.get<ETHGasStationResponse>(gasStationUrl);
    const { data: gasPriceResponse, status } = response;

    if (status != 200) {
      this.log.error(
        { response },
        `Unabled to get gas price from ${gasStationUrl}.`
      );

      throw new Error(`Unable to get gas price from ${gasStationUrl}`);
    }

    this.metricLogger.putMetric(
      'GasPriceLoad',
      Date.now() - now,
      MetricLoggerUnit.Milliseconds
    );

    // Gas prices from ethgasstation are in GweiX10.
    const gasPriceWei = BigNumber.from(gasPriceResponse.fast)
      .div(BigNumber.from(10))
      .mul(BigNumber.from(10).pow(9));

    this.log.info(
      `Gas price in wei: ${gasPriceWei} as of block ${gasPriceResponse.blockNum}`
    );

    return { gasPriceWei: gasPriceWei };
  }
}
