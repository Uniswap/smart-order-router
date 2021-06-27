import { BigNumber } from '@ethersproject/bignumber';
import { Token } from '@uniswap/sdk-core';
import { FeeAmount, Pool } from '@uniswap/v3-sdk';
import _ from 'lodash';
import { PoolAccessor } from '../../../providers/pool-provider';
import { TokenProvider } from '../../../providers/token-provider';
import { CurrencyAmount } from '../../../util/amounts';
import { log } from '../../../util/log';
import { RouteWithValidQuote } from '../entities/route-with-valid-quote';
import { GasModel, GasModelFactory } from './gas-model';

// Constant cost for doing any swap regardless of pools.
const BASE_SWAP_COST = BigNumber.from(2000);

// Cost for crossing an initialized tick.
const COST_PER_INIT_TICK = BigNumber.from(33000);

// TODO: Cost for crossing an uninitialized tick.
const COST_PER_UNINIT_TICK = BigNumber.from(0);

// Constant per pool swap in the route.
const COST_PER_HOP = BigNumber.from(90000);

export class HeuristicGasModelFactory extends GasModelFactory {
  constructor() {
    super();
  }

  protected _buildGasModel(
    chainId: number,
    gasPriceWei: BigNumber,
    tokenProvider: TokenProvider,
    poolAccessor: PoolAccessor,
    token: Token
  ): GasModel {
    if (token.symbol === 'WETH' || token.symbol === 'WETH9') {
      const estimateGasCostInTermsOfToken = (
        routeWithValidQuote: RouteWithValidQuote
      ): { gasEstimate: BigNumber; gasCostInToken: CurrencyAmount } => {
        const { gasCostInEth, gasUse } = this.estimateGas(
          routeWithValidQuote,
          gasPriceWei,
          tokenProvider,
          chainId
        );
        return {
          gasEstimate: gasUse,
          gasCostInToken: gasCostInEth,
        };
      };

      return {
        estimateGasCostInTermsOfToken,
      };
    }

    // If the quote token is not WETH, we convert the gas cost to be in terms of the quote token.
    // We do this by getting the highest liquidity <token>/ETH pool.
    const ethPool: Pool = this.getHighestLiquidityEthPool(
      chainId,
      token,
      poolAccessor,
      tokenProvider
    );

    const estimateGasCostInTermsOfToken = (
      routeWithValidQuote: RouteWithValidQuote
    ): { gasEstimate: BigNumber; gasCostInToken: CurrencyAmount } => {
      const { gasCostInEth, gasUse } = this.estimateGas(
        routeWithValidQuote,
        gasPriceWei,
        tokenProvider,
        chainId
      );

      const ethToken0 = ethPool.token0.symbol == 'WETH';

      const ethTokenPrice = ethToken0
        ? ethPool.token0Price
        : ethPool.token1Price;

      const gasCostInTermsOfQuoteToken: CurrencyAmount = ethTokenPrice.quote(
        gasCostInEth
      ) as CurrencyAmount;

      return {
        gasEstimate: gasUse,
        gasCostInToken: gasCostInTermsOfQuoteToken,
      };
    };

    return {
      estimateGasCostInTermsOfToken,
    };
  }

  private estimateGas(
    routeWithValidQuote: RouteWithValidQuote,
    gasPriceWei: BigNumber,
    tokenProvider: TokenProvider,
    chainId: number
  ) {
    const totalInitializedTicksCrossed = _.sum(
      routeWithValidQuote.initializedTicksCrossedList
    );
    const totalHops = BigNumber.from(routeWithValidQuote.route.pools.length);

    const hopsGasUse = COST_PER_HOP.mul(totalHops);
    const tickGasUse = COST_PER_INIT_TICK.mul(totalInitializedTicksCrossed);
    const uninitializedTickGasUse = COST_PER_UNINIT_TICK.mul(0);

    const gasUse = BASE_SWAP_COST.add(hopsGasUse)
      .add(tickGasUse)
      .add(uninitializedTickGasUse);

    const totalGasCostWei = gasPriceWei.mul(gasUse);

    const weth = tokenProvider.getToken(chainId, 'WETH');

    const gasCostInEth = CurrencyAmount.fromRawAmount(
      weth,
      totalGasCostWei.toString()
    );

    return { gasCostInEth, gasUse };
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
      log.error(
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
