import { encodeRouteToPath } from '@uniswap/v3-sdk';
import Logger from 'bunyan';
import { BigNumber } from 'ethers';
import _ from 'lodash';
import { Route } from '../routers/router';
import { IQuoter__factory } from '../types/v3';
import { QUOTER_ADDRESS } from '../util/addresses';
import { CurrencyAmount } from '../util/amounts';
import { Multicall2Provider, Result } from './multicall2-provider';

export type Quotes = (BigNumber | null)[];
export type RouteQuotes = [Route, Quotes];
export class QuoteProvider {
  constructor(
    private multicall2Provider: Multicall2Provider,
    private log: Logger
  ) {}

  public async getQuotesExactIn(
    amountIn: CurrencyAmount,
    routes: Route[]
  ): Promise<Quotes> {
    const quoteResults = await this.getQuotesExactInData(amountIn, routes);
    const quotes = this.processQuoteResults(quoteResults);

    return quotes;
  }

  public async getQuotesExactIns(
    amountIns: CurrencyAmount[],
    routes: Route[]
  ): Promise<RouteQuotes[]> {
    const quoteResults = await this.getQuotesExactInsData(amountIns, routes);
    const quotes = this.processQuoteResults(quoteResults);
    const routesQuotes: RouteQuotes[] = [];

    const quotesChunked = _.chunk(quotes, amountIns.length);
    for (let i = 0; i < routes.length; i++) {
      const route = routes[i]!;
      const routeQuotes = quotesChunked[i] as (BigNumber | null)[];
      routesQuotes.push([route, routeQuotes]);
    }

    return routesQuotes;
  }

  public async getQuotesExactOut(
    amountOut: CurrencyAmount,
    routes: Route[]
  ): Promise<Quotes> {
    const quoteResults = await this.getQuotesExactOutData(amountOut, routes);
    const quotes = this.processQuoteResults(quoteResults);

    return quotes;
  }

  private processQuoteResults(quoteResults: Result<[BigNumber]>[]) {
    return _.map(quoteResults, (quoteResult: Result<[BigNumber]>) => {
      if (!quoteResult.success) {
        return null;
      }

      return quoteResult.result[0];
    });
  }

  private async getQuotesExactInData(
    amountIn: CurrencyAmount,
    routes: Route[]
  ): Promise<Result<[BigNumber]>[]> {
    const quoteExactInInputs: [string, string][] = routes.map((route) => [
      encodeRouteToPath(route, false),
      `0x${amountIn.quotient.toString(16)}`,
    ]);

    const {
      results,
      blockNumber,
    } = await this.multicall2Provider.callSameFunctionOnContractWithMultipleParams<
      [string, string],
      [BigNumber]
    >({
      address: QUOTER_ADDRESS,
      contractInterface: IQuoter__factory.createInterface(),
      functionName: 'quoteExactInput',
      functionParams: quoteExactInInputs,
    });

    this.log.debug(`Quotes fetched as of block ${blockNumber}`);

    return results;
  }

  private async getQuotesExactInsData(
    amountIns: CurrencyAmount[],
    routes: Route[]
  ): Promise<Result<[BigNumber]>[]> {
    const inputs: [string, string][] = [];

    for (const route of routes) {
      const encodedRoute = encodeRouteToPath(route, false);
      const routeInputs: [string, string][] = amountIns.map((amountIn) => [
        encodedRoute,
        `0x${amountIn.quotient.toString(16)}`,
      ]);
      inputs.push(...routeInputs);
    }

    this.log.debug(
      `About to get quotes for ${inputs.length} different inputs.`
    );

    const inputsChunked = _.chunk(inputs, 20);
    const results = await Promise.all(
      _.map(inputsChunked, async (inputChunk) => {
        const {
          results,
          blockNumber,
        } = await this.multicall2Provider.callSameFunctionOnContractWithMultipleParams<
          [string, string],
          [BigNumber]
        >({
          address: QUOTER_ADDRESS,
          contractInterface: IQuoter__factory.createInterface(),
          functionName: 'quoteExactInput',
          functionParams: inputChunk,
        });

        this.log.debug(`Quotes fetched as of block ${blockNumber}`);

        return results;
      })
    );

    return _.flatten(results);
  }

  private async getQuotesExactOutData(
    amountOut: CurrencyAmount,
    routes: Route[]
  ): Promise<Result<[BigNumber]>[]> {
    const quoteExactOutInputs: [string, string][] = routes.map((route) => [
      encodeRouteToPath(route, true),
      `0x${amountOut.quotient.toString(16)}`,
    ]);

    const {
      results,
      blockNumber,
    } = await this.multicall2Provider.callSameFunctionOnContractWithMultipleParams<
      [string, string],
      [BigNumber]
    >({
      address: QUOTER_ADDRESS,
      contractInterface: IQuoter__factory.createInterface(),
      functionName: 'quoteExactOutput',
      functionParams: quoteExactOutInputs,
    });

    this.log.debug(`Quotes fetched as of block ${blockNumber}`);

    return results;
  }
}
