import { BigNumber } from '@ethersproject/bignumber';
import { Token } from '@uniswap/sdk-core';
import { FeeAmount, Pool } from '@uniswap/v3-sdk';
import _ from 'lodash';
import { PoolAccessor } from '../../../providers/pool-provider';
import { TokenListProvider } from '../../../providers/token-list-provider';
import { CurrencyAmount } from '../../../util/amounts';
import { log } from '../../../util/log';
import { RouteWithValidQuote } from '../entities/route-with-valid-quote';
import { GasModel, IGasModelFactory } from './gas-model';

// Constant cost for doing any swap regardless of pools.
const BASE_SWAP_COST = BigNumber.from(2000);

// Cost for crossing an initialized tick.
const COST_PER_INIT_TICK = BigNumber.from(31000);

// TODO: Cost for crossing an uninitialized tick.
const COST_PER_UNINIT_TICK = BigNumber.from(0);

// Constant per pool swap in the route.
const COST_PER_HOP = BigNumber.from(80000);

export class HeuristicGasModelFactory extends IGasModelFactory {
  constructor() {
    super();
  }

  protected _buildGasModel(
    chainId: number,
    gasPriceWei: BigNumber,
    tokenProvider: TokenListProvider,
    poolAccessor: PoolAccessor,
    token: Token
  ): GasModel {
    // If our quote token is WETH, we don't need to convert our gas use to be in terms
    // of the quote token in order to produce a gas adjusted amount.
    // We do return a gas use in USD however, so we still convert to usd.
    if (token.symbol === 'WETH' || token.symbol === 'WETH9') {
      const usdPool: Pool = this.getHighestLiquidityUSDPool(
        chainId,
        poolAccessor,
        tokenProvider
      );

      const estimateGasCost = (
        routeWithValidQuote: RouteWithValidQuote
      ): {
        gasEstimate: BigNumber;
        gasCostInToken: CurrencyAmount;
        gasCostInUSD: CurrencyAmount;
      } => {
        const { gasCostInEth, gasUse } = this.estimateGas(
          routeWithValidQuote,
          gasPriceWei,
          tokenProvider,
          chainId
        );

        const ethToken0 = usdPool.token0.symbol == 'WETH';

        const ethTokenPrice = ethToken0
          ? usdPool.token0Price
          : usdPool.token1Price;

        const gasCostInTermsOfUSD: CurrencyAmount = ethTokenPrice.quote(
          gasCostInEth
        ) as CurrencyAmount;

        return {
          gasEstimate: gasUse,
          gasCostInToken: gasCostInEth,
          gasCostInUSD: gasCostInTermsOfUSD,
        };
      };

      return {
        estimateGasCost,
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

    const usdPool: Pool = this.getHighestLiquidityUSDPool(
      chainId,
      poolAccessor,
      tokenProvider
    );

    const estimateGasCost = (
      routeWithValidQuote: RouteWithValidQuote
    ): {
      gasEstimate: BigNumber;
      gasCostInToken: CurrencyAmount;
      gasCostInUSD: CurrencyAmount;
    } => {
      const { gasCostInEth, gasUse } = this.estimateGas(
        routeWithValidQuote,
        gasPriceWei,
        tokenProvider,
        chainId
      );

      const ethToken0 =
        ethPool.token0.symbol == 'WETH' || ethPool.token0.symbol == 'WETH9';

      const ethTokenPrice = ethToken0
        ? ethPool.token0Price
        : ethPool.token1Price;

      let gasCostInTermsOfQuoteToken: CurrencyAmount;
      try {
        gasCostInTermsOfQuoteToken = ethTokenPrice.quote(
          gasCostInEth
        ) as CurrencyAmount;
      } catch (err) {
        log.info(
          {
            ethTokenPriceBase: ethTokenPrice.baseCurrency,
            ethTokenPriceQuote: ethTokenPrice.quoteCurrency,
            gasCostInEth: gasCostInEth.currency,
          },
          'Debug eth price token issue'
        );
        throw err;
      }

      const ethToken0USDPool =
        usdPool.token0.symbol == 'WETH' || usdPool.token0.symbol == 'WETH9';

      const ethTokenPriceUSDPool = ethToken0USDPool
        ? usdPool.token0Price
        : usdPool.token1Price;

      let gasCostInTermsOfUSD: CurrencyAmount;
      try {
        gasCostInTermsOfUSD = ethTokenPriceUSDPool.quote(
          gasCostInEth
        ) as CurrencyAmount;
      } catch (err) {
        log.info(
          {
            usdT1: usdPool.token0.symbol,
            usdT2: usdPool.token1.symbol,
            gasCostInEthToken: gasCostInEth.currency.symbol,
          },
          'Failed to compute USD gas price'
        );
        throw err;
      }

      return {
        gasEstimate: gasUse,
        gasCostInToken: gasCostInTermsOfQuoteToken,
        gasCostInUSD: gasCostInTermsOfUSD!,
      };
    };

    return {
      estimateGasCost,
    };
  }

  private estimateGas(
    routeWithValidQuote: RouteWithValidQuote,
    gasPriceWei: BigNumber,
    tokenListProvider: TokenListProvider,
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

    const weth =
      tokenListProvider.getTokenBySymbolIfExists(chainId, 'WETH') ??
      tokenListProvider.getTokenBySymbol(chainId, 'WETH9');

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
    tokenListProvider: TokenListProvider
  ): Pool {
    const weth =
      tokenListProvider.getTokenBySymbolIfExists(chainId, 'WETH') ??
      tokenListProvider.getTokenBySymbol(chainId, 'WETH9');

    const pools = _([FeeAmount.HIGH, FeeAmount.MEDIUM, FeeAmount.LOW])
      .map((feeAmount) => {
        return poolAccessor.getPool(weth, token, feeAmount);
      })
      .compact()
      .value();

    if (pools.length == 0) {
      log.error(
        `Could not find a WETH pool with ${token.symbol} for computing gas costs.`
      );
      throw new Error(
        `Can't find WETH/${token.symbol} pool for computing gas costs.`
      );
    }

    const maxPool = _.maxBy(pools, (pool) => pool.liquidity) as Pool;

    return maxPool;
  }

  private getHighestLiquidityUSDPool(
    chainId: number,
    poolAccessor: PoolAccessor,
    tokenListProvider: TokenListProvider
  ): Pool {
    const weth =
      tokenListProvider.getTokenBySymbolIfExists(chainId, 'WETH') ??
      tokenListProvider.getTokenBySymbol(chainId, 'WETH9');
    const dai = tokenListProvider.getTokenBySymbolIfExists(chainId, 'DAI');
    const usdc = tokenListProvider.getTokenBySymbolIfExists(chainId, 'USDC');
    const usdt = tokenListProvider.getTokenBySymbolIfExists(chainId, 'USDT');

    const usdTokens = _.compact([dai, usdc, usdt]);

    const pools = _([FeeAmount.HIGH, FeeAmount.MEDIUM, FeeAmount.LOW])
      .flatMap((feeAmount) => {
        const pools = [];

        for (const usdToken of usdTokens) {
          const pool = poolAccessor.getPool(weth, usdToken, feeAmount);
          if (pool) {
            pools.push(pool);
          }
        }

        return pools;
      })
      .compact()
      .value();

    if (pools.length == 0) {
      log.error(`Could not find a USD/WETH pool for computing gas costs.`);
      throw new Error(`Can't find USD/WETH pool for computing gas costs.`);
    }

    const maxPool = _.maxBy(pools, (pool) => pool.liquidity) as Pool;

    return maxPool;
  }
}
