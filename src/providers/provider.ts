import { BigNumber } from '@ethersproject/bignumber';

export type ProviderConfig = {
  /**
   * The block number to use when getting data on-chain.
   */
  blockNumber?: number | Promise<number>;
  /*
   * Any additional overhead to add to the gas estimate
   */
  additionalGasOverhead?: BigNumber;
  /*
   * Debug flag to test some codepaths
   */
  debugRouting?: boolean;
  /**
   * Flag for token properties provider to enable fetching fee-on-transfer tokens.
   */
  enableFeeOnTransferFeeFetching?: boolean;
};

export type LocalCacheEntry<T> = {
  entry: T;
  blockNumber: number;
};
