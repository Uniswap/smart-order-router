export interface ICache<T> {
  get(key: string): Promise<T | undefined>;

  set(key: string, value: T): Promise<boolean>;

  has(key: string): Promise<boolean>;
}
