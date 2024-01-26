import { ChainId, Token } from '@uniswap/sdk-core';
export declare const BNB_TICK_LENS_ADDRESS: string | undefined;
export declare const BNB_NONFUNGIBLE_POSITION_MANAGER_ADDRESS: string | undefined;
export declare const BNB_SWAP_ROUTER_02_ADDRESS: string;
export declare const BNB_V3_MIGRATOR_ADDRESS: string | undefined;
export declare const V3_CORE_FACTORY_ADDRESSES: AddressMap;
export declare const QUOTER_V2_ADDRESSES: AddressMap;
export declare const MIXED_ROUTE_QUOTER_V1_ADDRESSES: AddressMap;
export declare const UNISWAP_MULTICALL_ADDRESSES: AddressMap;
export declare const SWAP_ROUTER_02_ADDRESSES: (chainId: number) => string;
export declare const OVM_GASPRICE_ADDRESS = "0x420000000000000000000000000000000000000F";
export declare const ARB_GASINFO_ADDRESS = "0x000000000000000000000000000000000000006C";
export declare const TICK_LENS_ADDRESS: string | undefined;
export declare const NONFUNGIBLE_POSITION_MANAGER_ADDRESS: string | undefined;
export declare const V3_MIGRATOR_ADDRESS: string | undefined;
export declare const MULTICALL2_ADDRESS = "0x92D676A4917aF4c19fF0450c90471D454Ac423fc";
export type AddressMap = {
    [chainId: number]: string | undefined;
};
export declare function constructSameAddressMap<T extends string>(address: T, additionalNetworks?: ChainId[]): {
    [chainId: number]: T;
};
export declare const WETH9: {
    [chainId in Exclude<ChainId, ChainId.POLYGON | ChainId.POLYGON_MUMBAI | ChainId.CELO | ChainId.CELO_ALFAJORES | ChainId.GNOSIS | ChainId.MOONBEAM | ChainId.BNB | ChainId.AVALANCHE>]: Token;
};
export declare const BEACON_CHAIN_DEPOSIT_ADDRESS = "0x00000000219ab540356cBB839Cbe05303d7705Fa";
