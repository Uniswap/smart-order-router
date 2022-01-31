import { BigNumber } from 'ethers';
import { OptimismGasData } from '../../routers';
import { GasPriceOracle__factory } from '../../types/other';
import { ChainId, log, OVM_GASPRICE_ADDRESS } from '../../util';
import { IMulticallProvider } from '../multicall-provider';

/**
 * Provider for getting Optimism gas constants.
 *
 * @export
 * @interface IOptimismGasDataProvider
 */
export interface IOptimismGasDataProvider {
  /**
   * Gets the data constants needed to calculate the l1 security fee on Optimism.
   * @returns An OptimismGasData object that includes the l1BaseFee,
   * scalar, decimals, and overhead values.
   */
  getGasData(): Promise<OptimismGasData>;
}

export class OptimismGasDataProvider implements IOptimismGasDataProvider {
  protected gasOracleAddress: string;

  constructor(
    protected chainId: ChainId,
    protected multicall2Provider: IMulticallProvider,
    gasPriceAddress?: string
  ) {
    if (chainId != ChainId.OPTIMISM && chainId != ChainId.OPTIMISTIC_KOVAN) {
      throw new Error('This data provider is used only on optimism networks.');
    }
    this.gasOracleAddress = gasPriceAddress ?? OVM_GASPRICE_ADDRESS;
  }

  public async getGasData(): Promise<OptimismGasData> {
    const funcNames = ['l1BaseFee', 'scalar', 'decimals', 'overhead'];
    const tx =
      await this.multicall2Provider.callMultipleFunctionsOnSameContract<
        undefined,
        [BigNumber]
      >({
        address: this.gasOracleAddress,
        contractInterface: GasPriceOracle__factory.createInterface(),
        functionNames: funcNames,
      });

    if (
      !tx.results[0]?.success ||
      !tx.results[1]?.success ||
      !tx.results[2]?.success ||
      !tx.results[3]?.success
    ) {
      log.info(
        { results: tx.results },
        'Failed to get gas constants data from the optimism gas oracle'
      );
      throw new Error(
        'Failed to get gas constants data from the optimism gas oracle'
      );
    }

    const { result: l1BaseFee } = tx.results![0];
    const { result: scalar } = tx.results![1];
    const { result: decimals } = tx.results![2];
    const { result: overhead } = tx.results![3];

    return {
      l1BaseFee: l1BaseFee[0],
      scalar: scalar[0],
      decimals: decimals[0],
      overhead: overhead[0],
    };
  }
}
