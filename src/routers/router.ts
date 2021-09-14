import { Currency, Percent, Token, TradeType } from '@uniswap/sdk-core';
import { MethodParameters, Position, Route as RouteRaw, Trade} from '@uniswap/v3-sdk';
import { BigNumber } from 'ethers';
import { CurrencyAmount } from '../util/amounts';
import { RouteWithValidQuote } from './alpha-router';

export class RouteSOR extends RouteRaw<Token, Token> {}

export type SwapRoute<TTradeType extends TradeType> = {
  quote: CurrencyAmount;
  quoteGasAdjusted: CurrencyAmount;
  estimatedGasUsed: BigNumber;
  estimatedGasUsedQuoteToken: CurrencyAmount;
  estimatedGasUsedUSD: CurrencyAmount;
  gasPriceWei: BigNumber;
  trade: Trade<Currency, Currency, TTradeType>;
  route: RouteWithValidQuote[];
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

export abstract class ISwapToRatio<RoutingConfig> {
  abstract routeToRatio(
    token0Balance: CurrencyAmount,
    token1Balance: CurrencyAmount,
    position: Position,
    swapConfig?: SwapConfig,
    routingConfig?: RoutingConfig
  ): Promise<SwapRoute<TradeType.EXACT_INPUT> | null>;
}
