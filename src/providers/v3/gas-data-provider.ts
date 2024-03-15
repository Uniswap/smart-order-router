import { BigNumber } from '@ethersproject/bignumber';
import { BaseProvider } from '@ethersproject/providers';
import { ChainId } from '@uniswap/sdk-core';

import { GasDataArbitrum__factory } from '../../types/other/factories/GasDataArbitrum__factory';
import { ARB_GASINFO_ADDRESS } from '../../util';
import { ProviderConfig } from '../provider';

/**
 * Provider for getting gas constants on L2s.
 *
 * @export
 * @interface IL2GasDataProvider
 */
export interface IL2GasDataProvider<T> {
  /**
   * Gets the data constants needed to calculate the l1 security fee on L2s like arbitrum and optimism.
   * @returns An object that includes the data necessary for the off chain estimations.
   */
  getGasData(providerConfig?: ProviderConfig): Promise<T>;
}

/**
 * perL2TxFee is the base fee in wei for an l2 transaction.
 * perL2CalldataFee is the fee in wei per byte of calldata the swap uses. Multiply by the total bytes of the calldata.
 * perArbGasTotal is the fee in wei per unit of arbgas. Multiply this by the estimate we calculate based on ticks/hops in the gasModel.
 */
export type ArbitrumGasData = {
  perL2TxFee: BigNumber;
  perL1CalldataFee: BigNumber;
  perArbGasTotal: BigNumber;
};

export class ArbitrumGasDataProvider
  implements IL2GasDataProvider<ArbitrumGasData>
{
  protected gasFeesAddress: string;
  protected blockNumberOverride: number | Promise<number> | undefined;

  constructor(
    protected chainId: ChainId,
    protected provider: BaseProvider,
    gasDataAddress?: string
  ) {
    this.gasFeesAddress = gasDataAddress ? gasDataAddress : ARB_GASINFO_ADDRESS;
  }

  public async getGasData(providerConfig?: ProviderConfig) {
    const gasDataContract = GasDataArbitrum__factory.connect(
      this.gasFeesAddress,
      this.provider
    );
    const gasData = await gasDataContract.getPricesInWei({
      blockTag: providerConfig?.blockNumber,
    });
    const perL1CalldataByte = gasData[1];
    return {
      perL2TxFee: gasData[0],
      perL1CalldataFee: perL1CalldataByte.div(16),
      perArbGasTotal: gasData[5],
    };
  }
}
