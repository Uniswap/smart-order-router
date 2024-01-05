import { BigNumber } from '@ethersproject/bignumber';
import { ChainId, Percent, Price, TradeType } from '@uniswap/sdk-core';
import { Pool } from '@uniswap/v3-sdk';
import _ from 'lodash';

import {
  SwapOptionsUniversalRouter,
  SwapType,
  WRAPPED_NATIVE_CURRENCY,
} from '../../../..';
import {
  ArbitrumGasData,
  OptimismGasData,
} from '../../../../providers/v3/gas-data-provider';
import { CurrencyAmount } from '../../../../util/amounts';
import {
  calculateArbitrumToL1FeeFromCalldata,
  getL2ToL1GasUsed
} from '../../../../util/gas-factory-helpers';
import { log } from '../../../../util/log';
import {
  buildSwapMethodParameters,
  buildTrade,
} from '../../../../util/methodParameters';
import { V3RouteWithValidQuote } from '../../entities/route-with-valid-quote';
import {
  BuildOnChainGasModelFactoryType,
  GasModelProviderConfig,
  getQuoteThroughNativePool,
  IGasModel,
  IOnChainGasModelFactory,
} from '../gas-model';

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
  constructor() {
    super();
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
      ? await l2GasDataProvider.getGasData()
      : undefined;

    const usdPool: Pool = pools.usdPool;

    const calculateL1GasFees = async (
      route: V3RouteWithValidQuote[]
    ): Promise<{
      gasUsedL1: BigNumber;
      gasCostL1USD: CurrencyAmount;
      gasCostL1QuoteToken: CurrencyAmount;
    }> => {
      const swapOptions: SwapOptionsUniversalRouter = {
        type: SwapType.UNIVERSAL_ROUTER,
        recipient: '0x0000000000000000000000000000000000000001',
        deadlineOrPreviousBlockhash: 100,
        slippageTolerance: new Percent(5, 10_000),
      };
      let l1Used = BigNumber.from(0);
      let l1FeeInWei = BigNumber.from(0);
      const opStackChains = [
        ChainId.OPTIMISM,
        ChainId.OPTIMISM_GOERLI,
        ChainId.BASE,
        ChainId.BASE_GOERLI,
      ];
      if (opStackChains.includes(chainId)) {
        [l1Used, l1FeeInWei] = this.calculateOptimismToL1SecurityFee(
          route,
          swapOptions,
          l2GasData as OptimismGasData
        );
      } else if (
        chainId == ChainId.ARBITRUM_ONE ||
        chainId == ChainId.ARBITRUM_GOERLI
      ) {
        [l1Used, l1FeeInWei] = this.calculateArbitrumToL1SecurityFee(
          route,
          swapOptions,
          l2GasData as ArbitrumGasData
        );
      }

      // wrap fee to native currency
      const nativeCurrency = WRAPPED_NATIVE_CURRENCY[chainId];
      const costNativeCurrency = CurrencyAmount.fromRawAmount(
        nativeCurrency,
        l1FeeInWei.toString()
      );

      // convert fee into usd
      const nativeTokenPrice =
        usdPool.token0.address == nativeCurrency.address
          ? usdPool.token0Price
          : usdPool.token1Price;

      const gasCostL1USD: CurrencyAmount =
        nativeTokenPrice.quote(costNativeCurrency);

      let gasCostL1QuoteToken = costNativeCurrency;
      // if the inputted token is not in the native currency, quote a native/quote token pool to get the gas cost in terms of the quote token
      if (!quoteToken.equals(nativeCurrency)) {
        const nativePool: Pool | null = pools.nativeAndQuoteTokenV3Pool;
        if (!nativePool) {
          log.info(
            'Could not find a pool to convert the cost into the quote token'
          );
          gasCostL1QuoteToken = CurrencyAmount.fromRawAmount(quoteToken, 0);
        } else {
          const nativeTokenPrice =
            nativePool.token0.address == nativeCurrency.address
              ? nativePool.token0Price
              : nativePool.token1Price;
          gasCostL1QuoteToken = nativeTokenPrice.quote(costNativeCurrency);
        }
      }
      // gasUsedL1 is the gas units used calculated from the bytes of the calldata
      // gasCostL1USD and gasCostL1QuoteToken is the cost of gas in each of those tokens
      return {
        gasUsedL1: l1Used,
        gasCostL1USD,
        gasCostL1QuoteToken,
      };
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
        const syntheticGasCostInTermsOfQuoteToken = executionPrice.quote(
          gasCostInTermsOfAmountToken
        );

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

  /**
   * To avoid having a call to optimism's L1 security fee contract for every route and amount combination,
   * we replicate the gas cost accounting here.
   */
  private calculateOptimismToL1SecurityFee(
    routes: V3RouteWithValidQuote[],
    swapConfig: SwapOptionsUniversalRouter,
    gasData: OptimismGasData
  ): [BigNumber, BigNumber] {
    const { l1BaseFee, scalar, decimals, overhead } = gasData;

    const route: V3RouteWithValidQuote = routes[0]!;
    const amountToken =
      route.tradeType == TradeType.EXACT_INPUT
        ? route.amount.currency
        : route.quote.currency;
    const outputToken =
      route.tradeType == TradeType.EXACT_INPUT
        ? route.quote.currency
        : route.amount.currency;

    // build trade for swap calldata
    const trade = buildTrade(amountToken, outputToken, route.tradeType, routes);
    const data = buildSwapMethodParameters(
      trade,
      swapConfig,
      ChainId.OPTIMISM
    ).calldata;
    const l1GasUsed = getL2ToL1GasUsed(data, overhead);
    // l1BaseFee is L1 Gas Price on etherscan
    const l1Fee = l1GasUsed.mul(l1BaseFee);
    const unscaled = l1Fee.mul(scalar);
    // scaled = unscaled / (10 ** decimals)
    const scaledConversion = BigNumber.from(10).pow(decimals);
    const scaled = unscaled.div(scaledConversion);
    return [l1GasUsed, scaled];
  }

  private calculateArbitrumToL1SecurityFee(
    routes: V3RouteWithValidQuote[],
    swapConfig: SwapOptionsUniversalRouter,
    gasData: ArbitrumGasData
  ): [BigNumber, BigNumber] {

    const route: V3RouteWithValidQuote = routes[0]!;

    const amountToken =
      route.tradeType == TradeType.EXACT_INPUT
        ? route.amount.currency
        : route.quote.currency;
    const outputToken =
      route.tradeType == TradeType.EXACT_INPUT
        ? route.quote.currency
        : route.amount.currency;

    // build trade for swap calldata
    const trade = buildTrade(amountToken, outputToken, route.tradeType, routes);
    const data = buildSwapMethodParameters(
      trade,
      swapConfig,
      ChainId.ARBITRUM_ONE
    ).calldata;
    return calculateArbitrumToL1FeeFromCalldata(data, gasData);
  }
}
