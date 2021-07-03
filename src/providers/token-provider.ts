import { Token } from '@uniswap/sdk-core';
import _ from 'lodash';
import NodeCache from 'node-cache';
import { IERC20Metadata__factory } from '../types/v3';
import { ChainId, log } from '../util';
import { UniswapMulticallProvider } from './multicall-uniswap-provider';

export interface ITokenProvider {
  getTokens(addresses: string[]): Promise<TokenAccessor>;
}

export type TokenAccessor = {
  getToken: (address: string) => Token | undefined;
};

// Token symbol and decimals never change so can always be cached.
const TOKEN_CACHE = new NodeCache({ stdTTL: 3600, useClones: false });

export class TokenProvider implements ITokenProvider {
  constructor(
    private chainId: ChainId,
    protected multicall2Provider: UniswapMulticallProvider
  ) {}

  public async getTokens(_addresses: string[]): Promise<TokenAccessor> {
    const addressToToken: { [address: string]: Token } = {};

    const addresses = _(_addresses)
      .map((address) => address.toLowerCase())
      .uniq()
      .value();
    const addressesToFetch = [];

    for (const address of addresses) {
      if (TOKEN_CACHE.has(address)) {
        log.info(`Found token with address ${address} in local cache`);
        addressToToken[address] = TOKEN_CACHE.get<Token>(address)!;
      } else {
        addressesToFetch.push(address);
      }
    }

    log.info(
      { addresses },
      `About to fetch ${addressesToFetch.length} tokens on-chain`
    );

    const [symbolsResult, decimalsResult] = await Promise.all([
      this.multicall2Provider.callSameFunctionOnMultipleContracts<
        undefined,
        [string]
      >({
        addresses: addressesToFetch,
        contractInterface: IERC20Metadata__factory.createInterface(),
        functionName: 'symbol',
      }),
      this.multicall2Provider.callSameFunctionOnMultipleContracts<
        undefined,
        [number]
      >({
        addresses: addressesToFetch,
        contractInterface: IERC20Metadata__factory.createInterface(),
        functionName: 'decimals',
      }),
    ]);

    log.info(
      `Got token symbol and decimals for ${addressesToFetch.length} tokens`
    );

    const { results: symbols } = symbolsResult;
    const { results: decimals } = decimalsResult;

    for (let i = 0; i < addressesToFetch.length; i++) {
      const address = addressesToFetch[i]!;

      const symbolResult = symbols[i];
      const decimalResult = decimals[i];

      if (!symbolResult?.success || !decimalResult?.success) {
        log.info(
          {
            symbolResult,
            decimalResult,
          },
          `Dropping token with address ${address} as symbol or decimal are invalid`
        );
        continue;
      }

      const symbol = symbolResult.result[0]!;
      const decimal = decimalResult.result[0]!;

      addressToToken[address] = new Token(
        this.chainId,
        address,
        decimal,
        symbol
      );
    }

    log.info({ addressToToken }, 'Post fetch address to token');

    return {
      getToken: (address: string): Token | undefined => {
        return addressToToken[address.toLowerCase()];
      },
    };
  }
}
