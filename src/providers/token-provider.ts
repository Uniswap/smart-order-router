import { Token } from '@uniswap/sdk-core';
import _ from 'lodash';
import { IERC20Metadata__factory } from '../types/v3';
import { ChainId, log, WRAPPED_NATIVE_CURRENCY } from '../util';
import { IMulticallProvider } from './multicall-provider';
import { ProviderConfig } from './provider';

/**
 * Provider for getting token data.
 *
 * @export
 * @interface ITokenProvider
 */
export interface ITokenProvider {
  /**
   * Gets the token at each address. Any addresses that are not valid ERC-20 are ignored.
   *
   * @param addresses The token addresses to get.
   * @param [providerConfig] The provider config.
   * @returns A token accessor with methods for accessing the tokens.
   */
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
export const FEI_MAINNET = new Token(
  ChainId.MAINNET,
  '0x956F47F50A910163D8BF957Cf5846D573E7f87CA',
  18,
  'FEI',
  'Fei USD'
);

export const USDC_ROPSTEN = new Token(
  ChainId.ROPSTEN,
  '0x07865c6e87b9f70255377e024ace6630c1eaa37f',
  6,
  'USDC',
  'USD//C'
);
export const USDT_ROPSTEN = new Token(
  ChainId.ROPSTEN,
  '0x516de3a7a567d81737e3a46ec4ff9cfd1fcb0136',
  6,
  'USDT',
  'Tether USD'
);
export const DAI_ROPSTEN = new Token(
  ChainId.ROPSTEN,
  '0xad6d458402f60fd3bd25163575031acdce07538d',
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
export const USDC_RINKEBY = new Token(
  ChainId.RINKEBY,
  '0x4DBCdF9B62e891a7cec5A2568C3F4FAF9E8Abe2b',
  6,
  'tUSDC',
  'test USD//C'
);
export const USDT_RINKEBY = new Token(
  ChainId.RINKEBY,
  '0xa689352b7c1cad82864beb1d90679356d3962f4d',
  18,
  'USDT',
  'Tether USD'
);

export const USDC_GÖRLI = new Token(
  ChainId.GÖRLI,
  '0x07865c6e87b9f70255377e024ace6630c1eaa37f',
  6,
  'USDC',
  'USD//C'
);
export const USDT_GÖRLI = new Token(
  ChainId.GÖRLI,
  '0xe583769738b6dd4e7caf8451050d1948be717679',
  18,
  'USDT',
  'Tether USD'
);
export const WBTC_GÖRLI = new Token(
  ChainId.GÖRLI,
  '0xa0a5ad2296b38bd3e3eb59aaeaf1589e8d9a29a9',
  8,
  'WBTC',
  'Wrapped BTC'
);
export const DAI_GÖRLI = new Token(
  ChainId.GÖRLI,
  '0x11fe4b6ae13d2a6055c8d9cf65c55bac32b5d844',
  18,
  'DAI',
  'Dai Stablecoin'
);

export const USDC_KOVAN = new Token(
  ChainId.KOVAN,
  '0x31eeb2d0f9b6fd8642914ab10f4dd473677d80df',
  6,
  'USDC',
  'USD//C'
);
export const USDT_KOVAN = new Token(
  ChainId.KOVAN,
  '0xa325f1b1ebb748715dfbbaf62e0c6677e137f45d',
  18,
  'USDT',
  'Tether USD'
);
export const WBTC_KOVAN = new Token(
  ChainId.KOVAN,
  '0xe36bc5d8b689ad6d80e78c3e736670e80d4b329d',
  8,
  'WBTC',
  'Wrapped BTC'
);
export const DAI_KOVAN = new Token(
  ChainId.KOVAN,
  '0x9dc7b33c3b63fc00ed5472fbd7813edda6a64752',
  18,
  'DAI',
  'Dai Stablecoin'
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
  '0x3b8e53b3ab8e01fb57d0c9e893bc4d655aa67d84',
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

// export const DAI_ARBITRUM_RINKEBY = new Token(
//   ChainId.ARBITRUM_RINKEBY,
//   '0x2f3C1B6A51A469051A22986aA0dDF98466cc8D3c',
//   18,
//   'DAI',
//   'Dai Stablecoin'
// );

// higher liquidity in dai-weth pool on arb-rinkeby
export const DAI_ARBITRUM_RINKEBY = new Token(
  ChainId.ARBITRUM_RINKEBY,
  '0x5364dc963c402aaf150700f38a8ef52c1d7d7f14',
  18,
  'DAI',
  'Dai Stablecoin'
);

export const USDT_ARBITRUM_RINKEBY = new Token(
  ChainId.ARBITRUM_RINKEBY,
  '0x920b9301c2de92186299cd2abc7199e25b9728b3',
  6,
  'UDST',
  'Tether USD'
);

export const USDC_ARBITRUM_RINKEBY = new Token(
  ChainId.ARBITRUM_RINKEBY,
  '0x09b98f8b2395d076514037ff7d39a091a536206c',
  6,
  'USDC',
  'USD//C'
);

export const UNI_ARBITRUM_RINKEBY = new Token(
  ChainId.ARBITRUM_RINKEBY,
  '0x049251a7175071316e089d0616d8b6aacd2c93b8',
  18,
  'UNI',
  'Uni token'
);

//polygon tokens
export const WMATIC_POLYGON = new Token(
  ChainId.POLYGON,
  '0x0d500B1d8E8eF31E21C99d1Db9A6444d3ADf1270',
  18,
  'WMATIC',
  'Wrapped MATIC'
);

export const WETH_POLYGON = new Token(
  ChainId.POLYGON,
  '0x7ceb23fd6bc0add59e62ac25578270cff1b9f619',
  18,
  'WETH',
  'Wrapped Ether'
);

export const USDC_POLYGON = new Token(
  ChainId.POLYGON,
  '0x2791bca1f2de4661ed88a30c99a7a9449aa84174',
  6,
  'USDC',
  'USD//C'
);

export const DAI_POLYGON = new Token(
  ChainId.POLYGON,
  '0x8f3Cf7ad23Cd3CaDbD9735AFf958023239c6A063',
  18,
  'DAI',
  'Dai Stablecoin'
);

//polygon mumbai tokens
export const WMATIC_POLYGON_MUMBAI = new Token(
  ChainId.POLYGON_MUMBAI,
  '0x9c3C9283D3e44854697Cd22D3Faa240Cfb032889',
  18,
  'WMATIC',
  'Wrapped MATIC'
);

export const USDC_POLYGON_MUMBAI = new Token(
  ChainId.POLYGON_MUMBAI,
  '0xe11a86849d99f524cac3e7a0ec1241828e332c62',
  6,
  'USDC',
  'USD//C'
);

export const DAI_POLYGON_MUMBAI = new Token(
  ChainId.POLYGON_MUMBAI,
  '0x001b3b4d0f3714ca98ba10f6042daebf0b1b7b6f',
  18,
  'DAI',
  'Dai Stablecoin'
);

export const WETH_POLYGON_MUMBAI = new Token(
  ChainId.POLYGON_MUMBAI,
  '0xa6fa4fb5f76172d178d61b04b0ecd319c5d1c0aa',
  18,
  'WETH',
  'Wrapped Ether'
);

export const SEED_TOKENS: {
  [chainId in ChainId]?: { [symbol: string]: Token };
} = {
  [ChainId.MAINNET]: {
    WETH: WRAPPED_NATIVE_CURRENCY[ChainId.MAINNET]!,
    USDC: USDC_MAINNET,
    USDT: USDT_MAINNET,
    WBTC: WBTC_MAINNET,
    DAI: DAI_MAINNET,
  },
  [ChainId.RINKEBY]: {
    WETH: WRAPPED_NATIVE_CURRENCY[ChainId.RINKEBY]!,
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
    USDC: USDC_OPTIMISTIC_KOVAN,
    USDT: USDT_OPTIMISTIC_KOVAN,
    WBTC: WBTC_OPTIMISTIC_KOVAN,
    DAI: DAI_OPTIMISTIC_KOVAN,
  },
  [ChainId.ARBITRUM_ONE]: {
    USDC: USDC_ARBITRUM,
    USDT: USDT_ARBITRUM,
    WBTC: WBTC_ARBITRUM,
    DAI: DAI_ARBITRUM,
  },
  [ChainId.ARBITRUM_RINKEBY]: {
    USDT: USDT_ARBITRUM_RINKEBY,
    UNI: UNI_ARBITRUM_RINKEBY,
    DAI: DAI_ARBITRUM_RINKEBY,
    USDC: USDC_ARBITRUM_RINKEBY,
  },
  [ChainId.POLYGON]: {
    WMATIC: WMATIC_POLYGON,
    USDC: USDC_POLYGON,
  },
  [ChainId.POLYGON_MUMBAI]: {
    WMATIC: WMATIC_POLYGON_MUMBAI,
    DAI: DAI_POLYGON_MUMBAI,
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
