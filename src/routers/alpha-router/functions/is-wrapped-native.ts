import { Currency } from '@uniswap/sdk-core';
import { nativeOnChain } from '../../../util';

export function isWrappedNative(currency: Currency): boolean {
  return currency.wrapped.equals(nativeOnChain(currency.chainId).wrapped);
}
