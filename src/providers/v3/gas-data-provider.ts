import { BigNumber } from '@ethersproject/bignumber';
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

export type GasData = {
  perL2TxFee: BigNumber;
  perL1CalldataFee: BigNumber;
  perArbGasTotal: BigNumber;
};
