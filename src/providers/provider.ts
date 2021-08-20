export type ProviderConfig = {
  blockNumber?: number | Promise<number>;
};

export type LocalCacheEntry<T> = {
  entry: T;
  blockNumber: number;
};
