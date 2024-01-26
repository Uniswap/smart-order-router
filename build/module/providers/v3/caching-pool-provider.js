import _ from 'lodash';
import { metric, MetricLoggerUnit } from '../../util';
import { log } from '../../util/log';
/**
 * Provider for getting V3 pools, with functionality for caching the results.
 * Does not cache by block because we compute quotes using the on-chain quoter
 * so do not mind if the liquidity values are out of date.
 *
 * @export
 * @class CachingV3PoolProvider
 */
export class CachingV3PoolProvider {
    /**
     * Creates an instance of CachingV3PoolProvider.
     * @param chainId The chain id to use.
     * @param poolProvider The provider to use to get the pools when not in the cache.
     * @param cache Cache instance to hold cached pools.
     */
    constructor(chainId, poolProvider, cache) {
        this.chainId = chainId;
        this.poolProvider = poolProvider;
        this.cache = cache;
        this.POOL_KEY = (chainId, address, blockNumber) => blockNumber
            ? `pool-${chainId}-${address}-${blockNumber}`
            : `pool-${chainId}-${address}`;
    }
    async getPools(tokenPairs, providerConfig) {
        const poolAddressSet = new Set();
        const poolsToGetTokenPairs = [];
        const poolsToGetAddresses = [];
        const poolAddressToPool = {};
        const blockNumber = await (providerConfig === null || providerConfig === void 0 ? void 0 : providerConfig.blockNumber);
        for (const [tokenA, tokenB, feeAmount] of tokenPairs) {
            const { poolAddress, token0, token1 } = this.getPoolAddress(tokenA, tokenB, feeAmount);
            if (poolAddressSet.has(poolAddress)) {
                continue;
            }
            poolAddressSet.add(poolAddress);
            const cachedPool = await this.cache.get(this.POOL_KEY(this.chainId, poolAddress, blockNumber));
            if (cachedPool) {
                metric.putMetric('V3_INMEMORY_CACHING_POOL_HIT_IN_MEMORY', 1, MetricLoggerUnit.None);
                poolAddressToPool[poolAddress] = cachedPool;
                continue;
            }
            metric.putMetric('V3_INMEMORY_CACHING_POOL_MISS_NOT_IN_MEMORY', 1, MetricLoggerUnit.None);
            poolsToGetTokenPairs.push([token0, token1, feeAmount]);
            poolsToGetAddresses.push(poolAddress);
        }
        log.info({
            poolsFound: _.map(Object.values(poolAddressToPool), (p) => `${p.token0.symbol} ${p.token1.symbol} ${p.fee}`),
            poolsToGetTokenPairs: _.map(poolsToGetTokenPairs, (t) => `${t[0].symbol} ${t[1].symbol} ${t[2]}`),
        }, `Found ${Object.keys(poolAddressToPool).length} V3 pools already in local cache. About to get liquidity and slot0s for ${poolsToGetTokenPairs.length} pools.`);
        if (poolsToGetAddresses.length > 0) {
            const poolAccessor = await this.poolProvider.getPools(poolsToGetTokenPairs, providerConfig);
            for (const address of poolsToGetAddresses) {
                const pool = poolAccessor.getPoolByAddress(address);
                if (pool) {
                    poolAddressToPool[address] = pool;
                    // We don't want to wait for this caching to complete before returning the pools.
                    this.cache.set(this.POOL_KEY(this.chainId, address, blockNumber), pool);
                }
            }
        }
        return {
            getPool: (tokenA, tokenB, feeAmount) => {
                const { poolAddress } = this.getPoolAddress(tokenA, tokenB, feeAmount);
                return poolAddressToPool[poolAddress];
            },
            getPoolByAddress: (address) => poolAddressToPool[address],
            getAllPools: () => Object.values(poolAddressToPool),
        };
    }
    getPoolAddress(tokenA, tokenB, feeAmount) {
        return this.poolProvider.getPoolAddress(tokenA, tokenB, feeAmount);
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY2FjaGluZy1wb29sLXByb3ZpZGVyLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiLi4vLi4vLi4vLi4vc3JjL3Byb3ZpZGVycy92My9jYWNoaW5nLXBvb2wtcHJvdmlkZXIudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBRUEsT0FBTyxDQUFDLE1BQU0sUUFBUSxDQUFDO0FBRXZCLE9BQU8sRUFBRSxNQUFNLEVBQUUsZ0JBQWdCLEVBQUUsTUFBTSxZQUFZLENBQUM7QUFDdEQsT0FBTyxFQUFFLEdBQUcsRUFBRSxNQUFNLGdCQUFnQixDQUFDO0FBTXJDOzs7Ozs7O0dBT0c7QUFDSCxNQUFNLE9BQU8scUJBQXFCO0lBVWhDOzs7OztPQUtHO0lBQ0gsWUFDWSxPQUFnQixFQUNoQixZQUE2QixFQUMvQixLQUFtQjtRQUZqQixZQUFPLEdBQVAsT0FBTyxDQUFTO1FBQ2hCLGlCQUFZLEdBQVosWUFBWSxDQUFpQjtRQUMvQixVQUFLLEdBQUwsS0FBSyxDQUFjO1FBbEJyQixhQUFRLEdBQUcsQ0FDakIsT0FBZ0IsRUFDaEIsT0FBZSxFQUNmLFdBQW9CLEVBQ3BCLEVBQUUsQ0FDRixXQUFXO1lBQ1QsQ0FBQyxDQUFDLFFBQVEsT0FBTyxJQUFJLE9BQU8sSUFBSSxXQUFXLEVBQUU7WUFDN0MsQ0FBQyxDQUFDLFFBQVEsT0FBTyxJQUFJLE9BQU8sRUFBRSxDQUFDO0lBWWhDLENBQUM7SUFFRyxLQUFLLENBQUMsUUFBUSxDQUNuQixVQUF1QyxFQUN2QyxjQUErQjtRQUUvQixNQUFNLGNBQWMsR0FBZ0IsSUFBSSxHQUFHLEVBQVUsQ0FBQztRQUN0RCxNQUFNLG9CQUFvQixHQUFxQyxFQUFFLENBQUM7UUFDbEUsTUFBTSxtQkFBbUIsR0FBYSxFQUFFLENBQUM7UUFDekMsTUFBTSxpQkFBaUIsR0FBb0MsRUFBRSxDQUFDO1FBQzlELE1BQU0sV0FBVyxHQUFHLE1BQU0sQ0FBQSxjQUFjLGFBQWQsY0FBYyx1QkFBZCxjQUFjLENBQUUsV0FBVyxDQUFBLENBQUM7UUFF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