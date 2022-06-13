import { BigNumber } from '@ethersproject/bignumber';
import { Percent, Token, TradeType } from '@uniswap/sdk-core';
import { FeeAmount, Pool } from '@uniswap/v3-sdk';
import _ from 'lodash';
import { SwapOptions, WRAPPED_NATIVE_CURRENCY } from '../../../..';
import {
  ArbitrumGasData,
  IL2GasDataProvider,
  OptimismGasData,
} from '../../../../providers/v3/gas-data-provider';
import { IV3PoolProvider } from '../../../../providers/v3/pool-provider';
import { ChainId } from '../../../../util';
import { CurrencyAmount } from '../../../../util/amounts';
import { log } from '../../../../util/log';
import {
  buildSwapMethodParameters,
  buildTrade,
} from '../../../../util/methodParameters';
import { V3RouteWithValidQuote } from '../../entities/route-with-valid-quote';
import {
  IGasModel,
  IV3GasModelFactory,
  usdGasTokensByChain,
} from '../gas-model';
import { BASE_SWAP_COST, COST_PER_HOP, COST_PER_INIT_TICK } from './gas-costs';

// Cost for crossing an uninitialized tick.
const COST_PER_UNINIT_TICK = BigNumber.from(0);

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
export class V3HeuristicGasModelFactory extends IV3GasModelFactory {
  constructor() {
    super();
  }

  public async buildGasModel(
    chainId: ChainId,
    gasPriceWei: BigNumber,
    poolProvider: IV3PoolProvider,
    token: Token,
    l2GasDataProvider?:
      | IL2GasDataProvider<ArbitrumGasData>
      | IL2GasDataProvider<OptimismGasData>
    // this is the quoteToken
  ): Promise<IGasModel<V3RouteWithValidQuote>> {
    const l2GasData = l2GasDataProvider
      ? await l2GasDataProvider.getGasData()
      : undefined;

    const usdPool: Pool = await this.getHighestLiquidityUSDPool(
      chainId,
      poolProvider
    );

    const calculateL1GasFees = async (
      route: V3RouteWithValidQuote[]
    ): Promise<{
      gasUsedL1: BigNumber;
      gasCostL1USD: CurrencyAmount;
      gasCostL1QuoteToken: CurrencyAmount;
    }> => {
      const swapOptions: SwapOptions = {
        recipient: '0x0000000000000000000000000000000000000001',
        deadline: 100,
        slippageTolerance: new Percent(5, 10_000),
      };
      let l1Used = BigNumber.from(0);
      let l1FeeInWei = BigNumber.from(0);
      if (chainId == ChainId.OPTIMISM || chainId == ChainId.OPTIMISTIC_KOVAN) {
        [l1Used, l1FeeInWei] = this.calculateOptimismToL1SecurityFee(
          route,
          swapOptions,
          l2GasData as OptimismGasData
        );
      } else if (
        chainId == ChainId.ARBITRUM_ONE ||
        chainId == ChainId.ARBITRUM_RINKEBY
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
      if (!token.equals(nativeCurrency)) {
        const nativePool: Pool | null =
          await this.getHighestLiquidityNativePool(
            chainId,
            token,
            poolProvider
          );
        if (!nativePool) {
          log.info(
            'Could not find a pool to convert the cost into the quote token'
          );
          gasCostL1QuoteToken = CurrencyAmount.fromRawAmount(token, 0);
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

    // If our quote token is WETH, we don't need to convert our gas use to be in terms
    // of the quote token in order to produce a gas adjusted amount.
    // We do return a gas use in USD however, so we still convert to usd.
    const nativeCurrency = WRAPPED_NATIVE_CURRENCY[chainId]!;
    if (token.equals(nativeCurrency)) {
      const estimateGasCost = (
        routeWithValidQuote: V3RouteWithValidQuote
      ): {
        gasEstimate: BigNumber;
        gasCostInToken: CurrencyAmount;
        gasCostInUSD: CurrencyAmount;
      } => {
        const { totalGasCostNativeCurrency, baseGasUse } = this.estimateGas(
          routeWithValidQuote,
          gasPriceWei,
          chainId
        );

        const token0 = usdPool.token0.address == nativeCurrency.address;

        const nativeTokenPrice = token0
          ? usdPool.token0Price
          : usdPool.token1Price;

        const gasCostInTermsOfUSD: CurrencyAmount = nativeTokenPrice.quote(
          totalGasCostNativeCurrency
        ) as CurrencyAmount;

        return {
          gasEstimate: baseGasUse,
          gasCostInToken: totalGasCostNativeCurrency,
          gasCostInUSD: gasCostInTermsOfUSD,
        };
      };

      return {
        estimateGasCost,
        calculateL1GasFees,
      };
    }

    // If the quote token is not in the native currency, we convert the gas cost to be in terms of the quote token.
    // We do this by getting the highest liquidity <quoteToken>/<nativeCurrency> pool. eg. <quoteToken>/ETH pool.
    const nativePool: Pool | null = await this.getHighestLiquidityNativePool(
      chainId,
      token,
      poolProvider
    );

    const usdToken =
      usdPool.token0.address == nativeCurrency.address
        ? usdPool.token1
        : usdPool.token0;

    const estimateGasCost = (
      routeWithValidQuote: V3RouteWithValidQuote
    ): {
      gasEstimate: BigNumber;
      gasCostInToken: CurrencyAmount;
      gasCostInUSD: CurrencyAmount;
    } => {
      const { totalGasCostNativeCurrency, baseGasUse } = this.estimateGas(
        routeWithValidQuote,
        gasPriceWei,
        chainId
      );

      if (!nativePool) {
        log.info(
          `Unable to find ${nativeCurrency.symbol} pool with the quote token, ${token.symbol} to produce gas adjusted costs. Route will not account for gas.`
        );
        return {
          gasEstimate: baseGasUse,
          gasCostInToken: CurrencyAmount.fromRawAmount(token, 0),
          gasCostInUSD: CurrencyAmount.fromRawAmount(usdToken, 0),
        };
      }

      const token0 = nativePool.token0.address == nativeCurrency.address;

      // returns mid price in terms of the native currency (the ratio of quoteToken/nativeToken)
      const nativeTokenPrice = token0
        ? nativePool.token0Price
        : nativePool.token1Price;

      let gasCostInTermsOfQuoteToken: CurrencyAmount;
      try {
        // native token is base currency
        gasCostInTermsOfQuoteToken = nativeTokenPrice.quote(
          totalGasCostNativeCurrency
        ) as CurrencyAmount;
      } catch (err) {
        log.info(
          {
            nativeTokenPriceBase: nativeTokenPrice.baseCurrency,
            nativeTokenPriceQuote: nativeTokenPrice.quoteCurrency,
            gasCostInEth: totalGasCostNativeCurrency.currency,
          },
          'Debug eth price token issue'
        );
        throw err;
      }

      // true if token0 is the native currency
      const token0USDPool = usdPool.token0.address == nativeCurrency.address;

      // gets the mid price of the pool in terms of the native token
      const nativeTokenPriceUSDPool = token0USDPool
        ? usdPool.token0Price
        : usdPool.token1Price;

      let gasCostInTermsOfUSD: CurrencyAmount;
      try {
        gasCostInTermsOfUSD = nativeTokenPriceUSDPool.quote(
          totalGasCostNativeCurrency
        ) as CurrencyAmount;
      } catch (err) {
        log.info(
          {
            usdT1: usdPool.token0.symbol,
            usdT2: usdPool.token1.symbol,
            gasCostInNativeToken: totalGasCostNativeCurrency.currency.symbol,
          },
          'Failed to compute USD gas price'
        );
        throw err;
      }

      return {
        gasEstimate: baseGasUse,
        gasCostInToken: gasCostInTermsOfQuoteToken,
        gasCostInUSD: gasCostInTermsOfUSD!,
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
    chainId: ChainId
  ) {
    const totalInitializedTicksCrossed = BigNumber.from(
      Math.max(1, _.sum(routeWithValidQuote.initializedTicksCrossedList))
    );
    const totalHops = BigNumber.from(routeWithValidQuote.route.pools.length);

    const hopsGasUse = COST_PER_HOP(chainId).mul(totalHops);
    const tickGasUse = COST_PER_INIT_TICK(chainId).mul(
      totalInitializedTicksCrossed
    );
    const uninitializedTickGasUse = COST_PER_UNINIT_TICK.mul(0);

    // base estimate gas used based on chainId estimates for hops and ticks gas useage
    const baseGasUse = BASE_SWAP_COST(chainId)
      .add(hopsGasUse)
      .add(tickGasUse)
      .add(uninitializedTickGasUse);

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

  private async getHighestLiquidityNativePool(
    chainId: ChainId,
    token: Token,
    poolProvider: IV3PoolProvider
  ): Promise<Pool | null> {
    const nativeCurrency = WRAPPED_NATIVE_CURRENCY[chainId]!;

    const nativePools = _([FeeAmount.HIGH, FeeAmount.MEDIUM, FeeAmount.LOW])
      .map<[Token, Token, FeeAmount]>((feeAmount) => {
        return [nativeCurrency, token, feeAmount];
      })
      .value();

    const poolAccessor = await poolProvider.getPools(nativePools);

    const pools = _([FeeAmount.HIGH, FeeAmount.MEDIUM, FeeAmount.LOW])
      .map((feeAmount) => {
        return poolAccessor.getPool(nativeCurrency, token, feeAmount);
      })
      .compact()
      .value();

    if (pools.length == 0) {
      log.error(
        { pools },
        `Could not find a ${nativeCurrency.symbol} pool with ${token.symbol} for computing gas costs.`
      );

      return null;
    }

    const maxPool = _.maxBy(pools, (pool) => pool.liquidity) as Pool;

    return maxPool;
  }

  private async getHighestLiquidityUSDPool(
    chainId: ChainId,
    poolProvider: IV3PoolProvider
  ): Promise<Pool> {
    const usdTokens = usdGasTokensByChain[chainId];
    const wrappedCurrency = WRAPPED_NATIVE_CURRENCY[chainId]!;

    if (!usdTokens) {
      throw new Error(
        `Could not find a USD token for computing gas costs on ${chainId}`
      );
    }

    const usdPools = _([
      FeeAmount.HIGH,
      FeeAmount.MEDIUM,
      FeeAmount.LOW,
      FeeAmount.LOWEST,
    ])
      .flatMap((feeAmount) => {
        return _.map<Token, [Token, Token, FeeAmount]>(
          usdTokens,
          (usdToken) => [wrappedCurrency, usdToken, feeAmount]
        );
      })
      .value();

    const poolAccessor = await poolProvider.getPools(usdPools);

    const pools = _([
      FeeAmount.HIGH,
      FeeAmount.MEDIUM,
      FeeAmount.LOW,
      FeeAmount.LOWEST,
    ])
      .flatMap((feeAmount) => {
        const pools = [];

        for (const usdToken of usdTokens) {
          const pool = poolAccessor.getPool(
            wrappedCurrency,
            usdToken,
            feeAmount
          );
          if (pool) {
            pools.push(pool);
          }
        }

        return pools;
      })
      .compact()
      .value();

    if (pools.length == 0) {
      const message = `Could not find a USD/${wrappedCurrency.symbol} pool for computing gas costs.`;
      log.error({ pools }, message);
      throw new Error(message);
    }

    const maxPool = _.maxBy(pools, (pool) => pool.liquidity) as Pool;

    return maxPool;
  }

  /**
   * To avoid having a call to optimism's L1 security fee contract for every route and amount combination,
   * we replicate the gas cost accounting here.
   */
  private calculateOptimismToL1SecurityFee(
    routes: V3RouteWithValidQuote[],
    swapConfig: SwapOptions,
    gasData: OptimismGasData
  ): [BigNumber, BigNumber] {
    const { l1BaseFee, scalar, decimals, overhead } = gasData;

    const route: V3RouteWithValidQuote = routes[0]!;
    const inputToken =
      route.tradeType == TradeType.EXACT_INPUT
        ? route.amount.currency
        : route.quote.currency;
    const outputToken =
      route.tradeType == TradeType.EXACT_INPUT
        ? route.quote.currency
        : route.amount.currency;

    // build trade for swap calldata
    const trade = buildTrade(inputToken, outputToken, route.tradeType, routes);
    const data = buildSwapMethodParameters(trade, swapConfig).calldata;
    const l1GasUsed = this.getL2ToL1GasUsed(data, overhead);
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
    swapConfig: SwapOptions,
    gasData: ArbitrumGasData
  ): [BigNumber, BigNumber] {
    const { perL2TxFee, perL1CalldataFee } = gasData;

    const route: V3RouteWithValidQuote = routes[0]!;

    const inputToken =
      route.tradeType == TradeType.EXACT_INPUT
        ? route.amount.currency
        : route.quote.currency;
    const outputToken =
      route.tradeType == TradeType.EXACT_INPUT
        ? route.quote.currency
        : route.amount.currency;

    // build trade for swap calldata
    const trade = buildTrade(inputToken, outputToken, route.tradeType, routes);
    const data = buildSwapMethodParameters(trade, swapConfig).calldata;
    // calculates gas amounts based on bytes of calldata, use 0 as overhead.
    const l1GasUsed = this.getL2ToL1GasUsed(data, BigNumber.from(0));
    // multiply by the fee per calldata and add the flat l2 fee
    let l1Fee = l1GasUsed.mul(perL1CalldataFee);
    l1Fee = l1Fee.add(perL2TxFee);
    return [l1GasUsed, l1Fee];
  }

  // based on the code from the optimism OVM_GasPriceOracle contract
  private getL2ToL1GasUsed(data: string, overhead: BigNumber): BigNumber {
    // data is hex encoded
    const dataArr: string[] = data.slice(2).match(/.{1,2}/g)!;
    const numBytes = dataArr.length;
    let count = 0;
    for (let i = 0; i < numBytes; i += 1) {
      const byte = parseInt(dataArr[i]!, 16);
      if (byte == 0) {
        count += 4;
      } else {
        count += 16;
      }
    }
    const unsigned = overhead.add(count);
    const signedConversion = 68 * 16;
    return unsigned.add(signedConversion);
  }
}
