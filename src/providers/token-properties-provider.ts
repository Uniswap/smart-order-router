import { ChainId, Token } from '@uniswap/sdk-core';

import { log } from '../util';
import { ICache } from './cache';
import { ProviderConfig } from './provider';
import {
  DEFAULT_TOKEN_FEE_RESULT,
  ITokenFeeFetcher,
  TokenFeeMap,
  TokenFeeResult,
} from './token-fee-fetcher';
import {
  DEFAULT_ALLOWLIST,
  ITokenValidatorProvider,
  TokenValidationResult,
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
    private enableFeeOnTransferFeeFetching = true,
    private allowList = DEFAULT_ALLOWLIST,
  ) {}

  public async getTokensProperties(
    tokens: Token[],
    providerConfig?: ProviderConfig
  ): Promise<TokenPropertiesMap> {
    const tokenToResult: TokenPropertiesMap = {};

    if (!this.enableFeeOnTransferFeeFetching) {
      return tokenToResult;
    }

    const nonAllowlistTokens = tokens.filter(
      (token) => !this.allowList.has(token.address.toLowerCase())
    );
    const tokenValidationResults =
      await this.tokenValidatorProvider.validateTokens(
        nonAllowlistTokens,
        providerConfig
      );

    tokens.forEach((token) => {
      if (this.allowList.has(token.address.toLowerCase())) {
        // if the token is in the allowlist, make it UNKNOWN so that we don't fetch the FOT fee on-chain
        tokenToResult[token.address.toLowerCase()] = {
          tokenValidationResult: TokenValidationResult.UNKN,
        };
      } else {
        tokenToResult[token.address.toLowerCase()] = {
          tokenValidationResult:
            tokenValidationResults.getValidationByToken(token),
        };
      }
    });

    const addressesToFetchFeesOnchain: string[] = [];
    const addressesRaw = this.buildAddressesRaw(tokens);

    const tokenProperties = await this.tokenPropertiesCache.batchGet(
      addressesRaw
    );

    // Check if we have cached token validation results for any tokens.
    for (const address of addressesRaw) {
      const cachedValue = tokenProperties[address];
      if (cachedValue) {
        tokenToResult[address] = cachedValue;
      } else if (
        tokenToResult[address]?.tokenValidationResult ===
        TokenValidationResult.FOT
      ) {
        addressesToFetchFeesOnchain.push(address);
      }
    }

    if (addressesToFetchFeesOnchain.length > 0) {
      let tokenFeeMap: TokenFeeMap = {};

      try {
        tokenFeeMap = await this.tokenFeeFetcher.fetchFees(
          addressesToFetchFeesOnchain,
          providerConfig
        );
      } catch (err) {
        log.error(
          { err },
          `Error fetching fees for tokens ${addressesToFetchFeesOnchain}`
        );
      }

      await Promise.all(
        addressesToFetchFeesOnchain.map((address) => {
          const tokenFee = tokenFeeMap[address];
          if (tokenFee && (tokenFee.buyFeeBps || tokenFee.sellFeeBps)) {
            const tokenResultForAddress = tokenToResult[address];

            if (tokenResultForAddress) {
              tokenResultForAddress.tokenFeeResult = tokenFee;
            }

            // update cache concurrently
            // at this point, we are confident that the tokens are FOT, so we can hardcode the validation result
            return this.tokenPropertiesCache.set(
              this.CACHE_KEY(this.chainId, address),
              {
                tokenFeeResult: tokenFee,
                tokenValidationResult: TokenValidationResult.FOT,
              }
            );
          } else {
            return Promise.resolve(true);
          }
        })
      );
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
