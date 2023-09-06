import { BigNumber } from '@ethersproject/bignumber';
import { ChainId, Token } from '@uniswap/sdk-core';

import { log } from '../util';

import { ICache } from './cache';
import { ProviderConfig } from './provider';
import { ITokenFeeFetcher, TokenFeeResult } from './token-fee-fetcher';
import { DEFAULT_ALLOWLIST } from './token-validator-provider';

const DEFAULT_TOKEN_BUY_FEE_BPS = BigNumber.from(0);
const DEFAULT_TOKEN_SELL_FEE_BPS = BigNumber.from(0);

// on detector failure, assume no fee
const DEFAULT_TOKEN_FEE_RESULT = {
  buyFeeBps: DEFAULT_TOKEN_BUY_FEE_BPS,
  sellFeeBps: DEFAULT_TOKEN_SELL_FEE_BPS,
};

const DEFAULT_TOKEN_PROPERTIES_RESULT: TokenPropertiesResult = {
  tokenFeeResult: DEFAULT_TOKEN_FEE_RESULT,
};

type Address = string;
export type TokenPropertiesResult = {
  tokenFeeResult: TokenFeeResult;
};
export type TokenPropertiesMap = Record<Address, TokenPropertiesResult>;

export interface ITokenPropertiesProvider {
  getTokensProperties(
    tokens: Token[],
    providerConfig?: ProviderConfig
  ): Promise<TokenPropertiesMap>;
}

export class TokenPropertiesProvider implements ITokenPropertiesProvider {
  private CACHE_KEY = (chainId: ChainId, address: string) =>
    `token-properties-${chainId}-${address}`;

  constructor(
    private chainId: ChainId,
    private tokenPropertiesCache: ICache<TokenPropertiesResult>,
    private tokenFeeFetcher: ITokenFeeFetcher,
    private allowList = DEFAULT_ALLOWLIST
  ) {}

  public async getTokensProperties(
    tokens: Token[],
    providerConfig?: ProviderConfig
  ): Promise<TokenPropertiesMap> {
    const tokenToResult: TokenPropertiesMap = {};
    const addressesToFetchFeesOnchain: string[] = [];
    const addressesRaw = this.buildAddressesRaw(tokens);

    const tokenProperties = await this.tokenPropertiesCache.batchGet(addressesRaw)

    // Check if we have cached token validation results for any tokens.
    for (const address of addressesRaw) {
      const cachedValue = tokenProperties[address];
      if (cachedValue) {
        tokenToResult[address] = cachedValue;
      } else if (this.allowList.has(address)) {
        tokenToResult[address] = DEFAULT_TOKEN_PROPERTIES_RESULT;
      } else {
        addressesToFetchFeesOnchain.push(address);
      }
    }

    log.info(
      `Got token fee results for ${
        addressesRaw.size - addressesToFetchFeesOnchain.length
      } tokens from cache. Getting ${
        addressesToFetchFeesOnchain.length
      } on-chain.`
    );

    if (addressesToFetchFeesOnchain.length > 0) {
      const tokenFeeMap = await this.tokenFeeFetcher.fetchFees(
        addressesToFetchFeesOnchain,
        providerConfig
      );

      for (const address of addressesToFetchFeesOnchain) {
        const tokenFee = tokenFeeMap[address];
        if (tokenFee) {
          await this.tokenPropertiesCache.set(
            this.CACHE_KEY(this.chainId, address),
            { tokenFeeResult: tokenFee }
          );
        }
      }
    }

    return tokenToResult;
  }

  private buildAddressesRaw(tokens: Token[]): Set<string> {
    const addressesRaw = new Set<string>();

    for (const token of tokens) {
      const address = token.address.toLowerCase();
      if (!addressesRaw.has(address)) {
        addressesRaw.add(address);
      }
    }

    return addressesRaw;
  }
}
