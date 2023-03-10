import { Currency, Ether, NativeCurrency, Token } from '@uniswap/sdk-core';


export enum ChainId {
  MAINNET = 1,
  ROPSTEN = 3,
  RINKEBY = 4,
  GÖRLI = 5,
  KOVAN = 42,
  OPTIMISM = 10,
  OPTIMISM_GOERLI = 420,
  OPTIMISTIC_KOVAN = 69,
  ARBITRUM_ONE = 42161,
  ARBITRUM_RINKEBY = 421611,
  ARBITRUM_GOERLI = 421613,
  POLYGON = 137,
  POLYGON_MUMBAI = 80001,
  CELO = 42220,
  CELO_ALFAJORES = 44787,
  GNOSIS = 100,
  MOONBEAM = 1284,
  BSC = 56,
}

// WIP: Gnosis, Moonbeam
export const SUPPORTED_CHAINS: ChainId[] = [
  ChainId.MAINNET,
  ChainId.RINKEBY,
  ChainId.ROPSTEN,
  ChainId.KOVAN,
  ChainId.OPTIMISM,
  ChainId.OPTIMISM_GOERLI,
  ChainId.OPTIMISTIC_KOVAN,
  ChainId.ARBITRUM_ONE,
  ChainId.ARBITRUM_RINKEBY,
  ChainId.ARBITRUM_GOERLI,
  ChainId.POLYGON,
  ChainId.POLYGON_MUMBAI,
  ChainId.GÖRLI,
  ChainId.CELO_ALFAJORES,
  ChainId.CELO,
  ChainId.BSC,
  // Gnosis and Moonbeam don't yet have contracts deployed yet
];

export const V2_SUPPORTED = [
  ChainId.MAINNET,
  ChainId.KOVAN,
  ChainId.GÖRLI,
  ChainId.RINKEBY,
  ChainId.ROPSTEN,
];

export const HAS_L1_FEE = [
  ChainId.OPTIMISM,
  ChainId.OPTIMISM_GOERLI,
  ChainId.OPTIMISTIC_KOVAN,
  ChainId.ARBITRUM_ONE,
  ChainId.ARBITRUM_RINKEBY,
  ChainId.ARBITRUM_GOERLI,
];

export const NETWORKS_WITH_SAME_UNISWAP_ADDRESSES = [
  ChainId.MAINNET,
  ChainId.ROPSTEN,
  ChainId.RINKEBY,
  ChainId.GÖRLI,
  ChainId.KOVAN,
  ChainId.OPTIMISM,
  ChainId.OPTIMISTIC_KOVAN,
  ChainId.ARBITRUM_ONE,
  ChainId.ARBITRUM_RINKEBY,
  ChainId.POLYGON,
  ChainId.POLYGON_MUMBAI,
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
    case 56:
      return ChainId.BSC;
    case 10:
      return ChainId.OPTIMISM;
    case 420:
      return ChainId.OPTIMISM_GOERLI;
    case 69:
      return ChainId.OPTIMISTIC_KOVAN;
    case 42161:
      return ChainId.ARBITRUM_ONE;
    case 421611:
      return ChainId.ARBITRUM_RINKEBY;
    case 421613:
      return ChainId.ARBITRUM_GOERLI;
    case 137:
      return ChainId.POLYGON;
    case 80001:
      return ChainId.POLYGON_MUMBAI;
    case 42220:
      return ChainId.CELO;
    case 44787:
      return ChainId.CELO_ALFAJORES;
    case 100:
      return ChainId.GNOSIS;
    case 1284:
      return ChainId.MOONBEAM;
    default:
      throw new Error(`Unknown chain id: ${id}`);
  }
};

export enum ChainName {
  MAINNET = 'mainnet',
  ROPSTEN = 'ropsten',
  RINKEBY = 'rinkeby',
  GÖRLI = 'goerli',
  KOVAN = 'kovan',
  OPTIMISM = 'optimism-mainnet',
  OPTIMISM_GOERLI = 'optimism-goerli',
  OPTIMISTIC_KOVAN = 'optimism-kovan',
  ARBITRUM_ONE = 'arbitrum-mainnet',
  ARBITRUM_RINKEBY = 'arbitrum-rinkeby',
  ARBITRUM_GOERLI = 'arbitrum-goerli',
  POLYGON = 'polygon-mainnet',
  POLYGON_MUMBAI = 'polygon-mumbai',
  CELO = 'celo-mainnet',
  CELO_ALFAJORES = 'celo-alfajores',
  GNOSIS = 'gnosis-mainnet',
  MOONBEAM = 'moonbeam-mainnet',
  BSC = 'bsc-mainnet',
}


export enum NativeCurrencyName {
  // Strings match input for CLI
  ETHER = 'ETH',
  MATIC = 'MATIC',
  CELO = 'CELO',
  GNOSIS = 'XDAI',
  MOONBEAM = 'GLMR',
  BNB = "BNB",
}
export const NATIVE_NAMES_BY_ID: { [chainId: number]: string[] } = {
  [ChainId.MAINNET]: [
    'ETH',
    'ETHER',
    '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee',
  ],
  [ChainId.RINKEBY]: [
    'ETH',
    'ETHER',
    '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee',
  ],
  [ChainId.GÖRLI]: [
    'ETH',
    'ETHER',
    '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee',
  ],
  [ChainId.KOVAN]: [
    'ETH',
    'ETHER',
    '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee',
  ],
  [ChainId.ROPSTEN]: [
    'ETH',
    'ETHER',
    '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee',
  ],
  [ChainId.OPTIMISM]: [
    'ETH',
    'ETHER',
    '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee',
  ],
  [ChainId.OPTIMISM_GOERLI]: [
    'ETH',
    'ETHER',
    '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee',
  ],
  [ChainId.OPTIMISTIC_KOVAN]: [
    'ETH',
    'ETHER',
    '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee',
  ],
  [ChainId.ARBITRUM_ONE]: [
    'ETH',
    'ETHER',
    '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee',
  ],
  [ChainId.ARBITRUM_RINKEBY]: [
    'ETH',
    'ETHER',
    '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee',
  ],
  [ChainId.ARBITRUM_GOERLI]: [
    'ETH',
    'ETHER',
    '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee',
  ],
  [ChainId.POLYGON]: [
    'MATIC', '0x0000000000000000000000000000000000001010'
  ],
  [ChainId.POLYGON_MUMBAI]: [
    'MATIC',
    '0x0000000000000000000000000000000000001010',
  ],
  [ChainId.CELO]: ['CELO'],
  [ChainId.CELO_ALFAJORES]: ['CELO'],
  [ChainId.GNOSIS]: ['XDAI'],
  [ChainId.MOONBEAM]: ['GLMR'],
  [ChainId.BSC]: [
    'BNB',
    'BNB',
    '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee',
  ],
};

export const NATIVE_CURRENCY: { [chainId: number]: NativeCurrencyName } = {
  [ChainId.MAINNET]: NativeCurrencyName.ETHER,
  [ChainId.ROPSTEN]: NativeCurrencyName.ETHER,
  [ChainId.RINKEBY]: NativeCurrencyName.ETHER,
  [ChainId.GÖRLI]: NativeCurrencyName.ETHER,
  [ChainId.KOVAN]: NativeCurrencyName.ETHER,
  [ChainId.OPTIMISM]: NativeCurrencyName.ETHER,
  [ChainId.OPTIMISM_GOERLI]: NativeCurrencyName.ETHER,
  [ChainId.OPTIMISTIC_KOVAN]: NativeCurrencyName.ETHER,
  [ChainId.ARBITRUM_ONE]: NativeCurrencyName.ETHER,
  [ChainId.ARBITRUM_RINKEBY]: NativeCurrencyName.ETHER,
  [ChainId.ARBITRUM_GOERLI]: NativeCurrencyName.ETHER,
  [ChainId.POLYGON]: NativeCurrencyName.MATIC,
  [ChainId.POLYGON_MUMBAI]: NativeCurrencyName.MATIC,
  [ChainId.CELO]: NativeCurrencyName.CELO,
  [ChainId.CELO_ALFAJORES]: NativeCurrencyName.CELO,
  [ChainId.GNOSIS]: NativeCurrencyName.GNOSIS,
  [ChainId.MOONBEAM]: NativeCurrencyName.MOONBEAM,
  [ChainId.BSC]: NativeCurrencyName.BNB,
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
    case 56:
      return ChainName.BSC;
    case 10:
      return ChainName.OPTIMISM;
    case 420:
      return ChainName.OPTIMISM_GOERLI;
    case 69:
      return ChainName.OPTIMISTIC_KOVAN;
    case 42161:
      return ChainName.ARBITRUM_ONE;
    case 421611:
      return ChainName.ARBITRUM_RINKEBY;
    case 421613:
      return ChainName.ARBITRUM_GOERLI;
    case 137:
      return ChainName.POLYGON;
    case 80001:
      return ChainName.POLYGON_MUMBAI;
    case 42220:
      return ChainName.CELO;
    case 44787:
      return ChainName.CELO_ALFAJORES;
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
    case ChainId.OPTIMISM_GOERLI:
      return process.env.JSON_RPC_PROVIDER_OPTIMISM_GOERLI!;
    case ChainId.OPTIMISTIC_KOVAN:
      return process.env.JSON_RPC_PROVIDER_OPTIMISTIC_KOVAN!;
    case ChainId.ARBITRUM_ONE:
      return process.env.JSON_RPC_PROVIDER_ARBITRUM_ONE!;
    case ChainId.ARBITRUM_RINKEBY:
      return process.env.JSON_RPC_PROVIDER_ARBITRUM_RINKEBY!;
    case ChainId.ARBITRUM_GOERLI:
      return process.env.JSON_RPC_PROVIDER_ARBITRUM_GOERLI!;
    case ChainId.POLYGON:
      return process.env.JSON_RPC_PROVIDER_POLYGON!;
    case ChainId.POLYGON_MUMBAI:
      return process.env.JSON_RPC_PROVIDER_POLYGON_MUMBAI!;
    case ChainId.CELO:
      return process.env.JSON_RPC_PROVIDER_CELO!;
    case ChainId.CELO_ALFAJORES:
      return process.env.JSON_RPC_PROVIDER_CELO_ALFAJORES!;
    case ChainId.BSC:
      return process.env.JSON_RPC_PROVIDER_BSC!;
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
  [ChainId.BSC]: new Token(
    56,
    '0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c',
    18,
    'WBNB',
    'Wrapped BNB'
  ),
  [ChainId.OPTIMISM]: new Token(
    ChainId.OPTIMISM,
    '0x4200000000000000000000000000000000000006',
    18,
    'WETH',
    'Wrapped Ether'
  ),
  [ChainId.OPTIMISM_GOERLI]: new Token(
    ChainId.OPTIMISM_GOERLI,
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
  [ChainId.ARBITRUM_GOERLI]: new Token(
    ChainId.ARBITRUM_GOERLI,
    '0xe39Ab88f8A4777030A534146A9Ca3B52bd5D43A3',
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

  // The Celo native currency 'CELO' implements the erc-20 token standard
  [ChainId.CELO]: new Token(
    ChainId.CELO,
    '0x471EcE3750Da237f93B8E339c536989b8978a438',
    18,
    'CELO',
    'Celo native asset'
  ),
  [ChainId.CELO_ALFAJORES]: new Token(
    ChainId.CELO_ALFAJORES,
    '0xF194afDf50B03e69Bd7D057c1Aa9e10c9954E4C9',
    18,
    'CELO',
    'Celo native asset'
  ),
  [ChainId.GNOSIS]: new Token(
    ChainId.GNOSIS,
    '0xe91d153e0b41518a2ce8dd3d7944fa863463a97d',
    18,
    'WXDAI',
    'Wrapped XDAI on Gnosis'
  ),
  [ChainId.MOONBEAM]: new Token(
    ChainId.MOONBEAM,
    '0xAcc15dC74880C9944775448304B263D191c6077F',
    18,
    'WGLMR',
    'Wrapped GLMR'
  ),
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

function isCelo(
  chainId: number
): chainId is ChainId.CELO | ChainId.CELO_ALFAJORES {
  return chainId === ChainId.CELO_ALFAJORES || chainId === ChainId.CELO;
}

class CeloNativeCurrency extends NativeCurrency {
  equals(other: Currency): boolean {
    return other.isNative && other.chainId === this.chainId;
  }

  get wrapped(): Token {
    if (!isCelo(this.chainId)) throw new Error('Not celo');
    const nativeCurrency = WRAPPED_NATIVE_CURRENCY[this.chainId];
    if (nativeCurrency) {
      return nativeCurrency;
    }
    throw new Error(`Does not support this chain ${this.chainId}`);
  }

  public constructor(chainId: number) {
    if (!isCelo(chainId)) throw new Error('Not celo');
    super(chainId, 18, 'CELO', 'Celo');
  }
}

function isGnosis(chainId: number): chainId is ChainId.GNOSIS {
  return chainId === ChainId.GNOSIS;
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
    super(chainId, 18, 'XDAI', 'xDai');
  }
}

function isBsc(chainId: number): chainId is ChainId.BSC {
  return chainId === ChainId.BSC;
}

class BscNativeCurrency extends NativeCurrency {
  equals(other: Currency): boolean {
    return other.isNative && other.chainId === this.chainId;
  }

  get wrapped(): Token {
    if (!isBsc(this.chainId)) throw new Error('Not bnb');
    const nativeCurrency = WRAPPED_NATIVE_CURRENCY[this.chainId];
    if (nativeCurrency) {
      return nativeCurrency;
    }
    throw new Error(`Does not support this chain ${this.chainId}`);
  }

  public constructor(chainId: number) {
    if (!isBsc(chainId)) throw new Error('Not bnb');
    super(chainId, 18, 'BNB', 'BNB');
  }
}

function isMoonbeam(chainId: number): chainId is ChainId.MOONBEAM {
  return chainId === ChainId.MOONBEAM;
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
    if (!isMoonbeam(chainId)) throw new Error('Not moonbeam');
    super(chainId, 18, 'GLMR', 'Glimmer');
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
  if (cachedNativeCurrency[chainId] != undefined)
    return cachedNativeCurrency[chainId]!;
  if (isMatic(chainId))
    cachedNativeCurrency[chainId] = new MaticNativeCurrency(chainId);
  else if (isCelo(chainId))
    cachedNativeCurrency[chainId] = new CeloNativeCurrency(chainId);
  else if (isGnosis(chainId))
    cachedNativeCurrency[chainId] = new GnosisNativeCurrency(chainId);
  else if (isMoonbeam(chainId))
    cachedNativeCurrency[chainId] = new MoonbeamNativeCurrency(chainId);
  else if (isBsc(chainId))
    cachedNativeCurrency[chainId] = new BscNativeCurrency(chainId);
  else cachedNativeCurrency[chainId] = ExtendedEther.onChain(chainId);

  return cachedNativeCurrency[chainId]!;
}
