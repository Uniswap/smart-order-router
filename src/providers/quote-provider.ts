import { encodeRouteToPath } from '@uniswap/v3-sdk';
import Logger from 'bunyan';
import { BigNumber } from 'ethers';
import _ from 'lodash';
import { Route } from '../routers/router';
import { IQuoter__factory } from '../types/v3';
import { QUOTER_ADDRESS } from '../util/addresses';
import { CurrencyAmount } from '../util/amounts';
import { routeToString } from '../util/routes';
import { Multicall2Provider, Result } from './multicall2-provider';

// Quotes can be null (e.g. pool did not have enough liquidity).
export type AmountQuote = { amount: CurrencyAmount; quote: BigNumber | null };
export type RouteWithQuotes = [Route, AmountQuote[]];

const QUOTE_CHUNKS = 20;
export class QuoteProvider {
  constructor(
    private multicall2Provider: Multicall2Provider,
    private log: Logger
  ) {}

  public async getQuotesManyExactIn(
    amountIns: CurrencyAmount[],
    routes: Route[]
  ): Promise<RouteWithQuotes[]> {
    const quoteResults = await this.getQuotesManyExactInsData(
      amountIns,
      routes
    );

    const routesQuotes = this.processQuoteResults(
      quoteResults,
      routes,
      amountIns
    );

    return routesQuotes;
  }

  public async getQuotesManyExactOut(
    amountOuts: CurrencyAmount[],
    routes: Route[]
  ): Promise<RouteWithQuotes[]> {
    const quoteResults = await this.getQuotesManyExactOutsData(
      amountOuts,
      routes
    );

    const routesQuotes = this.processQuoteResults(
      quoteResults,
      routes,
      amountOuts
    );

    return routesQuotes;
  }

  private processQuoteResults(
    quoteResults: Result<[BigNumber]>[],
    routes: Route[],
    amounts: CurrencyAmount[]
  ): RouteWithQuotes[] {
    const routesQuotes: RouteWithQuotes[] = [];

    const quotesResultsByRoute = _.chunk(quoteResults, amounts.length);

    for (let i = 0; i < quotesResultsByRoute.length; i++) {
      const route = routes[i]!;
      const quoteResults = quotesResultsByRoute[i]!;
      const quotes: AmountQuote[] = _.map(
        quoteResults,
        (quoteResult: Result<[BigNumber]>, index: number) => {
          const amount = amounts[index]!;
          if (!quoteResult.success) {
            const { returnData } = quoteResult;

            this.log.debug(
              { result: returnData },
              `Unable to get quote for ${routeToString(
                route
              )} with amount ${amount.toFixed(2)}`
            );

            return { amount, quote: null };
          }

          return { amount, quote: quoteResult.result[0] };
        }
      );

      routesQuotes.push([route, quotes]);
    }

    return routesQuotes;
  }

  private async getQuotesManyExactInsData(
    amountIns: CurrencyAmount[],
    routes: Route[]
  ): Promise<Result<[BigNumber]>[]> {
    const inputs: [string, string][] = _(routes)
      .flatMap((route) => {
        const encodedRoute = encodeRouteToPath(route, false);
        const routeInputs: [string, string][] = amountIns.map((amountIn) => [
          encodedRoute,
          `0x${amountIn.quotient.toString(16)}`,
        ]);
        return routeInputs;
      })
      .value();

    this.log.debug(
      `About to get quotes for ${inputs.length} different inputs in chunks of ${QUOTE_CHUNKS}.`
    );

    const inputsChunked = _.chunk(inputs, QUOTE_CHUNKS);
    const results = await Promise.all(
      _.map(inputsChunked, async (inputChunk) => {
        return this.multicall2Provider.callSameFunctionOnContractWithMultipleParams<
          [string, string],
          [BigNumber]
        >({
          address: QUOTER_ADDRESS,
          contractInterface: IQuoter__factory.createInterface(),
          functionName: 'quoteExactInput',
          functionParams: inputChunk,
        });
      })
    );

    this.validateBlockNumbers(results);

    return _.flatMap(results, (result) => result.results);
  }

  private async getQuotesManyExactOutsData(
    amountOuts: CurrencyAmount[],
    routes: Route[]
  ): Promise<Result<[BigNumber]>[]> {
    const inputs: [string, string][] = _(routes)
      .flatMap((route) => {
        const routeInputs: [string, string][] = amountOuts.map((amountOut) => [
          encodeRouteToPath(route, true),
          `0x${amountOut.quotient.toString(16)}`,
        ]);
        return routeInputs;
      })
      .value();

    this.log.debug(
      `About to get quotes for ${inputs.length} different inputs in chunks of ${QUOTE_CHUNKS}.`
    );

    const inputsChunked = _.chunk(inputs, QUOTE_CHUNKS);
    const results = await Promise.all(
      _.map(inputsChunked, async (inputChunk) => {
        return this.multicall2Provider.callSameFunctionOnContractWithMultipleParams<
          [string, string],
          [BigNumber]
        >({
          address: QUOTER_ADDRESS,
          contractInterface: IQuoter__factory.createInterface(),
          functionName: 'quoteExactOutput',
          functionParams: inputChunk,
        });
      })
    );

    this.validateBlockNumbers(results);

    return _.flatMap(results, (result) => result.results);
  }

  private validateBlockNumbers(results: { blockNumber: BigNumber }[]): void {
    const blockNumbers = _.map(results, (result) => result.blockNumber);

    const allBlockNumbersSame = _.every(
      blockNumbers,
      (blockNumber) => blockNumber.toString() == blockNumbers[0]!.toString()
    );

    if (!allBlockNumbersSame) {
      // TODO: Retry.
      this.log.error(
        { blocks: _.uniq(_.map(blockNumbers, (b) => b.toString())) },
        'Quotes returned from different blocks.'
      );
      throw new Error('Quotes returned from different blocks.');
    }
  }
}
