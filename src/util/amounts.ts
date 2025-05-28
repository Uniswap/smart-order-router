import { parseUnits } from '@ethersproject/units';
import { ADDRESS_ZERO } from '@uniswap/router-sdk';
import {
  ChainId,
  Currency,
  CurrencyAmount as CurrencyAmountRaw,
} from '@uniswap/sdk-core';
import { FeeAmount, TICK_SPACINGS } from '@uniswap/v3-sdk';
import JSBI from 'jsbi';

export class CurrencyAmount extends CurrencyAmountRaw<Currency> {}

export const MAX_UINT160 = '0xffffffffffffffffffffffffffffffffffffffff';

// Try to parse a user entered amount for a given token
export function parseAmount(value: string, currency: Currency): CurrencyAmount {
  const typedValueParsed = parseUnits(value, currency.decimals).toString();
  return CurrencyAmount.fromRawAmount(currency, JSBI.BigInt(typedValueParsed));
}

export function parseFeeAmount(feeAmountStr: string) {
  switch (feeAmountStr) {
    case '10000':
      return FeeAmount.HIGH;
    case '3000':
      return FeeAmount.MEDIUM;
    case '500':
      return FeeAmount.LOW;
    case '400':
      return FeeAmount.LOW_400;
    case '300':
      return FeeAmount.LOW_300;
    case '200':
      return FeeAmount.LOW_200;
    case '100':
      return FeeAmount.LOWEST;
    default:
      throw new Error(`Fee amount ${feeAmountStr} not supported.`);
  }
}

export function unparseFeeAmount(feeAmount: FeeAmount) {
  switch (feeAmount) {
    case FeeAmount.HIGH:
      return '10000';
    case FeeAmount.MEDIUM:
      return '3000';
    case FeeAmount.LOW:
      return '500';
    case FeeAmount.LOW_400:
      return '400';
    case FeeAmount.LOW_300:
      return '300';
    case FeeAmount.LOW_200:
      return '200';
    case FeeAmount.LOWEST:
      return '100';
    default:
      throw new Error(`Fee amount ${feeAmount} not supported.`);
  }
}

export function getApplicableV3FeeAmounts(chainId: ChainId): FeeAmount[] {
  const feeAmounts = [
    FeeAmount.HIGH,
    FeeAmount.MEDIUM,
    FeeAmount.LOW,
    FeeAmount.LOWEST,
  ];

  if (chainId === ChainId.BASE) {
    feeAmounts.push(FeeAmount.LOW_200, FeeAmount.LOW_300, FeeAmount.LOW_400);
  }

  return feeAmounts;
}

export function getApplicableV4FeesTickspacingsHooks(
  chainId: ChainId
): Array<[number, number, string]> {
  const feeAmounts = [
    FeeAmount.HIGH,
    FeeAmount.MEDIUM,
    FeeAmount.LOW,
    FeeAmount.LOWEST,
  ];

  if (chainId === ChainId.BASE) {
    feeAmounts.push(FeeAmount.LOW_200, FeeAmount.LOW_300, FeeAmount.LOW_400);
  }

  return feeAmounts.map((feeAmount) => [
    feeAmount as number,
    TICK_SPACINGS[feeAmount],
    ADDRESS_ZERO,
  ]);
}
