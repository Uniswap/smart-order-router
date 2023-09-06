import { ChainId, Token } from '@uniswap/sdk-core';

import { ICache } from './cache';
import { ProviderConfig } from './provider';
import {
  DEFAULT_TOKEN_FEE_RESULT,
  ITokenFeeFetcher,
  TokenFeeResult
} from './token-fee-fetcher';
import {
  DEFAULT_ALLOWLIST,
  ITokenValidatorProvider,
  TokenValidationResult
} from './token-validator-provider';


export const DEFAULT_TOKEN_PROPERTIES_RESULT: TokenPropertiesResult = {
  tokenFeeResult: DEFAULT_TOKEN_FEE_RESULT,
};

type Address = string;
export type TokenPropertiesResult = {
  tokenFeeResult?: TokenFeeResult;
  tokenValidationResult?: TokenValidationResult;
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
    private tokenValidatorProvider: ITokenValidatorProvider,
    private tokenPropertiesCache: ICache<TokenPropertiesResult>,
    private tokenFeeFetcher: ITokenFeeFetcher,
    private allowList = DEFAULT_ALLOWLIST,
  ) {}

  public async getTokensProperties(
    tokens: Token[],
    providerConfig?: ProviderConfig
  ): Promise<TokenPropertiesMap> {
    const nonAllowlistTokens = tokens.filter((token) => !this.allowList.has(token.address.toLowerCase()));
    const tokenValidationResults = await this.tokenValidatorProvider.validateTokens(nonAllowlistTokens, providerConfig);
    const tokenToResult: TokenPropertiesMap = {};

    tokens.forEach((token) => {
      if (this.allowList.has(token.address.toLowerCase())) {
        // if the token is in the allowlist, make it UNKNOWN so that we don't fetch the FOT fee on-chain
        tokenToResult[token.address.toLowerCase()] = { tokenValidationResult: TokenValidationResult.UNKN}
      } else {
        tokenToResult[token.address.toLowerCase()] = { tokenValidationResult: tokenValidationResults.getValidationByToken(token) }
      }
    })

    const addressesToFetchFeesOnchain: string[] = [];
    const addressesRaw = this.buildAddressesRaw(tokens);

    const tokenProperties = await this.tokenPropertiesCache.batchGet(addressesRaw)

    // Check if we have cached token validation results for any tokens.
    for (const address of addressesRaw) {
      const cachedValue = tokenProperties[address];
      if (cachedValue) {
        tokenToResult[address] = cachedValue;
      } else if (tokenToResult[address]?.tokenValidationResult === TokenValidationResult.FOT) {
        addressesToFetchFeesOnchain.push(address);
      }
    }

    if (addressesToFetchFeesOnchain.length > 0) {
      const tokenFeeMap = await this.tokenFeeFetcher.fetchFees(
        addressesToFetchFeesOnchain,
        providerConfig
      );

      await Promise.all(addressesToFetchFeesOnchain.map((address) => {
        const tokenFee = tokenFeeMap[address];
        if (tokenFee) {
          // update cache concurrently
          return this.tokenPropertiesCache.set(
            this.CACHE_KEY(this.chainId, address),
            { tokenFeeResult: tokenFee }
          );
        } else {
          return Promise.resolve(true)
        }
      }));
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
