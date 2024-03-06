import { CHAIN_TO_ADDRESSES_MAP, ChainId, SWAP_ROUTER_02_ADDRESSES as SWAP_ROUTER_02_ADDRESSES_HELPER, Token } from '@uniswap/sdk-core';
import { FACTORY_ADDRESS } from '@uniswap/v3-sdk';

import { NETWORKS_WITH_SAME_UNISWAP_ADDRESSES } from './chains';

export const BNB_TICK_LENS_ADDRESS =
  CHAIN_TO_ADDRESSES_MAP[ChainId.BNB].tickLensAddress;
export const BNB_NONFUNGIBLE_POSITION_MANAGER_ADDRESS =
  CHAIN_TO_ADDRESSES_MAP[ChainId.BNB].nonfungiblePositionManagerAddress;
export const BNB_SWAP_ROUTER_02_ADDRESS =
  CHAIN_TO_ADDRESSES_MAP[ChainId.BNB].swapRouter02Address!;
export const BNB_V3_MIGRATOR_ADDRESS =
  CHAIN_TO_ADDRESSES_MAP[ChainId.BNB].v3MigratorAddress;

export const V3_CORE_FACTORY_ADDRESSES: AddressMap = {
  ...constructSameAddressMap(FACTORY_ADDRESS),
  [ChainId.CELO]: CHAIN_TO_ADDRESSES_MAP[ChainId.CELO].v3CoreFactoryAddress,
  [ChainId.CELO_ALFAJORES]:
    CHAIN_TO_ADDRESSES_MAP[ChainId.CELO_ALFAJORES].v3CoreFactoryAddress,
  [ChainId.OPTIMISM_GOERLI]:
    CHAIN_TO_ADDRESSES_MAP[ChainId.OPTIMISM_GOERLI].v3CoreFactoryAddress,
  [ChainId.OPTIMISM_SEPOLIA]:
    CHAIN_TO_ADDRESSES_MAP[ChainId.OPTIMISM_SEPOLIA].v3CoreFactoryAddress,
  [ChainId.SEPOLIA]:
    CHAIN_TO_ADDRESSES_MAP[ChainId.SEPOLIA].v3CoreFactoryAddress,
  [ChainId.ARBITRUM_GOERLI]:
    CHAIN_TO_ADDRESSES_MAP[ChainId.ARBITRUM_GOERLI].v3CoreFactoryAddress,
  [ChainId.ARBITRUM_SEPOLIA]:
    CHAIN_TO_ADDRESSES_MAP[ChainId.ARBITRUM_SEPOLIA].v3CoreFactoryAddress,
  [ChainId.BNB]: CHAIN_TO_ADDRESSES_MAP[ChainId.BNB].v3CoreFactoryAddress,
  [ChainId.AVALANCHE]:
    CHAIN_TO_ADDRESSES_MAP[ChainId.AVALANCHE].v3CoreFactoryAddress,
  [ChainId.BASE_GOERLI]:
    CHAIN_TO_ADDRESSES_MAP[ChainId.BASE_GOERLI].v3CoreFactoryAddress,
  [ChainId.BASE]: CHAIN_TO_ADDRESSES_MAP[ChainId.BASE].v3CoreFactoryAddress,
  // TODO: Gnosis + Moonbeam contracts to be deployed
};

export const QUOTER_V2_ADDRESSES: AddressMap = {
  ...constructSameAddressMap('0x61fFE014bA17989E743c5F6cB21bF9697530B21e'),
  [ChainId.CELO]: CHAIN_TO_ADDRESSES_MAP[ChainId.CELO].quoterAddress,
  [ChainId.CELO_ALFAJORES]:
    CHAIN_TO_ADDRESSES_MAP[ChainId.CELO_ALFAJORES].quoterAddress,
  [ChainId.OPTIMISM_GOERLI]:
    CHAIN_TO_ADDRESSES_MAP[ChainId.OPTIMISM_GOERLI].quoterAddress,
  [ChainId.OPTIMISM_SEPOLIA]:
    CHAIN_TO_ADDRESSES_MAP[ChainId.OPTIMISM_SEPOLIA].quoterAddress,
  [ChainId.SEPOLIA]: CHAIN_TO_ADDRESSES_MAP[ChainId.SEPOLIA].quoterAddress,
  [ChainId.ARBITRUM_GOERLI]:
    CHAIN_TO_ADDRESSES_MAP[ChainId.ARBITRUM_GOERLI].quoterAddress,
  [ChainId.ARBITRUM_SEPOLIA]:
    CHAIN_TO_ADDRESSES_MAP[ChainId.ARBITRUM_SEPOLIA].quoterAddress,
  [ChainId.BNB]: CHAIN_TO_ADDRESSES_MAP[ChainId.BNB].quoterAddress,
  [ChainId.AVALANCHE]: CHAIN_TO_ADDRESSES_MAP[ChainId.AVALANCHE].quoterAddress,
  [ChainId.BASE_GOERLI]:
    CHAIN_TO_ADDRESSES_MAP[ChainId.BASE_GOERLI].quoterAddress,
  [ChainId.BASE]: CHAIN_TO_ADDRESSES_MAP[ChainId.BASE].quoterAddress,
  // TODO: Gnosis + Moonbeam contracts to be deployed
};

export const MIXED_ROUTE_QUOTER_V1_ADDRESSES: AddressMap = {
  [ChainId.MAINNET]:
    CHAIN_TO_ADDRESSES_MAP[ChainId.MAINNET].v1MixedRouteQuoterAddress,
  [ChainId.GOERLI]:
    CHAIN_TO_ADDRESSES_MAP[ChainId.GOERLI].v1MixedRouteQuoterAddress,
};

export const UNISWAP_MULTICALL_ADDRESSES: AddressMap = {
  ...constructSameAddressMap('0x1F98415757620B543A52E61c46B32eB19261F984'),
  [ChainId.CELO]: CHAIN_TO_ADDRESSES_MAP[ChainId.CELO].multicallAddress,
  [ChainId.CELO_ALFAJORES]:
    CHAIN_TO_ADDRESSES_MAP[ChainId.CELO_ALFAJORES].multicallAddress,
  [ChainId.OPTIMISM_GOERLI]:
    CHAIN_TO_ADDRESSES_MAP[ChainId.OPTIMISM_GOERLI].multicallAddress,
  [ChainId.OPTIMISM_SEPOLIA]:
    CHAIN_TO_ADDRESSES_MAP[ChainId.OPTIMISM_SEPOLIA].multicallAddress,
  [ChainId.SEPOLIA]: CHAIN_TO_ADDRESSES_MAP[ChainId.SEPOLIA].multicallAddress,
  [ChainId.ARBITRUM_GOERLI]:
    CHAIN_TO_ADDRESSES_MAP[ChainId.ARBITRUM_GOERLI].multicallAddress,
  [ChainId.ARBITRUM_SEPOLIA]:
    CHAIN_TO_ADDRESSES_MAP[ChainId.ARBITRUM_SEPOLIA].multicallAddress,
  [ChainId.BNB]: CHAIN_TO_ADDRESSES_MAP[ChainId.BNB].multicallAddress,
  [ChainId.AVALANCHE]:
    CHAIN_TO_ADDRESSES_MAP[ChainId.AVALANCHE].multicallAddress,
  [ChainId.BASE_GOERLI]:
    CHAIN_TO_ADDRESSES_MAP[ChainId.BASE_GOERLI].multicallAddress,
  [ChainId.BASE]: CHAIN_TO_ADDRESSES_MAP[ChainId.BASE].multicallAddress,
  // TODO: Gnosis + Moonbeam contracts to be deployed
};

export const SWAP_ROUTER_02_ADDRESSES= (chainId: number): string => {
  return SWAP_ROUTER_02_ADDRESSES_HELPER(chainId) ?? '0x68b3465833fb72A70ecDF485E0e4C7bD8665Fc45';
};

export const OVM_GASPRICE_ADDRESS =
  '0x420000000000000000000000000000000000000F';
export const ARB_GASINFO_ADDRESS = '0x000000000000000000000000000000000000006C';
export const TICK_LENS_ADDRESS =
  CHAIN_TO_ADDRESSES_MAP[ChainId.ARBITRUM_ONE].tickLensAddress;
export const NONFUNGIBLE_POSITION_MANAGER_ADDRESS =
  CHAIN_TO_ADDRESSES_MAP[ChainId.MAINNET].nonfungiblePositionManagerAddress;
export const V3_MIGRATOR_ADDRESS =
  CHAIN_TO_ADDRESSES_MAP[ChainId.MAINNET].v3MigratorAddress;
export const MULTICALL2_ADDRESS = '0x5BA1e12693Dc8F9c48aAD8770482f4739bEeD696';

export type AddressMap = { [chainId: number]: string | undefined };

export function constructSameAddressMap<T extends string>(
  address: T,
  additionalNetworks: ChainId[] = []
): { [chainId: number]: T } {
  return NETWORKS_WITH_SAME_UNISWAP_ADDRESSES.concat(
    additionalNetworks
  ).reduce<{
    [chainId: number]: T;
  }>((memo, chainId) => {
    memo[chainId] = address;
    return memo;
  }, {});
}

export const WETH9: {
  [chainId in Exclude<
    ChainId,
    | ChainId.POLYGON
    | ChainId.POLYGON_MUMBAI
    | ChainId.CELO
    | ChainId.CELO_ALFAJORES
    | ChainId.GNOSIS
    | ChainId.MOONBEAM
    | ChainId.BNB
    | ChainId.AVALANCHE
  >]: Token;
} = {
  [ChainId.MAINNET]: new Token(
    ChainId.MAINNET,
    '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',
    18,
    'WETH',
    'Wrapped Ether'
  ),
  [ChainId.GOERLI]: new Token(
    ChainId.GOERLI,
    '0xB4FBF271143F4FBf7B91A5ded31805e42b2208d6',
    18,
    'WETH',
    'Wrapped Ether'
  ),
  [ChainId.SEPOLIA]: new Token(
    ChainId.SEPOLIA,
    '0xfFf9976782d46CC05630D1f6eBAb18b2324d6B14',
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
  [ChainId.OPTIMISM_GOERLI]: new Token(
    ChainId.OPTIMISM_GOERLI,
    '0x4200000000000000000000000000000000000006',
    18,
    'WETH',
    'Wrapped Ether'
  ),
  [ChainId.OPTIMISM_SEPOLIA]: new Token(
    ChainId.OPTIMISM_SEPOLIA,
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
  [ChainId.ARBITRUM_GOERLI]: new Token(
    ChainId.ARBITRUM_GOERLI,
    '0xe39Ab88f8A4777030A534146A9Ca3B52bd5D43A3',
    18,
    'WETH',
    'Wrapped Ether'
  ),
  [ChainId.ARBITRUM_SEPOLIA]: new Token(
    ChainId.ARBITRUM_SEPOLIA,
    '0xc556bAe1e86B2aE9c22eA5E036b07E55E7596074',
    18,
    'WETH',
    'Wrapped Ether'
  ),
  [ChainId.BASE_GOERLI]: new Token(
    ChainId.BASE_GOERLI,
    '0x4200000000000000000000000000000000000006',
    18,
    'WETH',
    'Wrapped Ether'
  ),
  [ChainId.BASE]: new Token(
    ChainId.BASE,
    '0x4200000000000000000000000000000000000006',
    18,
    'WETH',
    'Wrapped Ether'
  ),
};

export const BEACON_CHAIN_DEPOSIT_ADDRESS =
  '0x00000000219ab540356cBB839Cbe05303d7705Fa';
