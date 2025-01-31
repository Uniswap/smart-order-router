import { TPool } from '@uniswap/router-sdk/dist/utils/TPool';
import { Pair } from '@uniswap/v2-sdk';
import { Pool as V3Pool } from '@uniswap/v3-sdk';
import { Pool as V4Pool } from '@uniswap/v4-sdk';

import { isWrappedNative } from './is-wrapped-native';

export function amendMixedRoutesMaxHops(
  parts: TPool[],
  maxHops: number
): number {
  const containsV4NativePool =
    parts.filter(
      (p) =>
        p instanceof V4Pool && (p.currency0.isNative || p.currency1.isNative)
    ).length > 0;
  if (!containsV4NativePool) {
    return maxHops;
  }
  const containsV2V3WrappedNativePool =
    parts.filter(
      (p) =>
        (p instanceof Pair || p instanceof V3Pool) &&
        (isWrappedNative(p.token0) || isWrappedNative(p.token1))
    ).length > 0;

  return containsV2V3WrappedNativePool && containsV4NativePool
    ? maxHops + 1
    : maxHops;
}
