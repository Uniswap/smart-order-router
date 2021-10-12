import { BigNumber } from 'ethers';
import _ from 'lodash';
import { V2Route } from '../../routers/router';
import { CurrencyAmount } from '../../util/amounts';
import { TradeType } from '@uniswap/sdk-core';

// Quotes can be null (e.g. pool did not have enough liquidity).
export type V2AmountQuote = {
  amount: CurrencyAmount;
  quote: BigNumber | null;
  gasEstimate: BigNumber | null;
};

export type V2RouteWithQuotes = [V2Route, V2AmountQuote[]];

export interface IV2QuoteProvider {
  getQuotesManyExactIn(
    amountIns: CurrencyAmount[],
    routes: V2Route[],
  ): Promise<{ routesWithQuotes: V2RouteWithQuotes[]; blockNumber: BigNumber }>;

  getQuotesManyExactOut(
    amountOuts: CurrencyAmount[],
    routes: V2Route[],
  ): Promise<{ routesWithQuotes: V2RouteWithQuotes[]; blockNumber: BigNumber }>;
}

export class V2QuoteProvider implements IV2QuoteProvider {
  constructor() {}

  public async getQuotesManyExactIn(
    amountIns: CurrencyAmount[],
    routes: V2Route[],
  ): Promise<{ routesWithQuotes: V2RouteWithQuotes[]; blockNumber: BigNumber }> {
    return this.getQuotes(
      amountIns,
      routes,
      TradeType.EXACT_INPUT
    );
  }

  public async getQuotesManyExactOut(
    amountOuts: CurrencyAmount[],
    routes: V2Route[],
  ): Promise<{ routesWithQuotes: V2RouteWithQuotes[]; blockNumber: BigNumber }> {
    return this.getQuotes(
      amountOuts,
      routes,
      TradeType.EXACT_OUTPUT
    );
  }

  private async getQuotes(_amounts: CurrencyAmount[], _routes: V2Route[], _tradeType: TradeType): Promise<{ routesWithQuotes: V2RouteWithQuotes[]; blockNumber: BigNumber; }> {
    throw new Error('Method not implemented.');
  }

  /*
  private processQuoteResults(
    quoteResults: Result<[BigNumber, BigNumber[], number[], BigNumber]>[],
    routes: V2Route[],
    amounts: CurrencyAmount[]
  ): V2RouteWithQuotes[] {
    const routesQuotes: V2RouteWithQuotes[] = [];

    const quotesResultsByRoute = _.chunk(quoteResults, amounts.length);

    const debugFailedQuotes: {route: string, msg: string}[] = [];

    for (let i = 0; i < quotesResultsByRoute.length; i++) {
      const route = routes[i]!;
      const quoteResults = quotesResultsByRoute[i]!;
      const quotes: V2AmountQuote[] = _.map(
        quoteResults,
        (
          quoteResult: Result<[BigNumber, BigNumber[], number[], BigNumber]>,
          index: number
        ) => {
          const amount = amounts[index]!;
          if (!quoteResult.success) {
            const percent = (100 / amounts.length) * (index + 1);

            debugFailedQuotes.push({ msg: `${percent}% via ${routeToString(
              route
            )} Amount: ${amount.toFixed(2)}`, route: routeToString(
              route
            ) });

            return {
              amount,
              quote: null,
              sqrtPriceX96AfterList: null,
              gasEstimate: null,
              initializedTicksCrossedList: null,
            };
          }

          return {
            amount,
            quote: quoteResult.result[0],
            sqrtPriceX96AfterList: quoteResult.result[1],
            initializedTicksCrossedList: quoteResult.result[2],
            gasEstimate: quoteResult.result[3],
          };
        }
      );

      routesQuotes.push([route, quotes]);
    }

    _.forEach(_.chunk(debugFailedQuotes, 20), (quotes, idx) => {
      const routesInChunk = _(quotes).map(q => q.route).uniq().value();
      log.info({ failedQuotes: _.map(quotes, q => q.msg) }, `Failed quotes for routes ${routesInChunk} Part ${idx}/${quotes.length}`);
    });

    return routesQuotes;
  }
 */
}
