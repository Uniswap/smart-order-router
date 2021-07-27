import { Token } from '@uniswap/sdk-core';
import _ from 'lodash';
import NodeCache from 'node-cache';
import { log } from '../util';
import { ITokenProvider, TokenAccessor } from './token-provider';

// Token symbol and decimals never change so can always be cached.
const TOKEN_CACHE = new NodeCache({ stdTTL: 3600, useClones: false });

export class TokenProviderWithFallback implements ITokenProvider {
  constructor(
    protected primaryTokenProvider: ITokenProvider,
    protected fallbackTokenProvider: ITokenProvider
  ) {}

  public async getTokens(_addresses: string[]): Promise<TokenAccessor> {
    const addressToToken: { [address: string]: Token } = {};
    const symbolToToken: { [symbol: string]: Token } = {};

    const addresses = _(_addresses)
      .map((address) => address.toLowerCase())
      .uniq()
      .value();

    const addressesToFindInPrimary = [];
    const addressesToFindInSecondary = [];

    for (const address of addresses) {
      if (TOKEN_CACHE.has(address)) {
        addressToToken[address] = TOKEN_CACHE.get<Token>(address)!;
        symbolToToken[addressToToken[address]!.symbol!] =
          TOKEN_CACHE.get<Token>(address)!;
      } else {
        addressesToFindInPrimary.push(address);
      }
    }

    log.info(
      { addressesToFindInPrimary },
      `Found ${
        addresses.length - addressesToFindInPrimary.length
      } tokens in local cache. Checking primary token provider for ${
        addressesToFindInPrimary.length
      } tokens`
    );

    if (addressesToFindInPrimary.length > 0) {
      const primaryTokenAccessor = await this.primaryTokenProvider.getTokens(
        addressesToFindInPrimary
      );

      for (const address of addressesToFindInPrimary) {
        const token = primaryTokenAccessor.getTokenByAddress(address);

        if (token) {
          addressToToken[address] = token;
          symbolToToken[addressToToken[address]!.symbol!] = token;
          TOKEN_CACHE.set<Token>(address, addressToToken[address]!);
        } else {
          addressesToFindInSecondary.push(address);
        }
      }
    }

    if (addressesToFindInSecondary.length > 0) {
      log.info(
        { addressesToFindInSecondary },
        `Found ${
          addressesToFindInPrimary.length - addressesToFindInSecondary.length
        } tokens in primary. Checking secondary token provider for ${
          addressesToFindInSecondary.length
        } tokens`
      );

      const secondaryTokenAccessor = await this.fallbackTokenProvider.getTokens(
        addressesToFindInSecondary
      );

      for (const address of addressesToFindInSecondary) {
        const token = secondaryTokenAccessor.getTokenByAddress(address);
        if (token) {
          addressToToken[address] = token;
          symbolToToken[addressToToken[address]!.symbol!] = token;
          TOKEN_CACHE.set<Token>(address, addressToToken[address]!);
        }
      }
    }

    return {
      getTokenByAddress: (address: string): Token | undefined => {
        return addressToToken[address.toLowerCase()];
      },
      getTokenBySymbol: (symbol: string): Token | undefined => {
        return symbolToToken[symbol.toLowerCase()];
      },
    };
  }
}
