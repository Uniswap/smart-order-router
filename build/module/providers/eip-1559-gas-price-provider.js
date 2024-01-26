import { BigNumber } from '@ethersproject/bignumber';
import _ from 'lodash';
import { log } from '../util/log';
import { IGasPriceProvider } from './gas-price-provider';
// We get the Xth percentile of priority fees for transactions successfully included in previous blocks.
const DEFAULT_PRIORITY_FEE_PERCENTILE = 50;
// Infura docs say only past 4 blocks guaranteed to be available: https://infura.io/docs/ethereum#operation/eth_feeHistory
const DEFAULT_BLOCKS_TO_LOOK_BACK = 4;
/**
 * Computes a gas estimate using on-chain data from the eth_feeHistory RPC endpoint.
 *
 * Takes the average priority fee from the past `blocksToConsider` blocks, and adds it
 * to the current base fee.
 *
 * @export
 * @class EIP1559GasPriceProvider
 */
export class EIP1559GasPriceProvider extends IGasPriceProvider {
    constructor(provider, priorityFeePercentile = DEFAULT_PRIORITY_FEE_PERCENTILE, blocksToConsider = DEFAULT_BLOCKS_TO_LOOK_BACK) {
        super();
        this.provider = provider;
        this.priorityFeePercentile = priorityFeePercentile;
        this.blocksToConsider = blocksToConsider;
    }
    async getGasPrice(_latestBlockNumber, requestBlockNumber) {
        const feeHistoryRaw = (await this.provider.send('eth_feeHistory', [
            /**
             * @fix Use BigNumber.from(this.blocksToConsider).toHexString() after hardhat adds support
             * @see https://github.com/NomicFoundation/hardhat/issues/1585 .___.
             */
            BigNumber.from(this.blocksToConsider).toHexString().replace('0x0', '0x'),
            // If the block number is not specified, we have to send hardcoded 'latest' to infura RPC
            // because Infura node pool is eventually consistent and may not have the latest block from our block number.
            // See https://uniswapteam.slack.com/archives/C023A7JDTJP/p1702485038251449?thread_ts=1702471203.519869&cid=C023A7JDTJP
            requestBlockNumber
                ? BigNumber.from(requestBlockNumber).toHexString().replace('0x0', '0x')
                : 'latest',
            [this.priorityFeePercentile],
        ]));
        const feeHistory = {
            baseFeePerGas: _.map(feeHistoryRaw.baseFeePerGas, (b) => BigNumber.from(b)),
            gasUsedRatio: feeHistoryRaw.gasUsedRatio,
            oldestBlock: BigNumber.from(feeHistoryRaw.oldestBlock),
            reward: _.map(feeHistoryRaw.reward, (b) => BigNumber.from(b[0])),
        };
        const nextBlockBaseFeePerGas = feeHistory.baseFeePerGas[feeHistory.baseFeePerGas.length - 1];
        const averagePriorityFeePerGas = _.reduce(feeHistory.reward, (sum, cur) => sum.add(cur), BigNumber.from(0)).div(feeHistory.reward.length);
        log.info({
            feeHistory,
            feeHistoryReadable: {
                baseFeePerGas: _.map(feeHistory.baseFeePerGas, (f) => f.toString()),
                oldestBlock: feeHistory.oldestBlock.toString(),
                reward: _.map(feeHistory.reward, (r) => r.toString()),
            },
            nextBlockBaseFeePerGas: nextBlockBaseFeePerGas.toString(),
            averagePriorityFeePerGas: averagePriorityFeePerGas.toString(),
        }, 'Got fee history from provider and computed gas estimate');
        const gasPriceWei = nextBlockBaseFeePerGas.add(averagePriorityFeePerGas);
        const blockNumber = feeHistory.oldestBlock.add(this.blocksToConsider);
        log.info(`Estimated gas price in wei: ${gasPriceWei} as of block ${blockNumber.toString()}`);
        return { gasPriceWei: gasPriceWei };
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZWlwLTE1NTktZ2FzLXByaWNlLXByb3ZpZGVyLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiLi4vLi4vLi4vc3JjL3Byb3ZpZGVycy9laXAtMTU1OS1nYXMtcHJpY2UtcHJvdmlkZXIudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUEsT0FBTyxFQUFFLFNBQVMsRUFBRSxNQUFNLDBCQUEwQixDQUFDO0FBRXJELE9BQU8sQ0FBQyxNQUFNLFFBQVEsQ0FBQztBQUV2QixPQUFPLEVBQUUsR0FBRyxFQUFFLE1BQU0sYUFBYSxDQUFDO0FBRWxDLE9BQU8sRUFBWSxpQkFBaUIsRUFBRSxNQUFNLHNCQUFzQixDQUFDO0FBZ0JuRSx3R0FBd0c7QUFDeEcsTUFBTSwrQkFBK0IsR0FBRyxFQUFFLENBQUM7QUFDM0MsMEhBQTBIO0FBQzFILE1BQU0sMkJBQTJCLEdBQUcsQ0FBQyxDQUFDO0FBRXRDOzs7Ozs7OztHQVFHO0FBQ0gsTUFBTSxPQUFPLHVCQUF3QixTQUFRLGlCQUFpQjtJQUM1RCxZQUNZLFFBQXlCLEVBQzNCLHdCQUFnQywrQkFBK0IsRUFDL0QsbUJBQTJCLDJCQUEyQjtRQUU5RCxLQUFLLEVBQUUsQ0FBQztRQUpFLGFBQVEsR0FBUixRQUFRLENBQWlCO1FBQzNCLDBCQUFxQixHQUFyQixxQkFBcUIsQ0FBMEM7UUFDL0QscUJBQWdCLEdBQWhCLGdCQUFnQixDQUFzQztJQUdoRSxDQUFDO0lBRWUsS0FBSyxDQUFDLFdBQVcsQ0FDL0Isa0JBQTBCLEVBQzFCLGtCQUEyQjtRQUUzQixNQUFNLGFBQWEsR0FBRyxDQUFDLE1BQU0sSUFBSSxDQUFDLFFBQVEsQ0FBQyxJQUFJLENBQUMsZ0JBQWdCLEVBQUU7WUFDaEU7OztlQUdHO1lBQ0gsU0FBUyxDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsZ0JBQWdCLENBQUMsQ0FBQyxXQUFXLEVBQUUsQ0FBQyxPQUFPLENBQUMsS0FBSyxFQUFFLElBQUksQ0FBQztZQUN4RSx5RkFBeUY7WUFDekYsNkdBQTZHO1lB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