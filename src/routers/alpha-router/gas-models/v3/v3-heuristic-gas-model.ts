import { BigNumber } from '@ethersproject/bignumber';
import { Token } from '@uniswap/sdk-core';
import { FeeAmount, Pool } from '@uniswap/v3-sdk';
import _ from 'lodash';
import {
  OptimismGasData,
  SwapOptions,
  WRAPPED_NATIVE_CURRENCY,
} from '../../../..';
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
    swapConfig?: SwapOptions,
    gasData?: OptimismGasData
    // this is the quoteToken
  ): Promise<IGasModel<V3RouteWithValidQuote>> {
    // If our quote token is WETH, we don't need to convert our gas use to be in terms
    // of the quote token in order to produce a gas adjusted amount.
    // We do return a gas use in USD however, so we still convert to usd.

    const nativeCurrency = WRAPPED_NATIVE_CURRENCY[chainId]!;
    if (token.equals(nativeCurrency)) {
      const usdPool: Pool = await this.getHighestLiquidityUSDPool(
        chainId,
        poolProvider
      );

      const estimateGasCost = (
        routeWithValidQuote: V3RouteWithValidQuote
      ): {
        gasEstimate: BigNumber;
        gasCostInToken: CurrencyAmount;
        gasCostInUSD: CurrencyAmount;
        initTicksCrossed: number;
        gasUseL1: BigNumber;
        gasCostL1: BigNumber;
      } => {
        const {
          totalGasCostNativeCurrency,
          totalInitializedTicksCrossed,
          l1GasUsed,
          totalGasUse,
          l1Fee,
        } = this.estimateGas(
          routeWithValidQuote,
          gasPriceWei,
          chainId,
          swapConfig,
          gasData
        );

        const token0 = usdPool.token0.address == nativeCurrency.address;

        const nativeTokenPrice = token0
          ? usdPool.token0Price
          : usdPool.token1Price;

        const gasCostInTermsOfUSD: CurrencyAmount = nativeTokenPrice.quote(
          totalGasCostNativeCurrency
        ) as CurrencyAmount;

        return {
          gasEstimate: totalGasUse,
          gasCostInToken: totalGasCostNativeCurrency,
          gasCostInUSD: gasCostInTermsOfUSD,
          initTicksCrossed: totalInitializedTicksCrossed,
          gasUseL1: l1GasUsed,
          gasCostL1: l1Fee,
        };
      };

      return {
        estimateGasCost,
      };
    }

    // If the quote token is not in the native currency, we convert the gas cost to be in terms of the quote token.
    // We do this by getting the highest liquidity <quoteToken>/<nativeCurrency> pool. eg. <quoteToken>/ETH pool.
    const nativePool: Pool | null = await this.getHighestLiquidityNativePool(
      chainId,
      token,
      poolProvider
    );

    const usdPool: Pool = await this.getHighestLiquidityUSDPool(
      chainId,
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
      initTicksCrossed: number;
      gasUseL1: BigNumber;
      gasCostL1: BigNumber;
    } => {
      const {
        totalGasCostNativeCurrency,
        totalInitializedTicksCrossed,
        l1GasUsed,
        totalGasUse,
        l1Fee,
      } = this.estimateGas(
        routeWithValidQuote,
        gasPriceWei,
        chainId,
        swapConfig,
        gasData
      );

      if (!nativePool) {
        log.info(
          `Unable to find ${nativeCurrency.symbol} pool with the quote token, ${token.symbol} to produce gas adjusted costs. Route will not account for gas.`
        );
        return {
          gasEstimate: totalGasUse,
          gasCostInToken: CurrencyAmount.fromRawAmount(token, 0),
          gasCostInUSD: CurrencyAmount.fromRawAmount(usdToken, 0),
          initTicksCrossed: totalInitializedTicksCrossed,
          gasUseL1: l1GasUsed,
          gasCostL1: l1Fee,
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
        gasEstimate: totalGasUse,
        gasCostInToken: gasCostInTermsOfQuoteToken,
        gasCostInUSD: gasCostInTermsOfUSD!,
        initTicksCrossed: totalInitializedTicksCrossed,
        gasUseL1: l1GasUsed,
        gasCostL1: l1Fee,
      };
    };

    return {
      estimateGasCost: estimateGasCost.bind(this),
    };
  }

  // NOTE end of buildGasModel()

  private estimateGas(
    routeWithValidQuote: V3RouteWithValidQuote,
    gasPriceWei: BigNumber,
    chainId: ChainId,
    swapConfig?: SwapOptions,
    gasData?: OptimismGasData
  ) {
    const totalInitializedTicksCrossed = Math.max(
      1,
      _.sum(routeWithValidQuote.initializedTicksCrossedList)
    );
    const totalHops = BigNumber.from(routeWithValidQuote.route.pools.length);

    const hopsGasUse = COST_PER_HOP(chainId).mul(totalHops);
    const tickGasUse = COST_PER_INIT_TICK(chainId).mul(
      totalInitializedTicksCrossed
    );
    const uninitializedTickGasUse = COST_PER_UNINIT_TICK.mul(0);

    let l1GasUsed = BigNumber.from(0);
    let l1Fee = BigNumber.from(0);
    if (chainId == ChainId.OPTIMISM || chainId == ChainId.OPTIMISTIC_KOVAN) {
      // account for the L1 security fee
      if (!swapConfig) {
        log.info('Skipping l1 security fee calculation');
      } else {
        [l1GasUsed, l1Fee] = this.calculateL1SecurityFee(
          routeWithValidQuote,
          swapConfig,
          gasData!
        );
      }
    }
    const baseGasUse = BASE_SWAP_COST(chainId)
      .add(hopsGasUse)
      .add(tickGasUse)
      .add(uninitializedTickGasUse);

    const baseGasCostWei = gasPriceWei.mul(baseGasUse);

    const totalGasUse = l1GasUsed.add(baseGasUse);

    // total gas cost including l1 security fee if on optimism
    const totalGasCostWei = l1Fee.add(baseGasCostWei);

    const wrappedCurrency = WRAPPED_NATIVE_CURRENCY[chainId]!;

    const totalGasCostNativeCurrency = CurrencyAmount.fromRawAmount(
      wrappedCurrency,
      totalGasCostWei.toString()
    );

    return {
      totalGasCostNativeCurrency,
      totalInitializedTicksCrossed,
      l1GasUsed,
      l1Fee,
      totalGasUse,
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
      log.error(
        { pools },
        `Could not find a USD/${wrappedCurrency.symbol} pool for computing gas costs.`
      );
      throw new Error(
        `Can't find USD/${wrappedCurrency.symbol} pool for computing gas costs.`
      );
    }

    const maxPool = _.maxBy(pools, (pool) => pool.liquidity) as Pool;

    return maxPool;
  }

  private calculateL1SecurityFee(
    route: V3RouteWithValidQuote,
    swapConfig: SwapOptions,
    gasData: OptimismGasData
  ): [BigNumber, BigNumber] {
    const { l1BaseFee, scalar, decimals, overhead } = gasData;

    // build trade for swap calldata
    const trade = buildTrade(
      route.amount.currency,
      route.quote.currency,
      route.tradeType,
      [route]
    );
    const data = buildSwapMethodParameters(trade, swapConfig).calldata;
    const l1GasUsed = this.getL1GasUsed(data, overhead);
    const l1Fee = l1GasUsed.mul(l1BaseFee);
    const unscaled = l1Fee.mul(scalar);
    // scaled = unscaled / (10 ** decimals)
    const scaledConversion = BigNumber.from(10).pow(decimals);
    const scaled = unscaled.div(scaledConversion);
    return [l1GasUsed, scaled];
  }

  private getL1GasUsed(data: string, overhead: BigNumber): BigNumber {
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
