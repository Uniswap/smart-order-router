import { TradeType } from '@uniswap/sdk-core';
import {
  InsufficientInputAmountError,
  InsufficientReservesError,
} from '@uniswap/v2-sdk';
import { BigNumber } from 'ethers';
import { V2Route } from '../../routers/router';
import { CurrencyAmount } from '../../util/amounts';

// Quotes can be null (e.g. pool did not have enough liquidity).
export type V2AmountQuote = {
  amount: CurrencyAmount;
  quote: BigNumber | null;
};

export type V2RouteWithQuotes = [V2Route, V2AmountQuote[]];

export interface IV2QuoteProvider {
  getQuotesManyExactIn(
    amountIns: CurrencyAmount[],
    routes: V2Route[]
  ): Promise<{ routesWithQuotes: V2RouteWithQuotes[] }>;

  getQuotesManyExactOut(
    amountOuts: CurrencyAmount[],
    routes: V2Route[]
  ): Promise<{ routesWithQuotes: V2RouteWithQuotes[] }>;
}

/**
 * Computes quotes for V2 off-chain. Quotes are computed using the balances
 * of the pools within each route provided.
 *
 * @export
 * @class V2QuoteProvider
 */
export class V2QuoteProvider implements IV2QuoteProvider {
  constructor() {}

  public async getQuotesManyExactIn(
    amountIns: CurrencyAmount[],
    routes: V2Route[]
  ): Promise<{ routesWithQuotes: V2RouteWithQuotes[] }> {
    return this.getQuotes(amountIns, routes, TradeType.EXACT_INPUT);
  }

  public async getQuotesManyExactOut(
    amountOuts: CurrencyAmount[],
    routes: V2Route[]
  ): Promise<{ routesWithQuotes: V2RouteWithQuotes[] }> {
    return this.getQuotes(amountOuts, routes, TradeType.EXACT_OUTPUT);
  }

  private async getQuotes(
    amounts: CurrencyAmount[],
    routes: V2Route[],
    tradeType: TradeType
  ): Promise<{ routesWithQuotes: V2RouteWithQuotes[] }> {
    const routesWithQuotes: V2RouteWithQuotes[] = [];

    for (const route of routes) {
      const amountQuotes: V2AmountQuote[] = [];

      for (const amount of amounts) {
        try {
          if (tradeType == TradeType.EXACT_INPUT) {
            let outputAmount = amount.wrapped;

            for (const pair of route.pairs) {
              const [outputAmountNew] = pair.getOutputAmount(outputAmount);
              outputAmount = outputAmountNew;
            }

            amountQuotes.push({
              amount,
              quote: BigNumber.from(outputAmount.quotient.toString()),
            });
          } else {
            let inputAmount = amount.wrapped;

            for (let i = route.pairs.length - 1; i >= 0; i--) {
              const pair = route.pairs[i]!;
              [inputAmount] = pair.getInputAmount(inputAmount);
            }

            amountQuotes.push({
              amount,
              quote: BigNumber.from(inputAmount.quotient.toString()),
            });
          }
        } catch (err) {
          // Can fail to get quotes, e.g. throws InsufficientReservesError or InsufficientInputAmountError.
          if (
            err instanceof InsufficientInputAmountError ||
            err instanceof InsufficientReservesError
          ) {
            amountQuotes.push({ amount, quote: null });
          } else {
            throw err;
          }
        }
      }

      routesWithQuotes.push([route, amountQuotes]);
    }

    return {
      routesWithQuotes,
    };
  }
}
