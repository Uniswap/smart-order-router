import { BigNumber } from '@ethersproject/bignumber';
import { Token } from '@uniswap/sdk-core';
import { FeeAmount, Pool } from '@uniswap/v3-sdk';
import Logger from 'bunyan';
import _ from 'lodash';
import { PoolAccessor } from '../../../providers/pool-provider';
import { TokenProvider } from '../../../providers/token-provider';
import { CurrencyAmount } from '../../../util/amounts';
import { routeToString } from '../../../util/routes';
import { RouteWithValidQuote } from '../entities/route-with-valid-quote';
import { GasModel, GasModelFactory } from './gas-model';

// Constant cost for doing any swap regardless of pools.
const BASE_SWAP_COST = BigNumber.from(2000);

// Cost for crossing an initialized tick.
const COST_PER_INIT_TICK = BigNumber.from(33000);

// TODO: Cost for crossing an uninitialized tick.
const COST_PER_UNINIT_TICK = BigNumber.from(0);

// Constant per pool swap in the route.
const COST_PER_HOP = BigNumber.from(100000);

export class HeuristicGasModelFactory extends GasModelFactory {
  constructor(private log: Logger) {
    super();
  }

  protected _buildGasModel(
    chainId: number,
    gasPriceWei: BigNumber,
    tokenProvider: TokenProvider,
    poolAccessor: PoolAccessor,
    token: Token
  ): GasModel {
    const estimateGasCostInTermsOfToken = (
      routeWithValidQuote: RouteWithValidQuote
    ): { gasEstimate: BigNumber; gasCostInToken: CurrencyAmount } => {
      const totalInitializedTicksCrossed = _.sum(
        routeWithValidQuote.initializedTicksCrossedList
      );
      const totalHops = BigNumber.from(routeWithValidQuote.route.pools.length);

      const hopsGasUse = COST_PER_HOP.mul(totalHops);
      const tickGasUse = COST_PER_INIT_TICK.mul(totalInitializedTicksCrossed);
      const uninitializedTickGasUse = COST_PER_UNINIT_TICK.mul(0);

      this.log.debug(
        {
          totalHops: totalHops.toString(),
          totalInitializedTicksCrossed: totalInitializedTicksCrossed.toString(),
          hopsGasUse: hopsGasUse.toString(),
          tickGasUse: tickGasUse.toString(),
          amount: routeWithValidQuote.amount.toFixed(2),
          percent: routeWithValidQuote.percent,
        },
        `Gas Model Inputs for route: ${routeToString(
          routeWithValidQuote.route
        )}`
      );

      const gasUse = BASE_SWAP_COST.add(hopsGasUse)
        .add(tickGasUse)
        .add(uninitializedTickGasUse);

      const totalGasCostWei = gasPriceWei.mul(gasUse);

      const weth = tokenProvider.getToken(chainId, 'WETH');

      const totalGasCostCurrencyAmount = CurrencyAmount.fromRawAmount(
        weth,
        totalGasCostWei.toString()
      );

      let gasCostInTermsOfQuoteToken: CurrencyAmount =
        totalGasCostCurrencyAmount;

      // If the quote token is not WETH, we convert the gas cost to be in terms of the quote token.
      // We do this by getting the highest liquidity <token>/ETH pool.
      if (token.symbol !== 'WETH' && token.symbol !== 'WETH9') {
        const ethPool = this.getHighestLiquidityEthPool(
          chainId,
          token,
          poolAccessor,
          tokenProvider
        );
        const ethToken0 = ethPool.token0.symbol == 'WETH';

        const ethTokenPrice = ethToken0
          ? ethPool.token0Price
          : ethPool.token1Price;

        gasCostInTermsOfQuoteToken = ethTokenPrice.quote(
          totalGasCostCurrencyAmount
        ) as CurrencyAmount;
      }

      return {
        gasEstimate: gasUse,
        gasCostInToken: gasCostInTermsOfQuoteToken,
      };
    };

    return {
      estimateGasCostInTermsOfToken,
    };
  }

  private getHighestLiquidityEthPool(
    chainId: number,
    token: Token,
    poolAccessor: PoolAccessor,
    tokenProvider: TokenProvider
  ): Pool {
    const weth = tokenProvider.getToken(chainId, 'WETH');

    const pools = _([FeeAmount.HIGH, FeeAmount.MEDIUM, FeeAmount.LOW])
      .map((feeAmount) => {
        return poolAccessor.getPool(weth, token, feeAmount);
      })
      .compact()
      .value();

    if (pools.length == 0) {
      this.log.error(
        `Could not find a WETH pool with ${token.symbol} for computing gas costs`
      );
      throw new Error(
        `Can't find WETH/${token.symbol} pool for computing gas costs.`
      );
    }

    const maxPool = _.maxBy(pools, (pool) => pool.liquidity) as Pool;

    return maxPool;
  }
}
