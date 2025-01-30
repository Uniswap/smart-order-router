import { ChainId } from '@uniswap/sdk-core';
import { Pool as V4Pool } from "@uniswap/v4-sdk";

import { nativeOnChain } from './chains';

export const FAKE_HOOK_ADDRESS = 'e3f43862-1e53-4628-8cfd-8733f54588c8'

export function v4EthWethFakePool(chainId: ChainId): V4Pool {
  return new V4Pool(
    nativeOnChain(chainId),
    nativeOnChain(chainId).wrapped,
    0,
    0,
    FAKE_HOOK_ADDRESS,
    0,
    0,
    0
  );
}
