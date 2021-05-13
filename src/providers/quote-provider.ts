import { CurrencyAmount } from '@uniswap/sdk-core';
import { encodeRouteToPath } from '@uniswap/v3-sdk';
import Logger from 'bunyan';
import { BigNumber } from 'ethers';
import _ from 'lodash';
import { Route } from '../routers/router';
import { IQuoter__factory } from '../types/v3';
import { QUOTER_ADDRESS } from '../util/addresses';
import { Multicall2Provider, Result } from './multicall';

export class QuoteProvider {
  constructor(
    private multicall2Provider: Multicall2Provider,
    private log: Logger
  ) {}

  public async getQuotesExactIn(
    amountIn: CurrencyAmount,
    routes: Route[]
  ): Promise<(BigNumber | null)[]> {
    const quotesResult = await this.getQuotesExactInData(amountIn, routes);

    const quotes = _.map(quotesResult, (quoteResult: Result<[BigNumber]>) => {
      if (!quoteResult.success) {
        return null;
      }

      return quoteResult.result[0];
    });

    return quotes;
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

    this.log.info(`Quotes fetched as of block ${blockNumber}`);

    return results;
  }
}
