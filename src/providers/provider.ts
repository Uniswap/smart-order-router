export type ProviderConfig = {
  /**
   * The block number to use when getting data on-chain.
   */
  blockNumber?: number | Promise<number>;
  /*
  * Debug flag to test some codepaths
   */
  debugRouting?: boolean;
};

export type LocalCacheEntry<T> = {
  entry: T;
  blockNumber: number;
};
