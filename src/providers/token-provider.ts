import { Token, WETH9 } from '@uniswap/sdk-core';
import _ from 'lodash';
import NodeCache from 'node-cache';
import { IERC20Metadata__factory } from '../types/v3';
import { ChainId, log } from '../util';
import { UniswapMulticallProvider } from './multicall-uniswap-provider';

export interface ITokenProvider {
  getTokens(addresses: string[]): Promise<TokenAccessor>;
}

export type TokenAccessor = {
  getTokenByAddress(address: string): Token | undefined;
  getTokenBySymbol(symbol: string): Token | undefined;
};

// Token symbol and decimals never change so can always be cached.
const TOKEN_CACHE = new NodeCache({ stdTTL: 3600, useClones: false });

export const USDC = new Token(
  ChainId.MAINNET,
  '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
  6,
  'USDC',
  'USD//C'
);
export const USDT = new Token(
  ChainId.MAINNET,
  '0xdAC17F958D2ee523a2206206994597C13D831ec7',
  6,
  'USDT',
  'Tether USD'
);
export const WBTC = new Token(
  ChainId.MAINNET,
  '0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599',
  8,
  'WBTC',
  'Wrapped BTC'
);
export const DAI = new Token(
  ChainId.MAINNET,
  '0x6B175474E89094C44Da98b954EedeAC495271d0F',
  18,
  'DAI',
  'Dai Stablecoin'
);

for (const token of [USDC, USDT, WBTC, DAI, WETH9[1]!]) {
  TOKEN_CACHE.set<Token>(token.address.toLowerCase(), token);
}

export class TokenProvider implements ITokenProvider {
  constructor(
    private chainId: ChainId,
    protected multicall2Provider: UniswapMulticallProvider
  ) {}

  public async getTokens(_addresses: string[]): Promise<TokenAccessor> {
    const addressToToken: { [address: string]: Token } = {};
    const symbolToToken: { [symbol: string]: Token } = {};

    const addresses = _(_addresses)
      .map((address) => address.toLowerCase())
      .uniq()
      .value();
    const addressesToFetch = [];

    for (const address of addresses) {
      if (TOKEN_CACHE.has(address)) {
        addressToToken[address] = TOKEN_CACHE.get<Token>(address)!;
      } else {
        addressesToFetch.push(address);
      }
    }

    log.info(
      { addresses },
      `Found ${
        addresses.length - addressesToFetch.length
      } tokens in local cache. About to fetch ${
        addressesToFetch.length
      } tokens on-chain`
    );

    if (addressesToFetch.length > 0) {
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

        addressToToken[address.toLowerCase()] = new Token(
          this.chainId,
          address,
          decimal,
          symbol
        );
        symbolToToken[symbol.toLowerCase()] = addressToToken[address]!;

        TOKEN_CACHE.set<Token>(
          address.toLowerCase(),
          addressToToken[address.toLowerCase()]!
        );
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
