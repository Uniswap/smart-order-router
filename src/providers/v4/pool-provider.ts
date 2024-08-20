import { ADDRESS_ZERO } from '@uniswap/router-sdk';
import { ChainId, Currency } from '@uniswap/sdk-core';
import { Pool } from '@uniswap/v4-sdk';
import retry, { Options as RetryOptions } from 'async-retry';
import { log, STATE_VIEW_ADDRESSES } from '../../util';
import { IMulticallProvider, Result } from '../multicall-provider';
import { ProviderConfig } from '../provider';

import { StateView__factory } from '../../types/other/factories/StateView__factory';
import { ILiquidity, ISlot0, PoolProvider } from '../pool-provider';

type V4ISlot0 = ISlot0 & {
  poolId: string;
  protocolFee: number;
  lpFee: number;
};

type V4ILiquidity = ILiquidity;

export interface IV4PoolProvider {
  getPools(
    currencyPairs: V4PoolConstruct[],
    providerConfig?: ProviderConfig
  ): Promise<V4PoolAccessor>;

  getPoolId(
    currencyA: Currency,
    currencyB: Currency,
    fee: number,
    tickSpacing: number,
    hooks: string
  ): { poolId: string; currency0: Currency; currency1: Currency };
}

export type V4PoolAccessor = {
  getPool: (
    currencyA: Currency,
    currencyB: Currency,
    fee: number,
    tickSpacing: number,
    hooks: string
  ) => Pool | undefined;
  getPoolById: (poolId: string) => Pool | undefined;
  getAllPools: () => Pool[];
};

export type V4PoolRetryOptions = RetryOptions;
export type V4PoolConstruct = [Currency, Currency, number, number, string];

// TODO: export sortsBefore from v4-sdk https://github.com/Uniswap/sdks/tree/main/sdks/v4-sdk/src/utils to avoid duplication
export function sortsBefore(currencyA: Currency, currencyB: Currency): boolean {
  if (currencyA.isNative) return true;
  if (currencyB.isNative) return false;
  return currencyA.wrapped.sortsBefore(currencyB.wrapped);
}

export class V4PoolProvider
  extends PoolProvider<
    Currency,
    V4PoolConstruct,
    V4ISlot0,
    V4ILiquidity,
    V4PoolAccessor
  >
  implements IV4PoolProvider
{
  // Computing pool id is slow as it requires hashing, encoding etc.
  // Addresses never change so can always be cached.
  private POOL_ID_CACHE: { [key: string]: string } = {};

  /**
   * Creates an instance of V4PoolProvider.
   * @param chainId The chain id to use.
   * @param multicall2Provider The multicall provider to use to get the pools.
   * @param retryOptions The retry options for each call to the multicall.
   */
  constructor(
    chainId: ChainId,
    multicall2Provider: IMulticallProvider,
    retryOptions: V4PoolRetryOptions = {
      retries: 2,
      minTimeout: 50,
      maxTimeout: 500,
    }
  ) {
    super(chainId, multicall2Provider, retryOptions);
  }

  public async getPools(
    currencyPairs: V4PoolConstruct[],
    providerConfig?: ProviderConfig
  ): Promise<V4PoolAccessor> {
    return await super.getPoolsInternal(currencyPairs, providerConfig);
  }

  public getPoolId(
    currencyA: Currency,
    currencyB: Currency,
    fee: number,
    tickSpacing: number,
    hooks: string
  ): { poolId: string; currency0: Currency; currency1: Currency } {
    const { poolIdentifier, currency0, currency1 } = this.getPoolIdentifier([
      currencyA,
      currencyB,
      fee,
      tickSpacing,
      hooks,
    ]);
    return { poolId: poolIdentifier, currency0, currency1 };
  }

  protected override getLiquidityFunctionName(): string {
    return 'getLiquidity';
  }

  protected override getSlot0FunctionName(): string {
    return 'getSlot0';
  }

  protected override async getPoolsData<TReturn>(
    poolIds: string[],
    functionName: string,
    providerConfig?: ProviderConfig
  ): Promise<Result<TReturn>[]> {
    const { results, blockNumber } = await retry(async () => {
      // NOTE: V4 pools are a singleton living under PoolsManager.
      // We have to retrieve the pool data from the state view contract.
      // To begin with, we will be consistent with how v4 subgraph retrieves the pool state - via state view.
      return this.multicall2Provider.callSameFunctionOnContractWithMultipleParams<
        string[],
        TReturn
      >({
        address: STATE_VIEW_ADDRESSES[this.chainId]!,
        contractInterface: StateView__factory.createInterface(),
        functionName: functionName,
        functionParams: poolIds.map((poolId) => [poolId]),
        providerConfig,
      });
    }, this.retryOptions);

    log.debug(`Pool data fetched as of block ${blockNumber}`);

    return results;
  }

  protected override getPoolIdentifier(pool: V4PoolConstruct): {
    poolIdentifier: string;
    currency0: Currency;
    currency1: Currency;
  } {
    const [currencyA, currencyB, fee, tickSpacing, hooks] = pool;

    const [currency0, currency1] = sortsBefore(currencyA, currencyB)
      ? [currencyA, currencyB]
      : [currencyB, currencyA];
    const currency0Addr = currency0.isNative
      ? ADDRESS_ZERO
      : currency0.wrapped.address;
    const currency1Addr = currency1.isNative
      ? ADDRESS_ZERO
      : currency1.wrapped.address;

    const cacheKey = `${this.chainId}/${currency0Addr}/${currency1Addr}/${fee}/${tickSpacing}/${hooks}`;

    const cachedId = this.POOL_ID_CACHE[cacheKey];

    if (cachedId) {
      return { poolIdentifier: cachedId, currency0, currency1 };
    }

    const poolId = Pool.getPoolId(
      currency0,
      currency1,
      fee,
      tickSpacing,
      hooks
    );

    this.POOL_ID_CACHE[cacheKey] = poolId;

    return { poolIdentifier: poolId, currency0, currency1 };
  }

  protected instantiatePool(
    pool: V4PoolConstruct,
    slot0: V4ISlot0,
    liquidity: V4ILiquidity
  ): Pool {
    const [currency0, currency1, fee, tickSpacing, hooks] = pool;

    return new Pool(
      currency0,
      currency1,
      fee,
      tickSpacing,
      hooks,
      slot0.sqrtPriceX96.toString(),
      liquidity.toString(),
      slot0.tick
    );
  }

  protected instantiatePoolAccessor(poolIdentifierToPool: {
    [p: string]: Pool;
  }): V4PoolAccessor {
    return {
      getPool: (
        currencyA: Currency,
        currencyB: Currency,
        fee: number,
        tickSpacing: number,
        hooks: string
      ): Pool | undefined => {
        const { poolIdentifier } = this.getPoolIdentifier([
          currencyA,
          currencyB,
          fee,
          tickSpacing,
          hooks,
        ]);
        return poolIdentifierToPool[poolIdentifier];
      },
      getPoolById: (poolId: string): Pool | undefined =>
        poolIdentifierToPool[poolId],
      getAllPools: (): Pool[] => Object.values(poolIdentifierToPool),
    };
  }
}
