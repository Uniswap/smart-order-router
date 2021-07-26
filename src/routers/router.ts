import { Currency, Percent, Token, TradeType } from '@uniswap/sdk-core';
import { MethodParameters, Route as RouteRaw, Trade } from '@uniswap/v3-sdk';
import { BigNumber } from 'ethers';
import { CurrencyAmount } from '../util/amounts';

export class RouteSOR extends RouteRaw<Token, Token> {}

export type RouteAmount = {
  route: RouteSOR;
  amount: CurrencyAmount;
  quote: CurrencyAmount;
  quoteGasAdjusted: CurrencyAmount;
  estimatedGasUsed: BigNumber;
  estimatedGasUsedQuoteToken: CurrencyAmount;
  estimatedGasUsedUSD: CurrencyAmount;
};

export type SwapRoute<TTradeType extends TradeType> = {
  quote: CurrencyAmount;
  quoteGasAdjusted: CurrencyAmount;
  estimatedGasUsed: BigNumber;
  estimatedGasUsedQuoteToken: CurrencyAmount;
  estimatedGasUsedUSD: CurrencyAmount;
  gasPriceWei: BigNumber;
  trade: Trade<Currency, Currency, TTradeType>;
  routeAmounts: RouteAmount[];
  blockNumber: BigNumber;
  methodParameters?: MethodParameters;
};

export type SwapConfig = {
  recipient: string;
  slippageTolerance: Percent;
  deadline: number;
  inputTokenPermit?:
    | {
        v: 0 | 1 | 27 | 28;
        r: string;
        s: string;
        amount: string;
        deadline: string;
      }
    | {
        v: 0 | 1 | 27 | 28;
        r: string;
        s: string;
        nonce: string;
        expiry: string;
      };
};
export abstract class IRouter<RoutingConfig> {
  abstract routeExactIn(
    currencyIn: Currency,
    currencyOut: Currency,
    amountIn: CurrencyAmount,
    swapConfig?: SwapConfig,
    routingConfig?: RoutingConfig
  ): Promise<SwapRoute<TradeType.EXACT_INPUT> | null>;

  abstract routeExactOut(
    currencyIn: Currency,
    currencyOut: Currency,
    amountOut: CurrencyAmount,
    swapConfig?: SwapConfig,
    routingConfig?: RoutingConfig
  ): Promise<SwapRoute<TradeType.EXACT_OUTPUT> | null>;
}
