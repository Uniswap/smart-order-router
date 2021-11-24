import { Token, WETH9 } from '@uniswap/sdk-core';
import _ from 'lodash';
import { IERC20Metadata__factory } from '../types/v3';
import { ChainId, log } from '../util';
import { IMulticallProvider } from './multicall-provider';
import { ProviderConfig } from './provider';

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

// Some well known tokens on each chain for seeding cache / testing.
export const USDC_MAINNET = new Token(
  ChainId.MAINNET,
  '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
  6,
  'USDC',
  'USD//C'
);
export const USDT_MAINNET = new Token(
  ChainId.MAINNET,
  '0xdAC17F958D2ee523a2206206994597C13D831ec7',
  6,
  'USDT',
  'Tether USD'
);
export const WBTC_MAINNET = new Token(
  ChainId.MAINNET,
  '0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599',
  8,
  'WBTC',
  'Wrapped BTC'
);
export const DAI_MAINNET = new Token(
  ChainId.MAINNET,
  '0x6B175474E89094C44Da98b954EedeAC495271d0F',
  18,
  'DAI',
  'Dai Stablecoin'
);

export const DAI_RINKEBY_1 = new Token(
  ChainId.RINKEBY,
  '0x5592ec0cfb4dbc12d3ab100b257153436a1f0fea',
  18,
  'DAI',
  'DAI'
);
export const DAI_RINKEBY_2 = new Token(
  ChainId.RINKEBY,
  '0xc7AD46e0b8a400Bb3C915120d284AafbA8fc4735',
  18,
  'DAI',
  'DAI'
);

export const USDC_OPTIMISM = new Token(
  ChainId.OPTIMISM,
  '0x7F5c764cBc14f9669B88837ca1490cCa17c31607',
  6,
  'USDC',
  'USD//C'
);
export const USDT_OPTIMISM = new Token(
  ChainId.OPTIMISM,
  '0x94b008aA00579c1307B0EF2c499aD98a8ce58e58',
  6,
  'USDT',
  'Tether USD'
);
export const WBTC_OPTIMISM = new Token(
  ChainId.OPTIMISM,
  '0x68f180fcCe6836688e9084f035309E29Bf0A2095',
  8,
  'WBTC',
  'Wrapped BTC'
);
export const DAI_OPTIMISM = new Token(
  ChainId.OPTIMISM,
  '0xDA10009cBd5D07dd0CeCc66161FC93D7c9000da1',
  18,
  'DAI',
  'Dai Stablecoin'
);

export const USDC_OPTIMISTIC_KOVAN = new Token(
  ChainId.OPTIMISTIC_KOVAN,
  '0x4e62882864fB8CE54AFfcAf8D899A286762B011B',
  6,
  'USDC',
  'USD//C'
);
export const USDT_OPTIMISTIC_KOVAN = new Token(
  ChainId.OPTIMISTIC_KOVAN,
  '0x7F5c764cBc14f9669B88837ca1490cCa17c31607',
  6,
  'USDT',
  'Tether USD'
);
export const WBTC_OPTIMISTIC_KOVAN = new Token(
  ChainId.OPTIMISTIC_KOVAN,
  '0x2382a8f65b9120E554d1836a504808aC864E169d',
  8,
  'WBTC',
  'Wrapped BTC'
);
export const DAI_OPTIMISTIC_KOVAN = new Token(
  ChainId.OPTIMISTIC_KOVAN,
  '0xDA10009cBd5D07dd0CeCc66161FC93D7c9000da1',
  18,
  'DAI',
  'Dai Stablecoin'
);

export const USDC_ARBITRUM = new Token(
  ChainId.ARBITRUM_ONE,
  '0xFF970A61A04b1cA14834A43f5dE4533eBDDB5CC8',
  6,
  'USDC',
  'USD//C'
);
export const USDT_ARBITRUM = new Token(
  ChainId.ARBITRUM_ONE,
  '0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9',
  6,
  'USDT',
  'Tether USD'
);
export const WBTC_ARBITRUM = new Token(
  ChainId.ARBITRUM_ONE,
  '0x2f2a2543B76A4166549F7aaB2e75Bef0aefC5B0f',
  8,
  'WBTC',
  'Wrapped BTC'
);
export const DAI_ARBITRUM = new Token(
  ChainId.ARBITRUM_ONE,
  '0xDA10009cBd5D07dd0CeCc66161FC93D7c9000da1',
  18,
  'DAI',
  'Dai Stablecoin'
);

export const USDC_ARBITRUM_RINKEBY = new Token(
  ChainId.ARBITRUM_RINKEBY,
  '0xB17736aA76003F4873D9f4366190E5c6678d9a52',
  6,
  'USDC',
  'USD//C'
);

export const DAI_ARBITRUM_RINKEBY = new Token(
  ChainId.ARBITRUM_RINKEBY,
  '0x2f3C1B6A51A469051A22986aA0dDF98466cc8D3c',
  18,
  'DAI',
  'Dai Stablecoin'
);

export const TOKENS: {
  [chainId in ChainId]?: { [symbol: string]: Token };
} = {
  [ChainId.MAINNET]: {
    WETH: WETH9[ChainId.MAINNET]!,
    USDC: USDC_MAINNET,
    USDT: USDT_MAINNET,
    WBTC: WBTC_MAINNET,
    DAI: DAI_MAINNET,
  },
  [ChainId.RINKEBY]: {
    WETH: WETH9[ChainId.RINKEBY]!,
    DAI_1: DAI_RINKEBY_1,
    DAI_2: DAI_RINKEBY_2,
  },
  [ChainId.OPTIMISM]: {
    USDC: USDC_OPTIMISM,
    USDT: USDT_OPTIMISM,
    WBTC: WBTC_OPTIMISM,
    DAI: DAI_OPTIMISM,
  },
  [ChainId.OPTIMISTIC_KOVAN]: {
    USDC: USDC_OPTIMISM,
    USDT: USDT_OPTIMISM,
    WBTC: WBTC_OPTIMISM,
    DAI: DAI_OPTIMISM,
  },
  [ChainId.ARBITRUM_ONE]: {
    USDC: USDC_ARBITRUM,
    USDT: USDT_ARBITRUM,
    WBTC: WBTC_ARBITRUM,
    DAI: DAI_ARBITRUM,
  },
};

export class TokenProvider implements ITokenProvider {
  constructor(
    private chainId: ChainId,
    protected multicall2Provider: IMulticallProvider
  ) {}

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

    if (addresses.length > 0) {
      const [symbolsResult, decimalsResult] = await Promise.all([
        this.multicall2Provider.callSameFunctionOnMultipleContracts<
          undefined,
          [string]
        >({
          addresses,
          contractInterface: IERC20Metadata__factory.createInterface(),
          functionName: 'symbol',
          providerConfig,
        }),
        this.multicall2Provider.callSameFunctionOnMultipleContracts<
          undefined,
          [number]
        >({
          addresses,
          contractInterface: IERC20Metadata__factory.createInterface(),
          functionName: 'decimals',
          providerConfig,
        }),
      ]);

      const { results: symbols } = symbolsResult;
      const { results: decimals } = decimalsResult;

      for (let i = 0; i < addresses.length; i++) {
        const address = addresses[i]!;

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
      }

      log.info(
        `Got token symbol and decimals for ${
          Object.values(addressToToken).length
        } out of ${addresses.length} tokens on-chain ${
          providerConfig ? `as of: ${providerConfig?.blockNumber}` : ''
        }`
      );
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
