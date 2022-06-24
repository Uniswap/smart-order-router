import { BigNumber } from '@ethersproject/bignumber';
import { BaseProvider } from '@ethersproject/providers';
import { encodeMixedRouteToPath } from '@uniswap/router-sdk';
import retry from 'async-retry';
import _ from 'lodash';
import stats from 'stats-lite';
import { MixedRoute } from '../routers/router';
import { IQuoterV2__factory } from '../types/v3/factories/IQuoterV2__factory';
import { ChainId, metric, MetricLoggerUnit } from '../util';
import { QUOTER_V2_ADDRESS } from '../util/addresses';
import { CurrencyAmount } from '../util/amounts';
import { log } from '../util/log';
import { routeToString } from '../util/routes';
import { Result } from './multicall-provider';
import { UniswapMulticallProvider } from './multicall-uniswap-provider';
import { ProviderConfig } from './provider';

/**
 * @dev import shared types and classes from v3QuoteProvider
 */
import {
  BatchParams,
  BlockConflictError,
  BlockNumberConfig,
  FailureOverrides,
  ProviderBlockHeaderError,
  ProviderGasError,
  ProviderTimeoutError,
  QuoteRetryOptions,
  SuccessRateError,
} from './v3/quote-provider';

/**
 * A on chain quote for a swap.
 */
export type MixedRouteAmountQuote = {
  amount: CurrencyAmount;
  /**
   * Quotes can be null (e.g. pool did not have enough liquidity).
   */
  quote: BigNumber | null;
  /**
   * For each pool in the route, the sqrtPriceX96 after the swap.
   */
  sqrtPriceX96AfterList: BigNumber[] | null;
  /**
   * For each pool in the route, the number of ticks crossed.
   */
  initializedTicksCrossedList: number[] | null;
  /**
   * An estimate of the gas used by the swap. This is returned by the multicall
   * and is not necessarily accurate due to EIP-2929 causing gas costs to vary
   * depending on if the slot has already been loaded in the call.
   */
  gasEstimate: BigNumber | null;
};

/**
 * The V3 route and a list of quotes for that route.
 */
export type MixedRouteWithQuotes = [MixedRoute, MixedRouteAmountQuote[]];

type QuoteBatchSuccess = {
  status: 'success';
  inputs: [string, string][];
  results: {
    blockNumber: BigNumber;
    results: Result<[BigNumber, BigNumber[], number[], BigNumber]>[];
    approxGasUsedPerSuccessCall: number;
  };
};

type QuoteBatchFailed = {
  status: 'failed';
  inputs: [string, string][];
  reason: Error;
  results?: {
    blockNumber: BigNumber;
    results: Result<[BigNumber, BigNumber[], number[], BigNumber]>[];
    approxGasUsedPerSuccessCall: number;
  };
};

type QuoteBatchPending = {
  status: 'pending';
  inputs: [string, string][];
};

type QuoteBatchState = QuoteBatchSuccess | QuoteBatchFailed | QuoteBatchPending;

/**
 * Provider for getting quotes on Uniswap V3.
 *
 * @export
 * @interface IMixedRouteQuoteProvider
 */
export interface IMixedRouteQuoteProvider {
  /**
   * For every route, gets an exactIn quotes on V3 for every amount provided.
   *
   * @param amountIns The amounts to get quotes for.
   * @param routes The routes to get quotes for.
   * @param [providerConfig] The provider config.
   * @returns For each route returns a MixedRouteWithQuotes object that contains all the quotes.
   * @returns The blockNumber used when generating the quotes.
   */
  getQuotesManyExactIn(
    amountIns: CurrencyAmount[],
    routes: MixedRoute[],
    providerConfig?: ProviderConfig
  ): Promise<{
    routesWithQuotes: MixedRouteWithQuotes[];
    blockNumber: BigNumber;
  }>;
}

const DEFAULT_BATCH_RETRIES = 2;

/**
 * Computes quotes for V3. For V3, quotes are computed on-chain using
 * the 'QuoterV2' smart contract. This is because computing quotes off-chain would
 * require fetching all the tick data for each pool, which is a lot of data.
 *
 * To minimize the number of requests for quotes we use a Multicall contract. Generally
 * the number of quotes to fetch exceeds the maximum we can fit in a single multicall
 * while staying under gas limits, so we also batch these quotes across multiple multicalls.
 *
 * The biggest challenge with the quote provider is dealing with various gas limits.
 * Each provider sets a limit on the amount of gas a call can consume (on Infura this
 * is approximately 10x the block max size), so we must ensure each multicall does not
 * exceed this limit. Additionally, each quote on V3 can consume a large number of gas if
 * the pool lacks liquidity and the swap would cause all the ticks to be traversed.
 *
 * To ensure we don't exceed the node's call limit, we limit the gas used by each quote to
 * a specific value, and we limit the number of quotes in each multicall request. Users of this
 * class should set BatchParams such that multicallChunk * gasLimitPerCall is less than their node
 * providers total gas limit per call.
 *
 * @export
 * @class MixedRouteQuoteProvider
 */
export class MixedRouteQuoteProvider implements IMixedRouteQuoteProvider {
  protected quoterAddress: string;
  /**
   * Creates an instance of MixedRouteQuoteProvider.
   *
   * @param chainId The chain to get quotes for.
   * @param provider The web 3 provider.
   * @param multicall2Provider The multicall provider to use to get the quotes on-chain.
   * Only supports the Uniswap Multicall contract as it needs the gas limitting functionality.
   * @param retryOptions The retry options for each call to the multicall.
   * @param batchParams The parameters for each batched call to the multicall.
   * @param gasErrorFailureOverride The gas and chunk parameters to use when retrying a batch that failed due to out of gas.
   * @param successRateFailureOverrides The parameters for retries when we fail to get quotes.
   * @param blockNumberConfig Parameters for adjusting which block we get quotes from, and how to handle block header not found errors.
   * @param [quoterAddressOverride] Overrides the address of the quoter contract to use.
   */
  constructor(
    protected chainId: ChainId,
    protected provider: BaseProvider,
    // Only supports Uniswap Multicall as it needs the gas limitting functionality.
    protected multicall2Provider: UniswapMulticallProvider,
    protected retryOptions: QuoteRetryOptions = {
      retries: DEFAULT_BATCH_RETRIES,
      minTimeout: 25,
      maxTimeout: 250,
    },
    protected batchParams: BatchParams = {
      multicallChunk: 150,
      gasLimitPerCall: 1_000_000,
      quoteMinSuccessRate: 0.2,
    },
    protected gasErrorFailureOverride: FailureOverrides = {
      gasLimitOverride: 1_500_000,
      multicallChunk: 100,
    },
    protected successRateFailureOverrides: FailureOverrides = {
      gasLimitOverride: 1_300_000,
      multicallChunk: 110,
    },
    protected blockNumberConfig: BlockNumberConfig = {
      baseBlockOffset: 0,
      rollback: { enabled: false },
    },
    protected quoterAddressOverride?: string
  ) {
    const quoterAddress = quoterAddressOverride
      ? quoterAddressOverride
      : QUOTER_V2_ADDRESS;

    if (!quoterAddress) {
      throw new Error(
        `No address for Uniswap QuoterV2 Contract on chain id: ${chainId}`
      );
    }

    this.quoterAddress = quoterAddress;
  }

  public async getQuotesManyExactIn(
    amountIns: CurrencyAmount[],
    routes: MixedRoute[],
    providerConfig?: ProviderConfig
  ): Promise<{
    routesWithQuotes: MixedRouteWithQuotes[];
    blockNumber: BigNumber;
  }> {
    return this.getQuotesManyData(
      amountIns,
      routes,
      'quoteExactInput',
      providerConfig
    );
  }

  private async getQuotesManyData(
    amounts: CurrencyAmount[],
    routes: MixedRoute[],
    functionName: 'quoteExactInput',
    _providerConfig?: ProviderConfig
  ): Promise<{
    routesWithQuotes: MixedRouteWithQuotes[];
    blockNumber: BigNumber;
  }> {
    let multicallChunk = this.batchParams.multicallChunk;
    let gasLimitOverride = this.batchParams.gasLimitPerCall;
    const { baseBlockOffset, rollback } = this.blockNumberConfig;

    // Apply the base block offset if provided
    const originalBlockNumber = await this.provider.getBlockNumber();
    const providerConfig: ProviderConfig = {
      ..._providerConfig,
      blockNumber:
        _providerConfig?.blockNumber ?? originalBlockNumber + baseBlockOffset,
    };

    const inputs: [string, string][] = _(routes)
      .flatMap((route) => {
        const encodedRoute = encodeMixedRouteToPath(
          route,
          false // we don't support exactOut for mixedRoute paths
        );
        const routeInputs: [string, string][] = amounts.map((amount) => [
          encodedRoute,
          `0x${amount.quotient.toString(16)}`,
        ]);
        return routeInputs;
      })
      .value();

    const normalizedChunk = Math.ceil(
      inputs.length / Math.ceil(inputs.length / multicallChunk)
    );
    const inputsChunked = _.chunk(inputs, normalizedChunk);
    let quoteStates: QuoteBatchState[] = _.map(inputsChunked, (inputChunk) => {
      return {
        status: 'pending',
        inputs: inputChunk,
      };
    });

    log.info(
      `About to get ${
        inputs.length
      } quotes in chunks of ${normalizedChunk} [${_.map(
        inputsChunked,
        (i) => i.length
      ).join(',')}] ${
        gasLimitOverride
          ? `with a gas limit override of ${gasLimitOverride}`
          : ''
      } and block number: ${await providerConfig.blockNumber} [Original before offset: ${originalBlockNumber}].`
    );

    let haveRetriedForSuccessRate = false;
    let haveRetriedForBlockHeader = false;
    let blockHeaderRetryAttemptNumber = 0;
    let haveIncrementedBlockHeaderFailureCounter = false;
    let blockHeaderRolledBack = false;
    let haveRetriedForBlockConflictError = false;
    let haveRetriedForOutOfGas = false;
    let haveRetriedForTimeout = false;
    let haveRetriedForUnknownReason = false;
    let finalAttemptNumber = 1;
    const expectedCallsMade = quoteStates.length;
    let totalCallsMade = 0;

    const {
      results: quoteResults,
      blockNumber,
      approxGasUsedPerSuccessCall,
    } = await retry(
      async (_bail, attemptNumber) => {
        haveIncrementedBlockHeaderFailureCounter = false;
        finalAttemptNumber = attemptNumber;

        const [success, failed, pending] = this.partitionQuotes(quoteStates);

        log.info(
          `Starting attempt: ${attemptNumber}.
          Currently ${success.length} success, ${failed.length} failed, ${pending.length} pending.
          Gas limit override: ${gasLimitOverride} Block number override: ${providerConfig.blockNumber}.`
        );

        quoteStates = await Promise.all(
          _.map(
            quoteStates,
            async (quoteState: QuoteBatchState, idx: number) => {
              if (quoteState.status == 'success') {
                return quoteState;
              }

              // QuoteChunk is pending or failed, so we try again
              const { inputs } = quoteState;

              try {
                totalCallsMade = totalCallsMade + 1;

                const results =
                  await this.multicall2Provider.callSameFunctionOnContractWithMultipleParams<
                    [string, string],
                    [BigNumber, BigNumber[], number[], BigNumber] // amountIn/amountOut, sqrtPriceX96AfterList, initializedTicksCrossedList, gasEstimate
                  >({
                    address: this.quoterAddress,
                    /// @dev IQuoterV3__factory
                    contractInterface: IQuoterV2__factory.createInterface(),
                    functionName,
                    functionParams: inputs,
                    providerConfig,
                    additionalConfig: {
                      gasLimitPerCallOverride: gasLimitOverride,
                    },
                  });

                const successRateError = this.validateSuccessRate(
                  results.results,
                  haveRetriedForSuccessRate
                );

                if (successRateError) {
                  return {
                    status: 'failed',
                    inputs,
                    reason: successRateError,
                    results,
                  } as QuoteBatchFailed;
                }

                return {
                  status: 'success',
                  inputs,
                  results,
                } as QuoteBatchSuccess;
              } catch (err: any) {
                // Error from providers have huge messages that include all the calldata and fill the logs.
                // Catch them and rethrow with shorter message.
                if (err.message.includes('header not found')) {
                  return {
                    status: 'failed',
                    inputs,
                    reason: new ProviderBlockHeaderError(
                      err.message.slice(0, 500)
                    ),
                  } as QuoteBatchFailed;
                }

                if (err.message.includes('timeout')) {
                  return {
                    status: 'failed',
                    inputs,
                    reason: new ProviderTimeoutError(
                      `Req ${idx}/${quoteStates.length}. Request had ${
                        inputs.length
                      } inputs. ${err.message.slice(0, 500)}`
                    ),
                  } as QuoteBatchFailed;
                }

                if (err.message.includes('out of gas')) {
                  return {
                    status: 'failed',
                    inputs,
                    reason: new ProviderGasError(err.message.slice(0, 500)),
                  } as QuoteBatchFailed;
                }

                return {
                  status: 'failed',
                  inputs,
                  reason: new Error(
                    `Unknown error from provider: ${err.message.slice(0, 500)}`
                  ),
                } as QuoteBatchFailed;
              }
            }
          )
        );

        const [successfulQuoteStates, failedQuoteStates, pendingQuoteStates] =
          this.partitionQuotes(quoteStates);

        if (pendingQuoteStates.length > 0) {
          throw new Error('Pending quote after waiting for all promises.');
        }

        let retryAll = false;

        const blockNumberError = this.validateBlockNumbers(
          successfulQuoteStates,
          inputsChunked.length,
          gasLimitOverride
        );

        // If there is a block number conflict we retry all the quotes.
        if (blockNumberError) {
          retryAll = true;
        }

        const reasonForFailureStr = _.map(
          failedQuoteStates,
          (failedQuoteState) => failedQuoteState.reason.name
        ).join(', ');

        if (failedQuoteStates.length > 0) {
          log.info(
            `On attempt ${attemptNumber}: ${failedQuoteStates.length}/${quoteStates.length} quotes failed. Reasons: ${reasonForFailureStr}`
          );

          for (const failedQuoteState of failedQuoteStates) {
            const { reason: error } = failedQuoteState;

            log.info(
              { error },
              `[QuoteFetchError] Attempt ${attemptNumber}. ${error.message}`
            );

            if (error instanceof BlockConflictError) {
              if (!haveRetriedForBlockConflictError) {
                metric.putMetric(
                  'QuoteBlockConflictErrorRetry',
                  1,
                  MetricLoggerUnit.Count
                );
                haveRetriedForBlockConflictError = true;
              }

              retryAll = true;
            } else if (error instanceof ProviderBlockHeaderError) {
              if (!haveRetriedForBlockHeader) {
                metric.putMetric(
                  'QuoteBlockHeaderNotFoundRetry',
                  1,
                  MetricLoggerUnit.Count
                );
                haveRetriedForBlockHeader = true;
              }

              // Ensure that if multiple calls fail due to block header in the current pending batch,
              // we only count once.
              if (!haveIncrementedBlockHeaderFailureCounter) {
                blockHeaderRetryAttemptNumber =
                  blockHeaderRetryAttemptNumber + 1;
                haveIncrementedBlockHeaderFailureCounter = true;
              }

              if (rollback.enabled) {
                const { rollbackBlockOffset, attemptsBeforeRollback } =
                  rollback;

                if (
                  blockHeaderRetryAttemptNumber >= attemptsBeforeRollback &&
                  !blockHeaderRolledBack
                ) {
                  log.info(
                    `Attempt ${attemptNumber}. Have failed due to block header ${
                      blockHeaderRetryAttemptNumber - 1
                    } times. Rolling back block number by ${rollbackBlockOffset} for next retry`
                  );
                  providerConfig.blockNumber = providerConfig.blockNumber
                    ? (await providerConfig.blockNumber) + rollbackBlockOffset
                    : (await this.provider.getBlockNumber()) +
                      rollbackBlockOffset;

                  retryAll = true;
                  blockHeaderRolledBack = true;
                }
              }
            } else if (error instanceof ProviderTimeoutError) {
              if (!haveRetriedForTimeout) {
                metric.putMetric(
                  'QuoteTimeoutRetry',
                  1,
                  MetricLoggerUnit.Count
                );
                haveRetriedForTimeout = true;
              }
            } else if (error instanceof ProviderGasError) {
              if (!haveRetriedForOutOfGas) {
                metric.putMetric(
                  'QuoteOutOfGasExceptionRetry',
                  1,
                  MetricLoggerUnit.Count
                );
                haveRetriedForOutOfGas = true;
              }
              gasLimitOverride = this.gasErrorFailureOverride.gasLimitOverride;
              multicallChunk = this.gasErrorFailureOverride.multicallChunk;
              retryAll = true;
            } else if (error instanceof SuccessRateError) {
              if (!haveRetriedForSuccessRate) {
                metric.putMetric(
                  'QuoteSuccessRateRetry',
                  1,
                  MetricLoggerUnit.Count
                );
                haveRetriedForSuccessRate = true;

                // Low success rate can indicate too little gas given to each call.
                gasLimitOverride =
                  this.successRateFailureOverrides.gasLimitOverride;
                multicallChunk =
                  this.successRateFailureOverrides.multicallChunk;
                retryAll = true;
              }
            } else {
              if (!haveRetriedForUnknownReason) {
                metric.putMetric(
                  'QuoteUnknownReasonRetry',
                  1,
                  MetricLoggerUnit.Count
                );
                haveRetriedForUnknownReason = true;
              }
            }
          }
        }

        if (retryAll) {
          log.info(
            `Attempt ${attemptNumber}. Resetting all requests to pending for next attempt.`
          );

          const normalizedChunk = Math.ceil(
            inputs.length / Math.ceil(inputs.length / multicallChunk)
          );

          const inputsChunked = _.chunk(inputs, normalizedChunk);
          quoteStates = _.map(inputsChunked, (inputChunk) => {
            return {
              status: 'pending',
              inputs: inputChunk,
            };
          });
        }

        if (failedQuoteStates.length > 0) {
          // TODO: Work with Arbitrum to find a solution for making large multicalls with gas limits that always
          // successfully.
          //
          // On Arbitrum we can not set a gas limit for every call in the multicall and guarantee that
          // we will not run out of gas on the node. This is because they have a different way of accounting
          // for gas, that seperates storage and compute gas costs, and we can not cover both in a single limit.
          //
          // To work around this and avoid throwing errors when really we just couldn't get a quote, we catch this
          // case and return 0 quotes found.
          if (
            (this.chainId == ChainId.ARBITRUM_ONE ||
              this.chainId == ChainId.ARBITRUM_RINKEBY) &&
            _.every(
              failedQuoteStates,
              (failedQuoteState) =>
                failedQuoteState.reason instanceof ProviderGasError
            ) &&
            attemptNumber == this.retryOptions.retries
          ) {
            log.error(
              `Failed to get quotes on Arbitrum due to provider gas error issue. Overriding error to return 0 quotes.`
            );
            return {
              results: [],
              blockNumber: BigNumber.from(0),
              approxGasUsedPerSuccessCall: 0,
            };
          }
          throw new Error(
            `Failed to get ${failedQuoteStates.length} quotes. Reasons: ${reasonForFailureStr}`
          );
        }

        const callResults = _.map(
          successfulQuoteStates,
          (quoteState) => quoteState.results
        );

        return {
          results: _.flatMap(callResults, (result) => result.results),
          blockNumber: BigNumber.from(callResults[0]!.blockNumber),
          approxGasUsedPerSuccessCall: stats.percentile(
            _.map(callResults, (result) => result.approxGasUsedPerSuccessCall),
            100
          ),
        };
      },
      {
        retries: DEFAULT_BATCH_RETRIES,
        ...this.retryOptions,
      }
    );

    const routesQuotes = this.processQuoteResults(
      quoteResults,
      routes,
      amounts
    );

    metric.putMetric(
      'QuoteApproxGasUsedPerSuccessfulCall',
      approxGasUsedPerSuccessCall,
      MetricLoggerUnit.Count
    );

    metric.putMetric(
      'QuoteNumRetryLoops',
      finalAttemptNumber - 1,
      MetricLoggerUnit.Count
    );

    metric.putMetric(
      'QuoteTotalCallsToProvider',
      totalCallsMade,
      MetricLoggerUnit.Count
    );

    metric.putMetric(
      'QuoteExpectedCallsToProvider',
      expectedCallsMade,
      MetricLoggerUnit.Count
    );

    metric.putMetric(
      'QuoteNumRetriedCalls',
      totalCallsMade - expectedCallsMade,
      MetricLoggerUnit.Count
    );

    const [successfulQuotes, failedQuotes] = _(routesQuotes)
      .flatMap((routeWithQuotes: MixedRouteWithQuotes) => routeWithQuotes[1])
      .partition((quote) => quote.quote != null)
      .value();

    log.info(
      `Got ${successfulQuotes.length} successful quotes, ${
        failedQuotes.length
      } failed quotes. Took ${
        finalAttemptNumber - 1
      } attempt loops. Total calls made to provider: ${totalCallsMade}. Have retried for timeout: ${haveRetriedForTimeout}`
    );

    return { routesWithQuotes: routesQuotes, blockNumber };
  }

  private partitionQuotes(
    quoteStates: QuoteBatchState[]
  ): [QuoteBatchSuccess[], QuoteBatchFailed[], QuoteBatchPending[]] {
    const successfulQuoteStates: QuoteBatchSuccess[] = _.filter<
      QuoteBatchState,
      QuoteBatchSuccess
    >(
      quoteStates,
      (quoteState): quoteState is QuoteBatchSuccess =>
        quoteState.status == 'success'
    );

    const failedQuoteStates: QuoteBatchFailed[] = _.filter<
      QuoteBatchState,
      QuoteBatchFailed
    >(
      quoteStates,
      (quoteState): quoteState is QuoteBatchFailed =>
        quoteState.status == 'failed'
    );

    const pendingQuoteStates: QuoteBatchPending[] = _.filter<
      QuoteBatchState,
      QuoteBatchPending
    >(
      quoteStates,
      (quoteState): quoteState is QuoteBatchPending =>
        quoteState.status == 'pending'
    );

    return [successfulQuoteStates, failedQuoteStates, pendingQuoteStates];
  }

  private processQuoteResults(
    quoteResults: Result<[BigNumber, BigNumber[], number[], BigNumber]>[],
    routes: MixedRoute[],
    amounts: CurrencyAmount[]
  ): MixedRouteWithQuotes[] {
    const routesQuotes: MixedRouteWithQuotes[] = [];

    const quotesResultsByRoute = _.chunk(quoteResults, amounts.length);

    const debugFailedQuotes: {
      amount: string;
      percent: number;
      route: string;
    }[] = [];

    for (let i = 0; i < quotesResultsByRoute.length; i++) {
      const route = routes[i]!;
      const quoteResults = quotesResultsByRoute[i]!;
      const quotes: MixedRouteAmountQuote[] = _.map(
        quoteResults,
        (
          quoteResult: Result<[BigNumber, BigNumber[], number[], BigNumber]>,
          index: number
        ) => {
          const amount = amounts[index]!;
          if (!quoteResult.success) {
            const percent = (100 / amounts.length) * (index + 1);

            const amountStr = amount.toFixed(
              Math.min(amount.currency.decimals, 2)
            );
            const routeStr = routeToString(route);
            debugFailedQuotes.push({
              route: routeStr,
              percent,
              amount: amountStr,
            });

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

    // For routes and amounts that we failed to get a quote for, group them by route
    // and batch them together before logging to minimize number of logs.
    const debugChunk = 80;
    _.forEach(_.chunk(debugFailedQuotes, debugChunk), (quotes, idx) => {
      const failedQuotesByRoute = _.groupBy(quotes, (q) => q.route);
      const failedFlat = _.mapValues(failedQuotesByRoute, (f) =>
        _(f)
          .map((f) => `${f.percent}%[${f.amount}]`)
          .join(',')
      );

      log.info(
        {
          failedQuotes: _.map(
            failedFlat,
            (amounts, routeStr) => `${routeStr} : ${amounts}`
          ),
        },
        `Failed quotes for V3 routes Part ${idx}/${Math.ceil(
          debugFailedQuotes.length / debugChunk
        )}`
      );
    });

    return routesQuotes;
  }

  private validateBlockNumbers(
    successfulQuoteStates: QuoteBatchSuccess[],
    totalCalls: number,
    gasLimitOverride?: number
  ): BlockConflictError | null {
    if (successfulQuoteStates.length <= 1) {
      return null;
    }

    const results = _.map(
      successfulQuoteStates,
      (quoteState) => quoteState.results
    );

    const blockNumbers = _.map(results, (result) => result.blockNumber);

    const uniqBlocks = _(blockNumbers)
      .map((blockNumber) => blockNumber.toNumber())
      .uniq()
      .value();

    if (uniqBlocks.length == 1) {
      return null;
    }

    /* if (
      uniqBlocks.length == 2 &&
      Math.abs(uniqBlocks[0]! - uniqBlocks[1]!) <= 1
    ) {
      return null;
    } */

    return new BlockConflictError(
      `Quotes returned from different blocks. ${uniqBlocks}. ${totalCalls} calls were made with gas limit ${gasLimitOverride}`
    );
  }

  protected validateSuccessRate(
    allResults: Result<[BigNumber, BigNumber[], number[], BigNumber]>[],
    haveRetriedForSuccessRate: boolean
  ): void | SuccessRateError {
    const numResults = allResults.length;
    const numSuccessResults = allResults.filter(
      (result) => result.success
    ).length;

    const successRate = (1.0 * numSuccessResults) / numResults;

    const { quoteMinSuccessRate } = this.batchParams;
    if (successRate < quoteMinSuccessRate) {
      if (haveRetriedForSuccessRate) {
        log.info(
          `Quote success rate still below threshold despite retry. Continuing. ${quoteMinSuccessRate}: ${successRate}`
        );
        return;
      }

      return new SuccessRateError(
        `Quote success rate below threshold of ${quoteMinSuccessRate}: ${successRate}`
      );
    }
  }
}
