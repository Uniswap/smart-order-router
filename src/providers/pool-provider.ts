import { BigNumber } from '@ethersproject/bignumber';
import { ChainId, Currency } from '@uniswap/sdk-core';
import { Pool as V3Pool } from '@uniswap/v3-sdk';
import { Pool as V4Pool } from '@uniswap/v4-sdk';
import { Options as RetryOptions } from 'async-retry';
import _ from 'lodash';

import { log, poolToString } from '../util';

import { IMulticallProvider, Result } from './multicall-provider';
import { ProviderConfig } from './provider';

export type PoolConstruct<TCurrency extends Currency> = [
  TCurrency,
  TCurrency,
  ...Array<string | number>
];
export type Pool = V3Pool | V4Pool;

export type ISlot0 = {
  sqrtPriceX96: BigNumber;
  tick: number;
};

export type ILiquidity = { liquidity: BigNumber };

export abstract class PoolProvider<
  TCurrency extends Currency,
  TPoolConstruct extends PoolConstruct<TCurrency>,
  TISlot0 extends ISlot0,
  TILiquidity extends ILiquidity,
  TPoolAccessor
> {
  /**
   * Creates an instance of V4PoolProvider.
   * @param chainId The chain id to use.
   * @param multicall2Provider The multicall provider to use to get the pools.
   * @param retryOptions The retry options for each call to the multicall.
   */
  constructor(
    protected chainId: ChainId,
    protected multicall2Provider: IMulticallProvider,
    protected retryOptions: RetryOptions = {
      retries: 2,
      minTimeout: 50,
      maxTimeout: 500,
    }
  ) {}

  protected async getPoolsInternal(
    poolConstructs: TPoolConstruct[],
    providerConfig?: ProviderConfig
  ): Promise<TPoolAccessor> {
    const poolIdentifierSet: Set<string> = new Set<string>();
    const sortedCurrencyPairs: Array<TPoolConstruct> = [];
    const sortedPoolIdentifiers: string[] = [];

    for (const poolConstruct of poolConstructs) {
      const {
        poolIdentifier: poolIdentifier,
        currency0,
        currency1,
      } = this.getPoolIdentifier(poolConstruct);

      if (poolIdentifierSet.has(poolIdentifier)) {
        continue;
      }

      // It's the easiest way to change the pool construct in place, since we don't know the entire pool construct at compiling time.
      poolConstruct[0] = currency0;
      poolConstruct[1] = currency1;
      poolIdentifierSet.add(poolIdentifier);
      sortedCurrencyPairs.push(poolConstruct);
      sortedPoolIdentifiers.push(poolIdentifier);
    }

    log.debug(
      `getPools called with ${poolConstructs.length} token pairs. Deduped down to ${poolIdentifierSet.size}`
    );

    const [slot0Results, liquidityResults] = await Promise.all([
      this.getPoolsData<TISlot0>(
        sortedPoolIdentifiers,
        this.getSlot0FunctionName(),
        providerConfig
      ),
      this.getPoolsData<[TILiquidity]>(
        sortedPoolIdentifiers,
        this.getLiquidityFunctionName(),
        providerConfig
      ),
    ]);

    log.info(
      `Got liquidity and slot0s for ${poolIdentifierSet.size} pools ${
        providerConfig?.blockNumber
          ? `as of block: ${providerConfig?.blockNumber}.`
          : ``
      }`
    );

    const poolIdentifierToPool: { [poolIdentifier: string]: Pool } = {};

    const invalidPools: TPoolConstruct[] = [];

    for (let i = 0; i < sortedPoolIdentifiers.length; i++) {
      const slot0Result = slot0Results[i];
      const liquidityResult = liquidityResults[i];

      // These properties tell us if a pool is valid and initialized or not.
      if (
        !slot0Result?.success ||
        !liquidityResult?.success ||
        slot0Result.result.sqrtPriceX96.eq(0)
      ) {
        invalidPools.push(sortedCurrencyPairs[i]!);

        continue;
      }

      const slot0 = slot0Result.result;
      const liquidity = liquidityResult.result[0];

      const pool = this.instantiatePool(
        sortedCurrencyPairs[i]!,
        slot0,
        liquidity
      );

      const poolIdentifier = sortedPoolIdentifiers[i]!;
      poolIdentifierToPool[poolIdentifier] = pool;
    }

    const poolStrs = _.map(Object.values(poolIdentifierToPool), poolToString);

    log.debug({ poolStrs }, `Found ${poolStrs.length} valid pools`);

    return this.instantiatePoolAccessor(poolIdentifierToPool);
  }

  protected abstract getLiquidityFunctionName(): string;

  protected abstract getSlot0FunctionName(): string;

  protected abstract getPoolsData<TReturn>(
    poolIdentifiers: string[],
    functionName: string,
    providerConfig?: ProviderConfig
  ): Promise<Result<TReturn>[]>;

  protected abstract getPoolIdentifier(pool: TPoolConstruct): {
    poolIdentifier: string;
    currency0: TCurrency;
    currency1: TCurrency;
  };

  protected abstract instantiatePool(
    pool: TPoolConstruct,
    slot0: TISlot0,
    liquidity: TILiquidity
  ): Pool;

  protected abstract instantiatePoolAccessor(poolIdentifierToPool: {
    [poolId: string]: Pool;
  }): TPoolAccessor;
}
