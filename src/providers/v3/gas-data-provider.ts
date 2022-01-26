import { BigNumber, providers } from 'ethers';
import { OptimismGasData } from '../../routers';
import { GasPriceOracle, GasPriceOracle__factory } from '../../types/other';
import { ChainId, OVM_GASPRICE_ADDRESS } from '../../util';

/**
 * Provider or getting Optimism gas constants.
 *
 * @export
 * @interface IGasDataProvider
 */
export interface IGasDataProvider {
  /**
   * Gets the data constants needed to calculate the l1 security fee on Optimism.
   * @returns An OptimismGasData object that includes the l1BaseFee,
   * scalar, decimals, and overhead values.
   */
  getGasData(): Promise<OptimismGasData>;
}

export class GasDataProvider implements IGasDataProvider {
  protected gasOracleAddress: string;
  private gasOracleContract: GasPriceOracle;

  constructor(
    protected chainId: ChainId,
    protected provider: providers.BaseProvider,
    gasPriceAddress?: string
  ) {
    this.gasOracleAddress = gasPriceAddress ?? OVM_GASPRICE_ADDRESS;

    this.gasOracleContract = GasPriceOracle__factory.connect(
      this.gasOracleAddress,
      provider
    );
  }

  public async getGasData(): Promise<OptimismGasData> {
    const [l1BaseFee, scalar, decimals, overhead]: BigNumber[] =
      await Promise.all([
        this.gasOracleContract.l1BaseFee(),
        this.gasOracleContract.scalar(),
        this.gasOracleContract.decimals(),
        this.gasOracleContract.overhead(),
      ]);

    const data: OptimismGasData = {
      l1BaseFee,
      scalar,
      decimals,
      overhead,
    };

    return data;
  }
}
