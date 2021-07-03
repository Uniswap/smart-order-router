import { Token } from '@uniswap/sdk-core';
import { FeeAmount, Pool } from '@uniswap/v3-sdk';
import NodeCache from 'node-cache';
import { log } from '../util/log';
import { UniswapMulticallProvider } from './multicall-uniswap-provider';
import { PoolAccessor, PoolProvider } from './pool-provider';

const POOL_CACHE = new NodeCache({ stdTTL: 900, useClones: false });

export class CachingPoolProvider extends PoolProvider {
  constructor(protected multicall2Provider: UniswapMulticallProvider) {
    super(multicall2Provider);
  }

  public async getPools(
    tokenPairs: [Token, Token, FeeAmount][]
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

      const cachedPool = POOL_CACHE.get<Pool>(poolAddress);
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
      const poolAccessor = await super.getPools(poolsToGetTokenPairs);
      for (const address of poolsToGetAddresses) {
        const pool = poolAccessor.getPoolByAddress(address);
        if (pool) {
          poolAddressToPool[address] = pool;
          POOL_CACHE.set<Pool>(address, pool);
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
}
