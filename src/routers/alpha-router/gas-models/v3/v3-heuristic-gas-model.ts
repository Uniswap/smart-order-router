import { BigNumber } from '@ethersproject/bignumber';
import { ChainId, Price } from '@uniswap/sdk-core';
import { Pool } from '@uniswap/v3-sdk';
import _ from 'lodash';

import { WRAPPED_NATIVE_CURRENCY } from '../../../..';
import { CurrencyAmount } from '../../../../util/amounts';
import { calculateL1GasFeesHelper } from '../../../../util/gas-factory-helpers';
import { log } from '../../../../util/log';
import { V3RouteWithValidQuote } from '../../entities/route-with-valid-quote';
import {
  BuildOnChainGasModelFactoryType,
  GasModelProviderConfig,
  getQuoteThroughNativePool,
  IGasModel,
  IOnChainGasModelFactory,
} from '../gas-model';

import { BaseProvider } from '@ethersproject/providers';
import {
  BASE_SWAP_COST,
  COST_PER_HOP,
  COST_PER_INIT_TICK,
  COST_PER_UNINIT_TICK,
  SINGLE_HOP_OVERHEAD,
  TOKEN_OVERHEAD,
} from './gas-costs';

/**
 * Computes a gas estimate for a V3 swap using heuristics.
 * Considers number of hops in the route, number of ticks crossed
 * and the typical base cost for a swap.
 *
 * We get the number of ticks crossed in a swap from the QuoterV2
 * contract.
 *
 * We compute gas estimates off-chain because
 *  1/ Calling eth_estimateGas for a swaps requires the caller to have
 *     the full balance token being swapped, and approvals.
 *  2/ Tracking gas used using a wrapper contract is not accurate with Multicall
 *     due to EIP-2929. We would have to make a request for every swap we wanted to estimate.
 *  3/ For V2 we simulate all our swaps off-chain so have no way to track gas used.
 *
 * @export
 * @class V3HeuristicGasModelFactory
 */
export class V3HeuristicGasModelFactory extends IOnChainGasModelFactory {
  private provider: BaseProvider;

  constructor(provider: BaseProvider) {
    super();
    this.provider = provider;
  }

  public async buildGasModel({
    chainId,
    gasPriceWei,
    pools,
    amountToken,
    quoteToken,
    l2GasDataProvider,
    providerConfig,
  }: BuildOnChainGasModelFactoryType): Promise<
    IGasModel<V3RouteWithValidQuote>
  > {
    const l2GasData = l2GasDataProvider
      ? await l2GasDataProvider.getGasData(providerConfig)
      : undefined;

    const usdPool: Pool = pools.usdPool;

    const calculateL1GasFees = async (
      route: V3RouteWithValidQuote[]
    ): Promise<{
      gasUsedL1: BigNumber;
      gasUsedL1OnL2: BigNumber;
      gasCostL1USD: CurrencyAmount;
      gasCostL1QuoteToken: CurrencyAmount;
    }> => {
      return await calculateL1GasFeesHelper(
        route,
        chainId,
        usdPool,
        quoteToken,
        pools.nativeAndQuoteTokenV3Pool,
        this.provider,
        l2GasData
      );
    };

    const nativeCurrency = WRAPPED_NATIVE_CURRENCY[chainId]!;
    let nativeAmountPool: Pool | null = null;
    if (!amountToken.equals(nativeCurrency)) {
      nativeAmountPool = pools.nativeAndAmountTokenV3Pool;
    }

    const usdToken = usdPool.token0.equals(nativeCurrency)
      ? usdPool.token1
      : usdPool.token0;

    const estimateGasCost = (
      routeWithValidQuote: V3RouteWithValidQuote
    ): {
      gasEstimate: BigNumber;
      gasCostInToken: CurrencyAmount;
      gasCostInUSD: CurrencyAmount;
      gasCostInGasToken?: CurrencyAmount;
    } => {
      const { totalGasCostNativeCurrency, baseGasUse } = this.estimateGas(
        routeWithValidQuote,
        gasPriceWei,
        chainId,
        providerConfig
      );

      /** ------ MARK: USD logic  -------- */
      const gasCostInTermsOfUSD = getQuoteThroughNativePool(
        chainId,
        totalGasCostNativeCurrency,
        usdPool
      );

      /** ------ MARK: Conditional logic run if gasToken is specified  -------- */
      const nativeAndSpecifiedGasTokenPool: Pool | null =
        pools.nativeAndSpecifiedGasTokenV3Pool;
      let gasCostInTermsOfGasToken: CurrencyAmount | undefined = undefined;
      // we don't want to fetch the gasToken pool if the gasToken is the native currency
      if (nativeAndSpecifiedGasTokenPool) {
        gasCostInTermsOfGasToken = getQuoteThroughNativePool(
          chainId,
          totalGasCostNativeCurrency,
          nativeAndSpecifiedGasTokenPool
        );
      }
      // if the gasToken is the native currency, we can just use the totalGasCostNativeCurrency
      else if (providerConfig?.gasToken?.equals(nativeCurrency)) {
        gasCostInTermsOfGasToken = totalGasCostNativeCurrency;
      }

      /** ------ MARK: return early if quoteToken is wrapped native currency ------- */
      if (quoteToken.equals(nativeCurrency)) {
        return {
          gasEstimate: baseGasUse,
          gasCostInToken: totalGasCostNativeCurrency,
          gasCostInUSD: gasCostInTermsOfUSD,
          gasCostInGasToken: gasCostInTermsOfGasToken,
        };
      }

      /** ------ MARK: Main gas logic in terms of quote token -------- */

      // Since the quote token is not in the native currency, we convert the gas cost to be in terms of the quote token.
      // We do this by getting the highest liquidity <quoteToken>/<nativeCurrency> pool. eg. <quoteToken>/ETH pool.
      const nativeAndQuoteTokenPool: Pool | null =
        pools.nativeAndQuoteTokenV3Pool;

      let gasCostInTermsOfQuoteToken: CurrencyAmount | null = null;
      if (nativeAndQuoteTokenPool) {
        gasCostInTermsOfQuoteToken = getQuoteThroughNativePool(
          chainId,
          totalGasCostNativeCurrency,
          nativeAndQuoteTokenPool
        );
      }
      // We may have a nativeAmountPool, but not a nativePool
      else {
        log.info(
          `Unable to find ${nativeCurrency.symbol} pool with the quote token, ${quoteToken.symbol} to produce gas adjusted costs. Using amountToken to calculate gas costs.`
        );
      }

      /** ------ MARK: (V3 ONLY) Logic for calculating synthetic gas cost in terms of amount token -------- */
      // TODO: evaluate effectiveness and potentially refactor

      // Highest liquidity pool for the non quote token / ETH
      // A pool with the non quote token / ETH should not be required and errors should be handled separately
      if (nativeAmountPool) {
        // get current execution price (amountToken / quoteToken)
        const executionPrice = new Price(
          routeWithValidQuote.amount.currency,
          routeWithValidQuote.quote.currency,
          routeWithValidQuote.amount.quotient,
          routeWithValidQuote.quote.quotient
        );

        const inputIsToken0 =
          nativeAmountPool.token0.address == nativeCurrency.address;
        // ratio of input / native
        const nativeAndAmountTokenPrice = inputIsToken0
          ? nativeAmountPool.token0Price
          : nativeAmountPool.token1Price;

        const gasCostInTermsOfAmountToken = nativeAndAmountTokenPrice.quote(
          totalGasCostNativeCurrency
        ) as CurrencyAmount;

        // Convert gasCostInTermsOfAmountToken to quote token using execution price
        let syntheticGasCostInTermsOfQuoteToken;

        try {
          syntheticGasCostInTermsOfQuoteToken = executionPrice.quote(
            gasCostInTermsOfAmountToken
          );
        } catch (error) {
          // This is in response to the 'division by zero' error
          // during https://uniswapteam.slack.com/archives/C059TGEC57W/p1724360921341949
          if (error instanceof RangeError && error.message.includes('Division by zero')) {
            log.error(
              {
                nativeAndAmountTokenPrice: nativeAndAmountTokenPrice.toSignificant(6),
                gasCostInTermsOfQuoteToken: gasCostInTermsOfQuoteToken
                  ? gasCostInTermsOfQuoteToken.toExact()
                  : 0,
                gasCostInTermsOfAmountToken: gasCostInTermsOfAmountToken.toExact(),
                executionPrice: executionPrice.toSignificant(6),
              },
              'Error calculating synthetic gas cost in terms of quote token'
            );
          }

          // We don't want to change the behavior here. If it throws an error, we want to log it and re-throw
          throw error;
        }

        // Note that the syntheticGasCost being lessThan the original quoted value is not always strictly better
        // e.g. the scenario where the amountToken/ETH pool is very illiquid as well and returns an extremely small number
        // however, it is better to have the gasEstimation be almost 0 than almost infinity, as the user will still receive a quote
        if (
          gasCostInTermsOfQuoteToken === null ||
          syntheticGasCostInTermsOfQuoteToken.lessThan(
            gasCostInTermsOfQuoteToken.asFraction
          )
        ) {
          log.info(
            {
              nativeAndAmountTokenPrice:
                nativeAndAmountTokenPrice.toSignificant(6),
              gasCostInTermsOfQuoteToken: gasCostInTermsOfQuoteToken
                ? gasCostInTermsOfQuoteToken.toExact()
                : 0,
              gasCostInTermsOfAmountToken:
                gasCostInTermsOfAmountToken.toExact(),
              executionPrice: executionPrice.toSignificant(6),
              syntheticGasCostInTermsOfQuoteToken:
                syntheticGasCostInTermsOfQuoteToken.toSignificant(6),
            },
            'New gasCostInTermsOfQuoteToken calculated with synthetic quote token price is less than original'
          );

          gasCostInTermsOfQuoteToken = syntheticGasCostInTermsOfQuoteToken;
        }
      }

      // If gasCostInTermsOfQuoteToken is null, both attempts to calculate gasCostInTermsOfQuoteToken failed (nativePool and amountNativePool)
      if (gasCostInTermsOfQuoteToken === null) {
        log.info(
          `Unable to find ${nativeCurrency.symbol} pool with the quote token, ${quoteToken.symbol}, or amount Token, ${amountToken.symbol} to produce gas adjusted costs. Route will not account for gas.`
        );
        return {
          gasEstimate: baseGasUse,
          gasCostInToken: CurrencyAmount.fromRawAmount(quoteToken, 0),
          gasCostInUSD: CurrencyAmount.fromRawAmount(usdToken, 0),
        };
      }

      return {
        gasEstimate: baseGasUse,
        gasCostInToken: gasCostInTermsOfQuoteToken,
        gasCostInUSD: gasCostInTermsOfUSD!,
        gasCostInGasToken: gasCostInTermsOfGasToken,
      };
    };

    return {
      estimateGasCost: estimateGasCost.bind(this),
      calculateL1GasFees,
    };
  }

  private estimateGas(
    routeWithValidQuote: V3RouteWithValidQuote,
    gasPriceWei: BigNumber,
    chainId: ChainId,
    providerConfig?: GasModelProviderConfig
  ) {
    const totalInitializedTicksCrossed = BigNumber.from(
      Math.max(1, _.sum(routeWithValidQuote.initializedTicksCrossedList))
    );
    const totalHops = BigNumber.from(routeWithValidQuote.route.pools.length);

    let hopsGasUse = COST_PER_HOP(chainId).mul(totalHops);

    // We have observed that this algorithm tends to underestimate single hop swaps.
    // We add a buffer in the case of a single hop swap.
    if (totalHops.eq(1)) {
      hopsGasUse = hopsGasUse.add(SINGLE_HOP_OVERHEAD(chainId));
    }

    // Some tokens have extremely expensive transferFrom functions, which causes
    // us to underestimate them by a large amount. For known tokens, we apply an
    // adjustment.
    const tokenOverhead = TOKEN_OVERHEAD(chainId, routeWithValidQuote.route);

    const tickGasUse = COST_PER_INIT_TICK(chainId).mul(
      totalInitializedTicksCrossed
    );
    const uninitializedTickGasUse = COST_PER_UNINIT_TICK.mul(0);

    // base estimate gas used based on chainId estimates for hops and ticks gas useage
    const baseGasUse = BASE_SWAP_COST(chainId)
      .add(hopsGasUse)
      .add(tokenOverhead)
      .add(tickGasUse)
      .add(uninitializedTickGasUse)
      .add(providerConfig?.additionalGasOverhead ?? BigNumber.from(0));

    const baseGasCostWei = gasPriceWei.mul(baseGasUse);

    const wrappedCurrency = WRAPPED_NATIVE_CURRENCY[chainId]!;

    const totalGasCostNativeCurrency = CurrencyAmount.fromRawAmount(
      wrappedCurrency,
      baseGasCostWei.toString()
    );

    return {
      totalGasCostNativeCurrency,
      totalInitializedTicksCrossed,
      baseGasUse,
    };
  }
}
