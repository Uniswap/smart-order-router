import { Token } from '@uniswap/sdk-core';
import { Pair } from '@uniswap/v2-sdk';
import { FeeAmount, Pool } from '@uniswap/v3-sdk';
import _ from 'lodash';

import { ChainId, log, WRAPPED_NATIVE_CURRENCY } from '.';
import { IV2PoolProvider } from '../providers';
import { IV3PoolProvider } from '../providers/v3/pool-provider';
import { usdGasTokensByChain } from '../routers';

export async function getHighestLiquidityV3NativePool(
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

export async function getHighestLiquidityV3USDPool(
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
      return _.map<Token, [Token, Token, FeeAmount]>(usdTokens, (usdToken) => [
        wrappedCurrency,
        usdToken,
        feeAmount,
      ]);
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
        const pool = poolAccessor.getPool(wrappedCurrency, usdToken, feeAmount);
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

export async function getEthV2Pool(
  chainId: ChainId,
  token: Token,
  poolProvider: IV2PoolProvider
): Promise<Pair | null> {
  const weth = WRAPPED_NATIVE_CURRENCY[chainId]!;

  const poolAccessor = await poolProvider.getPools([[weth, token]]);
  const pool = poolAccessor.getPool(weth, token);

  if (!pool || pool.reserve0.equalTo(0) || pool.reserve1.equalTo(0)) {
    log.error(
      {
        weth,
        token,
        reserve0: pool?.reserve0.toExact(),
        reserve1: pool?.reserve1.toExact(),
      },
      `Could not find a valid WETH pool with ${token.symbol} for computing gas costs.`
    );

    return null;
  }

  return pool;
}

export async function getHighestLiquidityUSDV2Pool(
  chainId: ChainId,
  poolProvider: IV2PoolProvider
): Promise<Pair> {
  const usdTokens = usdGasTokensByChain[chainId];

  if (!usdTokens) {
    throw new Error(
      `Could not find a USD token for computing gas costs on ${chainId}`
    );
  }

  const usdPools = _.map<Token, [Token, Token]>(usdTokens, (usdToken) => [
    usdToken,
    WRAPPED_NATIVE_CURRENCY[chainId]!,
  ]);
  const poolAccessor = await poolProvider.getPools(usdPools);
  const poolsRaw = poolAccessor.getAllPools();
  const pools = _.filter(
    poolsRaw,
    (pool) => pool.reserve0.greaterThan(0) && pool.reserve1.greaterThan(0)
  );

  if (pools.length == 0) {
    log.error(
      { pools },
      `Could not find a USD/WETH pool for computing gas costs.`
    );
    throw new Error(`Can't find USD/WETH pool for computing gas costs.`);
  }

  const maxPool = _.maxBy(pools, (pool) => {
    if (pool.token0.equals(WRAPPED_NATIVE_CURRENCY[chainId]!)) {
      return parseFloat(pool.reserve0.toSignificant(2));
    } else {
      return parseFloat(pool.reserve1.toSignificant(2));
    }
  }) as Pair;

  return maxPool;
}
