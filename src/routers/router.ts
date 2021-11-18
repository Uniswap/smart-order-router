import { Trade } from '@uniswap/router-sdk';
import {
  Currency,
  Fraction,
  Percent,
  Token,
  TradeType,
} from '@uniswap/sdk-core';
import { Route as V2RouteRaw } from '@uniswap/v2-sdk';
import {
  MethodParameters,
  Pool,
  Position,
  Route as V3RouteRaw,
} from '@uniswap/v3-sdk';
import { BigNumber } from 'ethers';
import { CurrencyAmount } from '../util/amounts';
import { RouteWithValidQuote } from './alpha-router';

export class V3Route extends V3RouteRaw<Token, Token> {}
export class V2Route extends V2RouteRaw<Token, Token> {}

export type SwapRoute = {
  quote: CurrencyAmount;
  quoteGasAdjusted: CurrencyAmount;
  estimatedGasUsed: BigNumber;
  estimatedGasUsedQuoteToken: CurrencyAmount;
  estimatedGasUsedUSD: CurrencyAmount;
  gasPriceWei: BigNumber;
  trade: Trade<Currency, Currency, TradeType>;
  route: RouteWithValidQuote[];
  blockNumber: BigNumber;
  methodParameters?: MethodParameters;
};

export type SwapToRatioRoute = SwapRoute & {
  optimalRatio: Fraction;
  postSwapTargetPool: Pool;
};

export enum SwapToRatioStatus {
  SUCCESS = 1,
  NO_ROUTE_FOUND = 2,
  NO_SWAP_NEEDED = 3,
}

export type SwapToRatioSuccess = {
  status: SwapToRatioStatus.SUCCESS;
  result: SwapToRatioRoute;
};

export type SwapToRatioFail = {
  status: SwapToRatioStatus.NO_ROUTE_FOUND;
  error: string;
};

export type SwapToRatioNoSwapNeeded = {
  status: SwapToRatioStatus.NO_SWAP_NEEDED;
};

export type SwapToRatioResponse =
  | SwapToRatioSuccess
  | SwapToRatioFail
  | SwapToRatioNoSwapNeeded;

export type SwapConfig = {
  recipient: string;
  slippageTolerance: Percent;
  deadline: number;
  inputTokenPermit?: {
    v: 0 | 1 | 27 | 28;
    r: string;
    s: string;
  } & (
    | {
        amount: string;
        deadline: string;
      }
    | {
        nonce: string;
        expiry: string;
      }
  );
};

export abstract class IRouter<RoutingConfig> {
  abstract route(
    amount: CurrencyAmount,
    quoteCurrency: Currency,
    swapType: TradeType,
    swapConfig?: SwapConfig,
    partialRoutingConfig?: Partial<RoutingConfig>
  ): Promise<SwapRoute | null>;
}

export abstract class ISwapToRatio<RoutingConfig, SwapAndAddConfig> {
  abstract routeToRatio(
    token0Balance: CurrencyAmount,
    token1Balance: CurrencyAmount,
    position: Position,
    swapAndAddConfig: SwapAndAddConfig,
    swapConfig?: SwapConfig,
    routingConfig?: RoutingConfig
  ): Promise<SwapToRatioResponse>;
}
