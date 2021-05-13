import { providers, BaseContract } from 'ethers';

export abstract class ProviderFactory<T extends BaseContract> {
  constructor(protected provider: providers.BaseProvider) {}

  public abstract getProvider(address: string): T;
}
