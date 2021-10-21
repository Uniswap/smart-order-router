import { Currency, Percent, Token, TradeType } from '@uniswap/sdk-core';
import { MethodParameters, Position, Route as V3RouteRaw, Trade } from '@uniswap/v3-sdk';
import { Route as V2RouteRaw } from '@uniswap/v2-sdk';
import { BigNumber } from 'ethers';
import { CurrencyAmount } from '../util/amounts';
import { IRouteWithValidQuote } from './alpha-router';

export class V3Route extends V3RouteRaw<Token, Token> {}
export class V2Route extends V2RouteRaw<Token, Token> {}

export type SwapRoute<TTradeType extends TradeType> = {
  quote: CurrencyAmount;
  quoteGasAdjusted: CurrencyAmount;
  estimatedGasUsed: BigNumber;
  estimatedGasUsedQuoteToken: CurrencyAmount;
  estimatedGasUsedUSD: CurrencyAmount;
  gasPriceWei: BigNumber;
  trade?: Trade<Currency, Currency, TTradeType>; // TODO: Re-enable once have single Trade object.
  route: IRouteWithValidQuote[];
  blockNumber: BigNumber;
  methodParameters?: MethodParameters;
};

export type SwapConfig = {
  recipient: string;
  slippageTolerance: Percent;
  deadline: number;
  inputTokenPermit?:
  {
    v: 0 | 1 | 27 | 28;
    r: string;
    s: string;
  } & ({
    amount: string;
    deadline: string;

  } | {
    nonce: string;
    expiry: string;
  }
  )
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

export abstract class ISwapToRatio<RoutingConfig, SwapAndAddConfig> {
  abstract routeToRatio(
    token0Balance: CurrencyAmount,
    token1Balance: CurrencyAmount,
    position: Position,
    swapAndAddConfig: SwapAndAddConfig,
    swapConfig?: SwapConfig,
    routingConfig?: RoutingConfig
  ): Promise<SwapRoute<TradeType.EXACT_INPUT> | null>;
}
