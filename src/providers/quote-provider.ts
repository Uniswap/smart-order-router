import { CurrencyAmount } from '@uniswap/sdk-core';
import { encodeRouteToPath } from '@uniswap/v3-sdk';
import Logger from 'bunyan';
import { BigNumber } from 'ethers';
import _ from 'lodash';
import { Route } from '../routers/router';
import { IQuoter__factory } from '../types/v3';
import { QUOTER_ADDRESS } from '../util/addresses';
import { Multicall2Provider, Result } from './multicall2-provider';

export class QuoteProvider {
  constructor(
    private multicall2Provider: Multicall2Provider,
    private log: Logger
  ) {}

  public async getQuotesExactIn(
    amountIn: CurrencyAmount,
    routes: Route[]
  ): Promise<(BigNumber | null)[]> {
    const quoteResults = await this.getQuotesExactInData(amountIn, routes);
    const quotes = this.processQuoteResults(quoteResults);

    return quotes;
  }

  public async getQuotesExactOut(
    amountOut: CurrencyAmount,
    routes: Route[]
  ): Promise<(BigNumber | null)[]> {
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
      `0x${amountIn.raw.toString(16)}`,
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

  private async getQuotesExactOutData(
    amountOut: CurrencyAmount,
    routes: Route[]
  ): Promise<Result<[BigNumber]>[]> {
    const quoteExactOutInputs: [string, string][] = routes.map((route) => [
      encodeRouteToPath(route, true),
      `0x${amountOut.raw.toString(16)}`,
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
