import { Currency, Ether, NativeCurrency, Token } from '@uniswap/sdk-core';
export enum ChainId {
  MAINNET = 1,
  ROPSTEN = 3,
  RINKEBY = 4,
  GÖRLI = 5,
  KOVAN = 42,
  OPTIMISM = 10,
  OPTIMISTIC_KOVAN = 69,
  ARBITRUM_ONE = 42161,
  ARBITRUM_RINKEBY = 421611,
  POLYGON = 137,
  POLYGON_MUMBAI = 80001,
  GNOSIS = 100,
  MOONBEAM = 1284
}

export const V2_SUPPORTED = [
  ChainId.MAINNET,
  ChainId.KOVAN,
  ChainId.GÖRLI,
  ChainId.RINKEBY,
  ChainId.ROPSTEN,
];

export const HAS_L1_FEE = [
  ChainId.OPTIMISM,
  ChainId.OPTIMISTIC_KOVAN,
  ChainId.ARBITRUM_ONE,
  ChainId.ARBITRUM_RINKEBY,
];

export const ID_TO_CHAIN_ID = (id: number): ChainId => {
  switch (id) {
    case 1:
      return ChainId.MAINNET;
    case 3:
      return ChainId.ROPSTEN;
    case 4:
      return ChainId.RINKEBY;
    case 5:
      return ChainId.GÖRLI;
    case 42:
      return ChainId.KOVAN;
    case 10:
      return ChainId.OPTIMISM;
    case 69:
      return ChainId.OPTIMISTIC_KOVAN;
    case 42161:
      return ChainId.ARBITRUM_ONE;
    case 421611:
      return ChainId.ARBITRUM_RINKEBY;
    case 137:
      return ChainId.POLYGON;
    case 80001:
      return ChainId.POLYGON_MUMBAI;
    case 100:
      return ChainId.GNOSIS;
    case 1284:
      return ChainId.MOONBEAM;
    default:
      throw new Error(`Unknown chain id: ${id}`);
  }
};

export enum ChainName {
  // ChainNames match infura network strings
  MAINNET = 'mainnet',
  ROPSTEN = 'ropsten',
  RINKEBY = 'rinkeby',
  GÖRLI = 'goerli',
  KOVAN = 'kovan',
  OPTIMISM = 'optimism-mainnet',
  OPTIMISTIC_KOVAN = 'optimism-kovan',
  ARBITRUM_ONE = 'arbitrum-mainnet',
  ARBITRUM_RINKEBY = 'arbitrum-rinkeby',
  POLYGON = 'polygon-mainnet',
  POLYGON_MUMBAI = 'polygon-mumbai',
  GNOSIS = 'gnosis',
  MOONBEAM = 'moonbeam'
}

export enum NativeCurrencyName {
  // Strings match input for CLI
  ETHER = 'ETH',
  MATIC = 'MATIC',
  XDAI = 'XDAI',
  GLMR = 'GLMR'
}

export const NATIVE_CURRENCY: { [chainId: number]: NativeCurrencyName } = {
  [ChainId.MAINNET]: NativeCurrencyName.ETHER,
  [ChainId.ROPSTEN]: NativeCurrencyName.ETHER,
  [ChainId.RINKEBY]: NativeCurrencyName.ETHER,
  [ChainId.GÖRLI]: NativeCurrencyName.ETHER,
  [ChainId.KOVAN]: NativeCurrencyName.ETHER,
  [ChainId.OPTIMISM]: NativeCurrencyName.ETHER,
  [ChainId.OPTIMISTIC_KOVAN]: NativeCurrencyName.ETHER,
  [ChainId.ARBITRUM_ONE]: NativeCurrencyName.ETHER,
  [ChainId.ARBITRUM_RINKEBY]: NativeCurrencyName.ETHER,
  [ChainId.POLYGON]: NativeCurrencyName.MATIC,
  [ChainId.POLYGON_MUMBAI]: NativeCurrencyName.MATIC,
  [ChainId.GNOSIS]: NativeCurrencyName.XDAI,
  [ChainId.MOONBEAM]: NativeCurrencyName.GLMR
};

export const ID_TO_NETWORK_NAME = (id: number): ChainName => {
  switch (id) {
    case 1:
      return ChainName.MAINNET;
    case 3:
      return ChainName.ROPSTEN;
    case 4:
      return ChainName.RINKEBY;
    case 5:
      return ChainName.GÖRLI;
    case 42:
      return ChainName.KOVAN;
    case 10:
      return ChainName.OPTIMISM;
    case 69:
      return ChainName.OPTIMISTIC_KOVAN;
    case 42161:
      return ChainName.ARBITRUM_ONE;
    case 421611:
      return ChainName.ARBITRUM_RINKEBY;
    case 137:
      return ChainName.POLYGON;
    case 80001:
      return ChainName.POLYGON_MUMBAI;
    case 100:
      return ChainName.GNOSIS;
    case 1284:
      return ChainName.MOONBEAM;
    default:
      throw new Error(`Unknown chain id: ${id}`);
  }
};

export const CHAIN_IDS_LIST = Object.values(ChainId).map((c) =>
  c.toString()
) as string[];

export const ID_TO_PROVIDER = (id: ChainId): string => {
  switch (id) {
    case ChainId.MAINNET:
      return process.env.JSON_RPC_PROVIDER!;
    case ChainId.ROPSTEN:
      return process.env.JSON_RPC_PROVIDER_ROPSTEN!;
    case ChainId.RINKEBY:
      return process.env.JSON_RPC_PROVIDER_RINKEBY!;
    case ChainId.GÖRLI:
      return process.env.JSON_RPC_PROVIDER_GORLI!;
    case ChainId.KOVAN:
      return process.env.JSON_RPC_PROVIDER_KOVAN!;
    case ChainId.OPTIMISM:
      return process.env.JSON_RPC_PROVIDER_OPTIMISM!;
    case ChainId.OPTIMISTIC_KOVAN:
      return process.env.JSON_RPC_PROVIDER_OPTIMISTIC_KOVAN!;
    case ChainId.ARBITRUM_ONE:
      return process.env.JSON_RPC_PROVIDER_ARBITRUM_ONE!;
    case ChainId.ARBITRUM_RINKEBY:
      return process.env.JSON_RPC_PROVIDER_ARBITRUM_RINKEBY!;
    case ChainId.POLYGON:
      return process.env.JSON_RPC_PROVIDER_POLYGON!;
    case ChainId.POLYGON_MUMBAI:
      return process.env.JSON_RPC_PROVIDER_POLYGON_MUMBAI!;
    default:
      throw new Error(`Chain id: ${id} not supported`);
  }
};

export const WRAPPED_NATIVE_CURRENCY: { [chainId in ChainId]: Token } = {
  [ChainId.MAINNET]: new Token(
    1,
    '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',
    18,
    'WETH',
    'Wrapped Ether'
  ),
  [ChainId.ROPSTEN]: new Token(
    3,
    '0xc778417E063141139Fce010982780140Aa0cD5Ab',
    18,
    'WETH',
    'Wrapped Ether'
  ),
  [ChainId.RINKEBY]: new Token(
    4,
    '0xc778417E063141139Fce010982780140Aa0cD5Ab',
    18,
    'WETH',
    'Wrapped Ether'
  ),
  [ChainId.GÖRLI]: new Token(
    5,
    '0xB4FBF271143F4FBf7B91A5ded31805e42b2208d6',
    18,
    'WETH',
    'Wrapped Ether'
  ),
  [ChainId.KOVAN]: new Token(
    42,
    '0xd0A1E359811322d97991E03f863a0C30C2cF029C',
    18,
    'WETH',
    'Wrapped Ether'
  ),
  [ChainId.OPTIMISM]: new Token(
    ChainId.OPTIMISM,
    '0x4200000000000000000000000000000000000006',
    18,
    'WETH',
    'Wrapped Ether'
  ),
  [ChainId.OPTIMISTIC_KOVAN]: new Token(
    ChainId.OPTIMISTIC_KOVAN,
    '0x4200000000000000000000000000000000000006',
    18,
    'WETH',
    'Wrapped Ether'
  ),
  [ChainId.ARBITRUM_ONE]: new Token(
    ChainId.ARBITRUM_ONE,
    '0x82aF49447D8a07e3bd95BD0d56f35241523fBab1',
    18,
    'WETH',
    'Wrapped Ether'
  ),
  [ChainId.ARBITRUM_RINKEBY]: new Token(
    ChainId.ARBITRUM_RINKEBY,
    '0xB47e6A5f8b33b3F17603C83a0535A9dcD7E32681',
    18,
    'WETH',
    'Wrapped Ether'
  ),
  [ChainId.POLYGON]: new Token(
    ChainId.POLYGON,
    '0x0d500B1d8E8eF31E21C99d1Db9A6444d3ADf1270',
    18,
    'WMATIC',
    'Wrapped MATIC'
  ),
  [ChainId.POLYGON_MUMBAI]: new Token(
    ChainId.POLYGON_MUMBAI,
    '0x9c3C9283D3e44854697Cd22D3Faa240Cfb032889',
    18,
    'WMATIC',
    'Wrapped MATIC'
  ),
  [ChainId.GNOSIS]: new Token(
    ChainId.GNOSIS,
    '0xe91d153e0b41518a2ce8dd3d7944fa863463a97d',
    18,
    'WXDAI',
    'Wrapped XDAI'
  ),
  [ChainId.MOONBEAM]: new Token(
    ChainId.MOONBEAM,
    '0xAcc15dC74880C9944775448304B263D191c6077F',
    18,
    'WGLMR',
    'Wrapped GLMR'
  )
};

function isMatic(
  chainId: number
): chainId is ChainId.POLYGON | ChainId.POLYGON_MUMBAI {
  return chainId === ChainId.POLYGON_MUMBAI || chainId === ChainId.POLYGON;
}

class MaticNativeCurrency extends NativeCurrency {
  equals(other: Currency): boolean {
    return other.isNative && other.chainId === this.chainId;
  }

  get wrapped(): Token {
    if (!isMatic(this.chainId)) throw new Error('Not matic');
    const nativeCurrency = WRAPPED_NATIVE_CURRENCY[this.chainId];
    if (nativeCurrency) {
      return nativeCurrency;
    }
    throw new Error(`Does not support this chain ${this.chainId}`);
  }

  public constructor(chainId: number) {
    if (!isMatic(chainId)) throw new Error('Not matic');
    super(chainId, 18, 'MATIC', 'Polygon Matic');
  }
}

function isGnosis(
  chainId: number
): chainId is ChainId.GNOSIS {
  return chainId === ChainId.GNOSIS
}

class GnosisNativeCurrency extends NativeCurrency {
  equals(other: Currency): boolean {
    return other.isNative && other.chainId === this.chainId;
  }

  get wrapped(): Token {
    if (!isGnosis(this.chainId)) throw new Error('Not gnosis');
    const nativeCurrency = WRAPPED_NATIVE_CURRENCY[this.chainId];
    if (nativeCurrency) {
      return nativeCurrency;
    }
    throw new Error(`Does not support this chain ${this.chainId}`);
  }

  public constructor(chainId: number) {
    if (!isGnosis(chainId)) throw new Error('Not gnosis');
    super(chainId, 18, 'GNOSIS', 'GNOSIS XDAI');
  }
}

function isMoonbeam(
  chainId: number
): chainId is ChainId.MOONBEAM {
  return chainId === ChainId.MOONBEAM
}

class MoonbeamNativeCurrency extends NativeCurrency {
  equals(other: Currency): boolean {
    return other.isNative && other.chainId === this.chainId;
  }

  get wrapped(): Token {
    if (!isMoonbeam(this.chainId)) throw new Error('Not moonbeam');
    const nativeCurrency = WRAPPED_NATIVE_CURRENCY[this.chainId];
    if (nativeCurrency) {
      return nativeCurrency;
    }
    throw new Error(`Does not support this chain ${this.chainId}`);
  }

  public constructor(chainId: number) {
    if (!isGnosis(chainId)) throw new Error('Not moonbeam');
    super(chainId, 18, 'MOONBEAM', 'MOONBEAM GLMR');
  }
}

export class ExtendedEther extends Ether {
  public get wrapped(): Token {
    if (this.chainId in WRAPPED_NATIVE_CURRENCY)
      return WRAPPED_NATIVE_CURRENCY[this.chainId as ChainId];
    throw new Error('Unsupported chain ID');
  }

  private static _cachedExtendedEther: { [chainId: number]: NativeCurrency } =
    {};

  public static onChain(chainId: number): ExtendedEther {
    return (
      this._cachedExtendedEther[chainId] ??
      (this._cachedExtendedEther[chainId] = new ExtendedEther(chainId))
    );
  }
}

const cachedNativeCurrency: { [chainId: number]: NativeCurrency } = {};
export function nativeOnChain(chainId: number): NativeCurrency {
  return (
    cachedNativeCurrency[chainId] ??
    (cachedNativeCurrency[chainId] = [MaticNativeCurrency, GnosisNativeCurrency, MoonbeamNativeCurrency]
      .map((constructor)=>new constructor(chainId))
      .filter(nativeCurrency=>nativeCurrency instanceof NativeCurrency)
      [0]??ExtendedEther.onChain(chainId))
  );
}
