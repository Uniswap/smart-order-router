import { Currency, Ether, NativeCurrency, Token } from '@uniswap/sdk-core';
import { WRAPPED_NATIVE_CURRENCY } from '..';
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
}

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
}

export enum NativeCurrencyName {
  // Strings match input for CLI
  ETHER = 'ETH',
  MATIC = 'MATIC',
}

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
      return process.env.JSON_RPC_PROVIDER_GÖRLI!;
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
    return WRAPPED_NATIVE_CURRENCY[this.chainId]!;
  }

  public constructor(chainId: number) {
    if (!isMatic(chainId)) throw new Error('Not matic');
    super(chainId, 18, 'MATIC', 'Polygon Matic');
  }
}

export class ExtendedEther extends Ether {
  public get wrapped(): Token {
    if (this.chainId in WRAPPED_NATIVE_CURRENCY)
      return WRAPPED_NATIVE_CURRENCY[this.chainId]!;
    throw new Error('Unsupported chain ID');
  }

  private static _cachedNative: { [chainId: number]: NativeCurrency } = {};

  public static onChain(chainId: number): ExtendedEther {
    return (
      this._cachedNative[chainId] ??
      (this._cachedNative[chainId] = isMatic(chainId)
        ? new MaticNativeCurrency(chainId)
        : new ExtendedEther(chainId))
    );
  }
}
