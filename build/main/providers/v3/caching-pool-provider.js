"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.CachingV3PoolProvider = void 0;
const lodash_1 = __importDefault(require("lodash"));
const util_1 = require("../../util");
const log_1 = require("../../util/log");
/**
 * Provider for getting V3 pools, with functionality for caching the results.
 * Does not cache by block because we compute quotes using the on-chain quoter
 * so do not mind if the liquidity values are out of date.
 *
 * @export
 * @class CachingV3PoolProvider
 */
class CachingV3PoolProvider {
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
                util_1.metric.putMetric('V3_INMEMORY_CACHING_POOL_HIT_IN_MEMORY', 1, util_1.MetricLoggerUnit.None);
                poolAddressToPool[poolAddress] = cachedPool;
                continue;
            }
            util_1.metric.putMetric('V3_INMEMORY_CACHING_POOL_MISS_NOT_IN_MEMORY', 1, util_1.MetricLoggerUnit.None);
            poolsToGetTokenPairs.push([token0, token1, feeAmount]);
            poolsToGetAddresses.push(poolAddress);
        }
        log_1.log.info({
            poolsFound: lodash_1.default.map(Object.values(poolAddressToPool), (p) => `${p.token0.symbol} ${p.token1.symbol} ${p.fee}`),
            poolsToGetTokenPairs: lodash_1.default.map(poolsToGetTokenPairs, (t) => `${t[0].symbol} ${t[1].symbol} ${t[2]}`),
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
exports.CachingV3PoolProvider = CachingV3PoolProvider;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY2FjaGluZy1wb29sLXByb3ZpZGVyLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiLi4vLi4vLi4vLi4vc3JjL3Byb3ZpZGVycy92My9jYWNoaW5nLXBvb2wtcHJvdmlkZXIudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7Ozs7O0FBRUEsb0RBQXVCO0FBRXZCLHFDQUFzRDtBQUN0RCx3Q0FBcUM7QUFNckM7Ozs7Ozs7R0FPRztBQUNILE1BQWEscUJBQXFCO0lBVWhDOzs7OztPQUtHO0lBQ0gsWUFDWSxPQUFnQixFQUNoQixZQUE2QixFQUMvQixLQUFtQjtRQUZqQixZQUFPLEdBQVAsT0FBTyxDQUFTO1FBQ2hCLGlCQUFZLEdBQVosWUFBWSxDQUFpQjtRQUMvQixVQUFLLEdBQUwsS0FBSyxDQUFjO1FBbEJyQixhQUFRLEdBQUcsQ0FDakIsT0FBZ0IsRUFDaEIsT0FBZSxFQUNmLFdBQW9CLEVBQ3BCLEVBQUUsQ0FDRixXQUFXO1lBQ1QsQ0FBQyxDQUFDLFFBQVEsT0FBTyxJQUFJLE9BQU8sSUFBSSxXQUFXLEVBQUU7WUFDN0MsQ0FBQyxDQUFDLFFBQVEsT0FBTyxJQUFJLE9BQU8sRUFBRSxDQUFDO0lBWWhDLENBQUM7SUFFRyxLQUFLLENBQUMsUUFBUSxDQUNuQixVQUF1QyxFQUN2QyxjQUErQjtRQUUvQixNQUFNLGNBQWMsR0FBZ0IsSUFBSSxHQUFHLEVBQVUsQ0FBQztRQUN0RCxNQUFNLG9CQUFvQixHQUFxQyxFQUFFLENBQUM7UUFDbEUsTUFBTSxtQkFBbUIsR0FBYSxFQUFFLENBQUM7UUFDekMsTUFBTSxpQkFBaUIsR0FBb0MsRUFBRSxDQUFDO1FBQzlELE1BQU0sV0FBVyxHQUFHLE1BQU0sQ0FBQSxjQUFjLGFBQWQsY0FBYyx1QkFBZCxjQUFjLENBQUUsV0FBVyxDQUFBLENBQUM7UUFFdEQsS0FBSyxNQUFNLENBQUMsTUFBTSxFQUFFLE1BQU0sRUFBRSxTQUFTLENBQUMsSUFBSSxVQUFVLEVBQUU7WUFDcEQsTUFBTSxFQUFFLFdBQVcsRUFB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