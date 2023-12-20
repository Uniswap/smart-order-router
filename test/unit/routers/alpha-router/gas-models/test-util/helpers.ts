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
    const nativeAndQuoteTokenV3PoolPromise = !quoteToken.equals(nativeCurrency)
      ? getHighestLiquidityV3NativePool(
          quoteToken,
          v3PoolProvider,
          providerConfig
        )
      : Promise.resolve(null);
    const nativeAndAmountTokenV3PoolPromise = !amountToken.equals(nativeCurrency)
      ? getHighestLiquidityV3NativePool(
          amountToken,
          v3PoolProvider,
          providerConfig
        )
      : Promise.resolve(null);
    const nativeAndSpecifiedGasTokenV3PoolPromise = gasToken ? getHighestLiquidityV3NativePool(
        gasToken,
        v3PoolProvider,
        providerConfig
      ) : Promise.resolve(null);

    const [usdPool, nativeAndQuoteTokenV3Pool, nativeAndAmountTokenV3Pool, nativeAndSpecifiedGasTokenV3Pool] =
      await Promise.all([
        usdPoolPromise,
        nativeAndQuoteTokenV3PoolPromise,
        nativeAndAmountTokenV3PoolPromise,
        nativeAndSpecifiedGasTokenV3PoolPromise
      ]);

    const pools: LiquidityCalculationPools = {
      usdPool: usdPool,
      nativeAndQuoteTokenV3Pool: nativeAndQuoteTokenV3Pool,
      nativeAndAmountTokenV3Pool: nativeAndAmountTokenV3Pool,
      nativeAndSpecifiedGasTokenV3Pool: nativeAndSpecifiedGasTokenV3Pool
    };
    return pools;
  }