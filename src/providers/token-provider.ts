import { Token, WETH9 } from '@uniswap/sdk-core';
import _ from 'lodash';
import NodeCache from 'node-cache';
import { IERC20Metadata__factory } from '../types/v3';
import { ChainId, log } from '../util';
import { IMulticallProvider } from './multicall-provider';
import { LocalCacheEntry, ProviderConfig } from './provider';

export interface ITokenProvider {
  getTokens(
    addresses: string[],
    providerConfig?: ProviderConfig
  ): Promise<TokenAccessor>;
}

export type TokenAccessor = {
  getTokenByAddress(address: string): Token | undefined;
  getTokenBySymbol(symbol: string): Token | undefined;
  getAllTokens: () => Token[];
};

// Token symbol and decimals don't change so can be cached indefinitely.
const TOKEN_CACHE = new NodeCache({ stdTTL: 3600, useClones: false });

const KEY = (chainId: ChainId, address: string) => `${chainId}-${address}`;

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

export const DAI_RINKEBY = new Token(ChainId.RINKEBY, '0x5592ec0cfb4dbc12d3ab100b257153436a1f0fea', 18, 'DAI', 'DAI');
export const DAI_RINKEBY_2 = new Token(ChainId.RINKEBY, '0xc7AD46e0b8a400Bb3C915120d284AafbA8fc4735', 18, 'DAI', 'DAI');


export class TokenProvider implements ITokenProvider {
  constructor(
    private chainId: ChainId,
    protected multicall2Provider: IMulticallProvider
  ) {
    if (chainId == ChainId.MAINNET) {
      for (const token of [USDC, USDT, WBTC, DAI, WETH9[1]!]) {
        TOKEN_CACHE.set<LocalCacheEntry<Token>>(KEY(this.chainId, token.address.toLowerCase()), {
          blockNumber: 10000000,
          entry: token,
        });
      }
    }
  }

  public async getTokens(
    _addresses: string[],
    providerConfig?: ProviderConfig
  ): Promise<TokenAccessor> {
    const addressToToken: { [address: string]: Token } = {};
    const symbolToToken: { [symbol: string]: Token } = {};

    const addresses = _(_addresses)
      .map((address) => address.toLowerCase())
      .uniq()
      .value();
    const addressesToFetch = [];

    for (const address of addresses) {
      if (!TOKEN_CACHE.has(KEY(this.chainId, address))) {
        addressesToFetch.push(address);
        continue;
      }

      const tokenCacheEntry = TOKEN_CACHE.get<LocalCacheEntry<Token>>(KEY(this.chainId, address))!;
      if (
        !providerConfig?.blockNumber ||
        tokenCacheEntry.blockNumber > providerConfig?.blockNumber
      ) {
        addressToToken[address.toLowerCase()] =
          TOKEN_CACHE.get<LocalCacheEntry<Token>>(KEY(this.chainId, address))!.entry;
      } else {
        addressesToFetch.push(address);
      }
    }

    log.info(
      { addressesFound: addresses, addressesToFetch },
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
          providerConfig,
        }),
        this.multicall2Provider.callSameFunctionOnMultipleContracts<
          undefined,
          [number]
        >({
          addresses: addressesToFetch,
          contractInterface: IERC20Metadata__factory.createInterface(),
          functionName: 'decimals',
          providerConfig,
        }),
      ]);

      log.info(
        `Got token symbol and decimals for ${addressesToFetch.length} tokens ${
          providerConfig ? `as of: ${providerConfig?.blockNumber}` : ''
        }`
      );

      const { results: symbols, blockNumber } = symbolsResult;
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
        symbolToToken[symbol.toLowerCase()] =
          addressToToken[address.toLowerCase()]!;

        TOKEN_CACHE.set<LocalCacheEntry<Token>>(KEY(this.chainId, address.toLowerCase()), {
          blockNumber: blockNumber.toNumber(),
          entry: addressToToken[address.toLowerCase()]!,
        });
      }
    }

    return {
      getTokenByAddress: (address: string): Token | undefined => {
        return addressToToken[address.toLowerCase()];
      },
      getTokenBySymbol: (symbol: string): Token | undefined => {
        return symbolToToken[symbol.toLowerCase()];
      },
      getAllTokens: (): Token[] => {
        return Object.values(addressToToken);
      },
    };
  }
}
