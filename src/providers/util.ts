import { Token } from '@uniswap/sdk-core';
import { FeeAmount, Pool } from "@uniswap/v3-sdk";
import { BigNumber } from 'ethers';
import _ from "lodash";

import { usdGasTokensByChain } from "../routers";
import { ChainId, CurrencyAmount, log, WRAPPED_NATIVE_CURRENCY } from "../util";

import { IV3PoolProvider } from "./v3/pool-provider";

export async function GetHighestLiquidityNativePool(
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
  
export async function GetHighestLiquidityUSDPool(
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

export async function getGasCostsInUSDandQuote(tokenIn: Token, l1FeeInWei: BigNumber, poolProvider: IV3PoolProvider) {
    // wrap fee to native currency
    const nativeCurrency = WRAPPED_NATIVE_CURRENCY[tokenIn.chainId as ChainId];
    const costNativeCurrency = CurrencyAmount.fromRawAmount(
    nativeCurrency,
    l1FeeInWei.toString()
    );

    const usdPool: Pool = await GetHighestLiquidityUSDPool(
    tokenIn.chainId,
    poolProvider
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
  if (!tokenIn.equals(nativeCurrency)) {
    const nativePool: Pool | null =
      await GetHighestLiquidityNativePool(
        tokenIn.chainId,
        tokenIn,
        poolProvider
      );
    if (!nativePool) {
      log.info(
        'Could not find a pool to convert the cost into the quote token'
      );
      gasCostL1QuoteToken = CurrencyAmount.fromRawAmount(tokenIn, 0);
    } else {
      const nativeTokenPrice =
        nativePool.token0.address == nativeCurrency.address
          ? nativePool.token0Price
          : nativePool.token1Price;
      gasCostL1QuoteToken = nativeTokenPrice.quote(costNativeCurrency);
    }
  }
  return {gasCostL1QuoteToken, gasCostL1USD}
}