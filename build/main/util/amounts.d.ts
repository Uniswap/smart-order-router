import { Currency, CurrencyAmount as CurrencyAmountRaw } from '@uniswap/sdk-core';
import { FeeAmount } from '@uniswap/v3-sdk';
export declare class CurrencyAmount extends CurrencyAmountRaw<Currency> {
}
export declare const MAX_UINT160 = "0xffffffffffffffffffffffffffffffffffffffff";
export declare function parseAmount(value: string, currency: Currency): CurrencyAmount;
export declare function parseFeeAmount(feeAmountStr: string): FeeAmount;
export declare function unparseFeeAmount(feeAmount: FeeAmount): "10000" | "3000" | "1000" | "500" | "100";
