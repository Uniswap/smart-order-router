export type ProviderConfig = {
  /**
   * The block number to use when getting data on-chain.
   */
  blockNumber?: number | Promise<number>;
  /*
   * Debug flag to test some codepaths
   */
  debugRouting?: boolean;
  /**
   * Flag for token properties provider to enable fetching fee-on-transfer tokens.
   */
  enableFeeOnTransferFeeFetching?: boolean;
  /**
   * Tenderly natively support save simulation failures if failed,
   * we need this as a pass-through flag to enable/disable this feature.
   */
  saveTenderlySimulationIfFailed?: boolean;
};

export type LocalCacheEntry<T> = {
  entry: T;
  blockNumber: number;
};
