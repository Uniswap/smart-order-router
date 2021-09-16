import { Token } from '@uniswap/sdk-core';
import { FeeAmount, Pool } from '@uniswap/v3-sdk';
import NodeCache from 'node-cache';
import { ChainId } from '../util/chains';
import { log } from '../util/log';
import { IPoolProvider, PoolAccessor } from './pool-provider';
import { ProviderConfig } from './provider';

const POOL_CACHE = new NodeCache({ stdTTL: 900, useClones: false });
const POOL_KEY = (chainId: ChainId, address: string) => `${chainId}-${address}`;

export class CachingPoolProvider implements IPoolProvider {
  constructor(protected chainId: ChainId, protected poolProvider: IPoolProvider) {}

  public async getPools(
    tokenPairs: [Token, Token, FeeAmount][], providerConfig: ProviderConfig
  ): Promise<PoolAccessor> {
    const poolAddressSet: Set<string> = new Set<string>();
    const poolsToGetTokenPairs: Array<[Token, Token, FeeAmount]> = [];
    const poolsToGetAddresses: string[] = [];
    const poolAddressToPool: { [poolAddress: string]: Pool } = {};

    for (let tokenPair of tokenPairs) {
      const [tokenA, tokenB, feeAmount] = tokenPair;

      const { poolAddress, token0, token1 } = this.getPoolAddress(
        tokenA,
        tokenB,
        feeAmount
      );

      if (poolAddressSet.has(poolAddress)) {
        continue;
      }

      poolAddressSet.add(poolAddress);

      const cachedPool = POOL_CACHE.get<Pool>(POOL_KEY(this.chainId, poolAddress));
      if (cachedPool) {
        poolAddressToPool[poolAddress] = cachedPool;
        continue;
      }

      poolsToGetTokenPairs.push([token0, token1, feeAmount]);
      poolsToGetAddresses.push(poolAddress);
    }

    log.info(
      `Found ${
        Object.keys(poolAddressToPool).length
      } pools already in local cache. About to get liquidity and slot0s for ${
        poolsToGetTokenPairs.length
      } pools.`
    );

    if (poolsToGetAddresses.length > 0) {
      const poolAccessor = await this.poolProvider.getPools(
        poolsToGetTokenPairs,
        providerConfig
      );
      for (const address of poolsToGetAddresses) {
        const pool = poolAccessor.getPoolByAddress(address);
        if (pool) {
          poolAddressToPool[address] = pool;
          POOL_CACHE.set<Pool>(POOL_KEY(this.chainId, address), pool);
        }
      }
    }

    return {
      getPool: (
        tokenA: Token,
        tokenB: Token,
        feeAmount: FeeAmount
      ): Pool | undefined => {
        const { poolAddress } = this.getPoolAddress(tokenA, tokenB, feeAmount);
        return poolAddressToPool[poolAddress];
      },
      getPoolByAddress: (address: string): Pool | undefined =>
        poolAddressToPool[address],
      getAllPools: (): Pool[] => Object.values(poolAddressToPool),
    };
  }
  
  public getPoolAddress(
    tokenA: Token,
    tokenB: Token,
    feeAmount: FeeAmount
  ): { poolAddress: string; token0: Token; token1: Token } {
    return this.poolProvider.getPoolAddress(tokenA, tokenB, feeAmount);
  }
}
