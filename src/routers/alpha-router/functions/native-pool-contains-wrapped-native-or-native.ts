import { Currency } from '@uniswap/sdk-core';
import { Pair } from '@uniswap/v2-sdk';
import { Pool as V3Pool } from '@uniswap/v3-sdk';
import { Pool as V4Pool } from '@uniswap/v4-sdk';
import { nativeOnChain } from '../../../util';

export function nativePoolContainsWrappedNativeOrNative(
  currency: Currency,
  pool: Pair | V3Pool | V4Pool
): boolean {
  const poolCasted = pool as { involvesToken(currency: Currency): boolean };
  const isCurrencyWrappedNative = currency.wrapped.equals(
    nativeOnChain(currency.chainId).wrapped
  );
  const isCurrencyNativeOrWrappedNative =
    currency.isNative || isCurrencyWrappedNative;
  return (
    (poolCasted.involvesToken(currency.wrapped) ||
      poolCasted.involvesToken(currency)) &&
    isCurrencyNativeOrWrappedNative
  );
}
