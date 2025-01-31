import { ADDRESS_ZERO } from '@uniswap/router-sdk';
import { ChainId } from '@uniswap/sdk-core';
import { Pool as V4Pool } from '@uniswap/v4-sdk';

import { nativeOnChain } from './chains';

export const FAKE_TICK_SPACING = 0;

export function v4EthWethFakePool(chainId: ChainId): V4Pool {
  return new V4Pool(
    nativeOnChain(chainId),
    nativeOnChain(chainId).wrapped,
    0,
    FAKE_TICK_SPACING,
    ADDRESS_ZERO,
    79228162514264337593543950336,
    0,
    0
  );
}
