import { BigNumber } from '@ethersproject/bignumber';
import { Percent, Token } from '@uniswap/sdk-core';
import { Pair } from '@uniswap/v2-sdk';
import { FeeAmount, Pool } from '@uniswap/v3-sdk';
import _ from 'lodash';
import { SwapOptions, WRAPPED_NATIVE_CURRENCY } from '../../../..';
import { IV2PoolProvider } from '../../../../providers/v2/pool-provider';
import { IV3PoolProvider } from '../../../../providers/v3/pool-provider';
import { ChainId } from '../../../../util';
import { CurrencyAmount } from '../../../../util/amounts';
import { log } from '../../../../util/log';
import { MixedRouteWithValidQuote } from '../../entities/route-with-valid-quote';
import {
  IGasModel,
  IMixedRouteGasModelFactory,
  usdGasTokensByChain,
} from '../gas-model';
import { COST_PER_EXTRA_HOP as COST_PER_EXTRA_HOP_V2 } from '../v2/v2-heuristic-gas-model';
import {
  BASE_SWAP_COST,
  COST_PER_HOP,
  COST_PER_INIT_TICK,
} from '../v3/gas-costs';

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
export class MixedRouteHeuristicGasModelFactory extends IMixedRouteGasModelFactory {
  constructor() {
    super();
  }

  public async buildGasModel(
    chainId: ChainId,
    gasPriceWei: BigNumber,
    V3poolProvider: IV3PoolProvider,
    // @ts-ignore[TS6133] /// @dev ignore unused parameter for now since we might need it in later implementation and don't want to refactor
    V2poolProvider: IV2PoolProvider,
    token: Token
    // this is the quoteToken
  ): Promise<IGasModel<MixedRouteWithValidQuote>> {
    const usdPool: Pool = await this.getHighestLiquidityUSDPool(
      chainId,
      V3poolProvider
    );

    /// @dev we might not even need this ... might be only for Op and Arb
    const calculateL1GasFees = async (): Promise<{
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
        throw new Error(
          'Mixed route gas estimates for Optimism are not supported'
        );
      } else if (
        chainId == ChainId.ARBITRUM_ONE ||
        chainId == ChainId.ARBITRUM_RINKEBY
      ) {
        throw new Error(
          'Mixed route gas estimates for Arbitrum are not supported'
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
            V3poolProvider
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
        routeWithValidQuote: MixedRouteWithValidQuote
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
      V3poolProvider
    );

    const usdToken =
      usdPool.token0.address == nativeCurrency.address
        ? usdPool.token1
        : usdPool.token0;

    const estimateGasCost = (
      routeWithValidQuote: MixedRouteWithValidQuote
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
    routeWithValidQuote: MixedRouteWithValidQuote,
    gasPriceWei: BigNumber,
    chainId: ChainId
  ) {
    /// @dev since the initializedTickList is 0 for V2 pair the sum will not be affected
    const totalInitializedTicksCrossed = BigNumber.from(
      Math.max(1, _.sum(routeWithValidQuote.initializedTicksCrossedList))
    );
    /**
     * A V3 hop was 1:1 for every pool (i.e. if we went from pool A to pool B it is 1 hop)
     * Similarly with V2
     *
     * Naive approach: every v3 pool is a hop, and counted as 80_000 gas
     *                 every v2 pool is a hop, and counted as 20_000 gas
     * Does not matter if v2->v3 or v3->v2
     * - we will test and see if this hold true
     */
    const totalV3Hops = BigNumber.from(
      routeWithValidQuote.route.parts.filter((part) => part instanceof Pool)
        .length
    );
    const totalV2Hops = BigNumber.from(
      routeWithValidQuote.route.parts.filter((part) => part instanceof Pair)
        .length
    );

    const V3hopsGasUse = COST_PER_HOP(chainId).mul(totalV3Hops);
    const V2hopsGasUse = COST_PER_EXTRA_HOP_V2.mul(totalV2Hops);
    const tickGasUse = COST_PER_INIT_TICK(chainId).mul(
      totalInitializedTicksCrossed
    );
    const uninitializedTickGasUse = COST_PER_UNINIT_TICK.mul(0);

    // base estimate gas used based on chainId estimates for hops and ticks gas useage

    /// @dev BASE_SWAP_COST is different on v2 and v3 heuristic, 2000 on V3 and 115_000 on V2. why?
    const baseGasUse = BASE_SWAP_COST(chainId)
      .add(V3hopsGasUse)
      .add(V2hopsGasUse)
      .add(tickGasUse)
      .add(uninitializedTickGasUse);
    // const baseGasUse = BASE_SWAP_COST(chainId); /// TODO remove but for testing

    const baseGasCostWei = gasPriceWei.mul(baseGasUse);

    if (baseGasUse.toNumber() > 366000) {
      console.log(
        'higher than expected baseGasUse for mixed route',
        baseGasUse.toNumber()
      );
    }

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
    V3poolProvider: IV3PoolProvider
  ): Promise<Pool | null> {
    const nativeCurrency = WRAPPED_NATIVE_CURRENCY[chainId]!;

    const nativePools = _([FeeAmount.HIGH, FeeAmount.MEDIUM, FeeAmount.LOW])
      .map<[Token, Token, FeeAmount]>((feeAmount) => {
        return [nativeCurrency, token, feeAmount];
      })
      .value();

    const poolAccessor = await V3poolProvider.getPools(nativePools);

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
    V3poolProvider: IV3PoolProvider
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

    const poolAccessor = await V3poolProvider.getPools(usdPools);

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
}
