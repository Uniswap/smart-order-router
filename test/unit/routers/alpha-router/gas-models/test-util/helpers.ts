import _ from 'lodash';
import {
    GasModelProviderConfig,
  LiquidityCalculationPools,
  V3PoolProvider,
  WRAPPED_NATIVE_CURRENCY,
} from '../../../../../../src';
import {
  getHighestLiquidityV3NativePool,
  getHighestLiquidityV3USDPool,
} from '../../../../../../src/util/gas-factory-helpers';
import { ChainId, Token } from '@uniswap/sdk-core';

export async function getPools(
    amountToken: Token,
    quoteToken: Token,
    v3PoolProvider: V3PoolProvider,
    providerConfig: GasModelProviderConfig,
    gasToken?: Token,
    chainId: ChainId = 1
  ): Promise<LiquidityCalculationPools> {
    const usdPoolPromise = getHighestLiquidityV3USDPool(
      chainId,
      v3PoolProvider,
      providerConfig
    );
    const nativeCurrency = WRAPPED_NATIVE_CURRENCY[chainId];
    const nativeQuoteTokenV3PoolPromise = !quoteToken.equals(nativeCurrency)
      ? getHighestLiquidityV3NativePool(
          quoteToken,
          v3PoolProvider,
          providerConfig
        )
      : Promise.resolve(null);
    const nativeAmountTokenV3PoolPromise = !amountToken.equals(nativeCurrency)
      ? getHighestLiquidityV3NativePool(
          amountToken,
          v3PoolProvider,
          providerConfig
        )
      : Promise.resolve(null);
    const nativeGasTokenV3PoolPromise = gasToken ? getHighestLiquidityV3NativePool(
        gasToken,
        v3PoolProvider,
        providerConfig
      ) : Promise.resolve(null);
    console.log(gasToken, await nativeGasTokenV3PoolPromise);

    const [usdPool, nativeQuoteTokenV3Pool, nativeAmountTokenV3Pool, nativeGasTokenV3Pool] =
      await Promise.all([
        usdPoolPromise,
        nativeQuoteTokenV3PoolPromise,
        nativeAmountTokenV3PoolPromise,
        nativeGasTokenV3PoolPromise
      ]);

    const pools: LiquidityCalculationPools = {
      usdPool: usdPool,
      nativeQuoteTokenV3Pool: nativeQuoteTokenV3Pool,
      nativeAmountTokenV3Pool: nativeAmountTokenV3Pool,
      nativeGasTokenV3Pool: nativeGasTokenV3Pool
    };
    return pools;
  }