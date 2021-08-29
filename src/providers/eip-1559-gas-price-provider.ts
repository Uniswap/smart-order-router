import { BigNumber, providers } from 'ethers';
import _ from 'lodash';
import { log } from '../util/log';
import { GasPrice, IGasPriceProvider } from './gas-price-provider';

export type RawFeeHistoryResponse = {
  baseFeePerGas: string[];
  gasUsedRatio: number[];
  oldestBlock: string;
  reward: string[];
};

export type FeeHistoryResponse = {
  baseFeePerGas: BigNumber[];
  gasUsedRatio: number[];
  oldestBlock: BigNumber;
  reward: BigNumber[];
};

// We get the Xth percentile of priority fees for transactions successfully included in previous blocks.
const PRIORITY_FEE_PERCENTILE = 50;
// Infura docs say only past 4 blocks guaranteed to be available: https://infura.io/docs/ethereum#operation/eth_feeHistory
const BLOCKS_TO_LOOK_BACK = 4;

export class EIP1559GasPriceProvider extends IGasPriceProvider {
  constructor(protected provider: providers.JsonRpcProvider) {
    super();
  }

  public async getGasPrice(): Promise<GasPrice> {
    const feeHistoryRaw = (await this.provider.send('eth_feeHistory', [
      BLOCKS_TO_LOOK_BACK.toString(),
      'latest',
      [PRIORITY_FEE_PERCENTILE],
    ])) as RawFeeHistoryResponse;

    const feeHistory: FeeHistoryResponse = {
      baseFeePerGas: _.map(feeHistoryRaw.baseFeePerGas, (b) =>
        BigNumber.from(b)
      ),
      gasUsedRatio: feeHistoryRaw.gasUsedRatio,
      oldestBlock: BigNumber.from(feeHistoryRaw.oldestBlock),
      reward: _.map(feeHistoryRaw.reward, (b) => BigNumber.from(b[0])),
    };

    const nextBlockBaseFeePerGas =
      feeHistory.baseFeePerGas[feeHistory.baseFeePerGas.length - 1]!;

    const averagePriorityFeePerGas = _.reduce(
      feeHistory.reward,
      (sum: BigNumber, cur: BigNumber) => sum.add(cur),
      BigNumber.from(0)
    ).div(feeHistory.reward.length);

    log.info(
      {
        feeHistoryRaw,
        feeHistory,
        nextBlockBaseFeePerGas,
        averagePriorityFeePerGas,
      },
      'Got fee history from provider and computed gas estimate'
    );

    const gasPriceWei = nextBlockBaseFeePerGas.add(averagePriorityFeePerGas);

    const blockNumber = feeHistory.oldestBlock.add(BLOCKS_TO_LOOK_BACK);

    log.info(
      `Estimated gas price in wei: ${gasPriceWei} as of block ${blockNumber.toString()}`
    );

    return { gasPriceWei: gasPriceWei, blockNumber: blockNumber.toNumber() };
  }
}
