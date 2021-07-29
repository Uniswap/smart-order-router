import { encodeRouteToPath } from '@uniswap/v3-sdk';
import { default as AsyncRetry, default as retry } from 'async-retry';
import { BigNumber } from 'ethers';
import _ from 'lodash';
import { RouteSOR } from '../routers/router';
import { IQuoterV2__factory } from '../types/v3/factories/IQuoterV2__factory';
import { QUOTER_V2_ADDRESS } from '../util/addresses';
import { CurrencyAmount } from '../util/amounts';
import { log } from '../util/log';
import { routeToString } from '../util/routes';
import { Result } from './multicall-provider';
import { UniswapMulticallProvider } from './multicall-uniswap-provider';

// Quotes can be null (e.g. pool did not have enough liquidity).
export type AmountQuote = {
  amount: CurrencyAmount;
  quote: BigNumber | null;
  sqrtPriceX96AfterList: BigNumber[] | null;
  initializedTicksCrossedList: number[] | null;
  gasEstimate: BigNumber | null;
};

export class BlockConflictError extends Error {}
export class SuccessRateError extends Error {}

const DEFAULT_CHUNK = 150;

export type QuoteRetryOptions = AsyncRetry.Options;

export type RouteWithQuotes = [RouteSOR, AmountQuote[]];

export interface IQuoteProvider {
  getQuotesManyExactIn(
    amountIns: CurrencyAmount[],
    routes: RouteSOR[]
  ): Promise<{ routesWithQuotes: RouteWithQuotes[]; blockNumber: BigNumber }>;

  getQuotesManyExactOut(
    amountOuts: CurrencyAmount[],
    routes: RouteSOR[]
  ): Promise<{ routesWithQuotes: RouteWithQuotes[]; blockNumber: BigNumber }>;
}

export class QuoteProvider implements IQuoteProvider {
  constructor(
    protected multicall2Provider: UniswapMulticallProvider,
    protected retryOptions: QuoteRetryOptions = {
      retries: 2,
      minTimeout: 50,
      maxTimeout: 500,
    },
    protected batchParams = { multicallChunk: DEFAULT_CHUNK }
  ) {}

  public async getQuotesManyExactIn(
    amountIns: CurrencyAmount[],
    routes: RouteSOR[]
  ): Promise<{ routesWithQuotes: RouteWithQuotes[]; blockNumber: BigNumber }> {
    log.info(
      { numAmounts: amountIns.length, numRoutes: routes.length },
      `About to get quotes for ${routes.length} routes, with ${amountIns.length} amounts per route.`
    );

    let multicallChunk = this.batchParams.multicallChunk;
    let gasLimitOverride: number | undefined = undefined;

    const { results: quoteResults, blockNumber } = await retry(
      async () => {
        return this.getQuotesManyExactInsData(
          amountIns,
          routes,
          multicallChunk,
          gasLimitOverride
        );
      },
      {
        ...this.retryOptions,
        onRetry: (error: Error, _attempt: number): any => {
          // Low success rate often indicates too little gas given to each call.
          if (error instanceof SuccessRateError) {
            log.info(
              `Success rate error. Setting gas limit to 1.5m and chunk size to 100.`
            );
            gasLimitOverride = 1_500_000;
            multicallChunk = 100;
          }
        },
      }
    );

    const routesQuotes = this.processQuoteResults(
      quoteResults,
      routes,
      amountIns
    );

    return { routesWithQuotes: routesQuotes, blockNumber };
  }

  public async getQuotesManyExactOut(
    amountOuts: CurrencyAmount[],
    routes: RouteSOR[]
  ): Promise<{ routesWithQuotes: RouteWithQuotes[]; blockNumber: BigNumber }> {
    log.info(
      { numAmounts: amountOuts.length, numRoutes: routes.length },
      `About to get quotes for ${routes.length} routes, with ${amountOuts.length} amounts per route.`
    );

    let multicallChunk = this.batchParams.multicallChunk;
    let gasLimitOverride: number | undefined = undefined;

    const { results: quoteResults, blockNumber } = await retry(
      async () => {
        return this.getQuotesManyExactOutsData(
          amountOuts,
          routes,
          multicallChunk,
          gasLimitOverride
        );
      },
      {
        ...this.retryOptions,
        onRetry: (error: Error, _attempt: number): any => {
          if (error instanceof SuccessRateError) {
            log.info(
              `Success rate error. Setting gas limit to 1.5m and chunk size to 100.`
            );
            gasLimitOverride = 1_500_000;
            multicallChunk = 100;
          }
        },
      }
    );

    const routesQuotes = this.processQuoteResults(
      quoteResults,
      routes,
      amountOuts
    );

    return { routesWithQuotes: routesQuotes, blockNumber };
  }

  private processQuoteResults(
    quoteResults: Result<[BigNumber, BigNumber[], number[], BigNumber]>[],
    routes: RouteSOR[],
    amounts: CurrencyAmount[]
  ): RouteWithQuotes[] {
    const routesQuotes: RouteWithQuotes[] = [];

    const quotesResultsByRoute = _.chunk(quoteResults, amounts.length);

    for (let i = 0; i < quotesResultsByRoute.length; i++) {
      const route = routes[i]!;
      const quoteResults = quotesResultsByRoute[i]!;
      const quotes: AmountQuote[] = _.map(
        quoteResults,
        (
          quoteResult: Result<[BigNumber, BigNumber[], number[], BigNumber]>,
          index: number
        ) => {
          const amount = amounts[index]!;
          if (!quoteResult.success) {
            const { returnData } = quoteResult;

            log.debug(
              { result: returnData },
              `Unable to get quote for ${routeToString(
                route
              )} with amount ${amount.toFixed(2)}`
            );

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

    return routesQuotes;
  }

  private async getQuotesManyExactInsData(
    amountIns: CurrencyAmount[],
    routes: RouteSOR[],
    multicallChunk: number,
    gasLimitOverride?: number
  ): Promise<{
    results: Result<[BigNumber, BigNumber[], number[], BigNumber]>[];
    blockNumber: BigNumber;
  }> {
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

    const inputsChunked = _.chunk(inputs, multicallChunk);

    log.info(
      `About to get ${inputs.length} quotes in chunks of ${multicallChunk} ${
        gasLimitOverride
          ? `with a gas limit override of ${gasLimitOverride}`
          : ''
      }. In total ${inputsChunked.length} multicalls.`
    );

    const results = await Promise.all(
      _.map(inputsChunked, async (inputChunk) => {
        return this.multicall2Provider.callSameFunctionOnContractWithMultipleParams<
          [string, string],
          [BigNumber, BigNumber[], number[], BigNumber] // amountOut, sqrtPriceX96AfterList, initializedTicksCrossedList, gasEstimate
        >({
          address: QUOTER_V2_ADDRESS,
          contractInterface: IQuoterV2__factory.createInterface(),
          functionName: 'quoteExactInput',
          functionParams: inputChunk,
          additionalConfig: { gasLimitPerCallOverride: gasLimitOverride },
        });
      })
    );

    this.validateBlockNumbers(results);
    this.validateSuccessRate(results);

    return {
      results: _.flatMap(results, (result) => result.results),
      blockNumber: results[0]!.blockNumber,
    };
  }

  private async getQuotesManyExactOutsData(
    amountOuts: CurrencyAmount[],
    routes: RouteSOR[],
    multicallChunk: number,
    gasLimitOverride?: number
  ): Promise<{
    results: Result<[BigNumber, BigNumber[], number[], BigNumber]>[];
    blockNumber: BigNumber;
  }> {
    const inputs: [string, string][] = _(routes)
      .flatMap((route) => {
        const routeInputs: [string, string][] = amountOuts.map((amountOut) => [
          encodeRouteToPath(route, true),
          `0x${amountOut.quotient.toString(16)}`,
        ]);
        return routeInputs;
      })
      .value();

    const inputsChunked = _.chunk(inputs, multicallChunk);

    log.info(
      {
        quotesToGet: inputs.length,
        numQuoteMulticalls: inputsChunked.length,
        gasLimitOverride,
      },
      `About to get ${inputs.length} quotes in chunks of ${multicallChunk} ${
        gasLimitOverride
          ? `with a gas limit override of ${gasLimitOverride}`
          : ''
      }. In total ${inputsChunked.length} multicalls.`
    );

    const results = await Promise.all(
      _.map(inputsChunked, async (inputChunk) => {
        return this.multicall2Provider.callSameFunctionOnContractWithMultipleParams<
          [string, string],
          [BigNumber, BigNumber[], number[], BigNumber] // amountIn, sqrtPriceX96AfterList, initializedTicksCrossedList, gasEstimate
        >({
          address: QUOTER_V2_ADDRESS,
          contractInterface: IQuoterV2__factory.createInterface(),
          functionName: 'quoteExactOutput',
          functionParams: inputChunk,
          additionalConfig: { gasLimitPerCallOverride: gasLimitOverride },
        });
      })
    );

    this.validateBlockNumbers(results);
    this.validateSuccessRate(results);

    return {
      results: _.flatMap(results, (result) => result.results),
      blockNumber: results[0]!.blockNumber,
    };
  }

  private validateBlockNumbers(results: { blockNumber: BigNumber }[]): void {
    const blockNumbers = _.map(results, (result) => result.blockNumber);

    const allBlockNumbersSame = _.every(
      blockNumbers,
      (blockNumber) => blockNumber.toString() == blockNumbers[0]!.toString()
    );

    if (!allBlockNumbersSame) {
      log.info(
        { blocks: _.uniq(_.map(blockNumbers, (b) => b.toString())) },
        'Quotes returned from different blocks.'
      );
      throw new BlockConflictError('Quotes returned from different blocks.');
    }
  }

  private validateSuccessRate(
    results: {
      results: Result<[BigNumber, BigNumber[], number[], BigNumber]>[];
    }[]
  ): void {
    const allResults = _.flatMap(results, (result) => result.results);
    const numResults = allResults.length;
    const numSuccessResults = allResults.filter(
      (result) => result.success
    ).length;

    const successRate = (1.0 * numSuccessResults) / numResults;

    if (successRate < 0.95) {
      log.info(`Success rate below threshold of 0.95: ${successRate}`);
      throw new SuccessRateError('Quotes returned from different blocks.');
    }
  }
}
