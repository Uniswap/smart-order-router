"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.CachingV2PoolProvider = void 0;
const lodash_1 = __importDefault(require("lodash"));
const log_1 = require("../../util/log");
/**
 * Provider for getting V2 pools, with functionality for caching the results per block.
 *
 * @export
 * @class CachingV2PoolProvider
 */
class CachingV2PoolProvider {
    /**
     * Creates an instance of CachingV3PoolProvider.
     * @param chainId The chain id to use.
     * @param poolProvider The provider to use to get the pools when not in the cache.
     * @param cache Cache instance to hold cached pools.
     */
    constructor(chainId, poolProvider, 
    // Cache is block aware. For V2 pools we need to use the current blocks reserves values since
    // we compute quotes off-chain.
    // If no block is specified in the call to getPools we just return whatever is in the cache.
    cache) {
        this.chainId = chainId;
        this.poolProvider = poolProvider;
        this.cache = cache;
        this.POOL_KEY = (chainId, address) => `pool-${chainId}-${address}`;
    }
    async getPools(tokenPairs, providerConfig) {
        const poolAddressSet = new Set();
        const poolsToGetTokenPairs = [];
        const poolsToGetAddresses = [];
        const poolAddressToPool = {};
        const blockNumber = await (providerConfig === null || providerConfig === void 0 ? void 0 : providerConfig.blockNumber);
        for (const [tokenA, tokenB] of tokenPairs) {
            const { poolAddress, token0, token1 } = this.getPoolAddress(tokenA, tokenB);
            if (poolAddressSet.has(poolAddress)) {
                continue;
            }
            poolAddressSet.add(poolAddress);
            const cachedPool = await this.cache.get(this.POOL_KEY(this.chainId, poolAddress));
            if (cachedPool) {
                // If a block was specified by the caller, ensure that the result in our cache matches the
                // expected block number. If a block number is not specified, just return whatever is in the
                // cache.
                if (!blockNumber || (blockNumber && cachedPool.block == blockNumber)) {
                    poolAddressToPool[poolAddress] = cachedPool.pair;
                    continue;
                }
            }
            poolsToGetTokenPairs.push([token0, token1]);
            poolsToGetAddresses.push(poolAddress);
        }
        log_1.log.info({
            poolsFound: lodash_1.default.map(Object.values(poolAddressToPool), (p) => p.token0.symbol + ' ' + p.token1.symbol),
            poolsToGetTokenPairs: lodash_1.default.map(poolsToGetTokenPairs, (t) => t[0].symbol + ' ' + t[1].symbol),
        }, `Found ${Object.keys(poolAddressToPool).length} V2 pools already in local cache for block ${blockNumber}. About to get reserves for ${poolsToGetTokenPairs.length} pools.`);
        if (poolsToGetAddresses.length > 0) {
            const poolAccessor = await this.poolProvider.getPools(poolsToGetTokenPairs, Object.assign(Object.assign({}, providerConfig), { enableFeeOnTransferFeeFetching: true }));
            for (const address of poolsToGetAddresses) {
                const pool = poolAccessor.getPoolByAddress(address);
                if (pool) {
                    poolAddressToPool[address] = pool;
                    // We don't want to wait for this caching to complete before returning the pools.
                    this.cache.set(this.POOL_KEY(this.chainId, address), {
                        pair: pool,
                        block: blockNumber,
                    });
                }
            }
        }
        return {
            getPool: (tokenA, tokenB) => {
                const { poolAddress } = this.getPoolAddress(tokenA, tokenB);
                return poolAddressToPool[poolAddress];
            },
            getPoolByAddress: (address) => poolAddressToPool[address],
            getAllPools: () => Object.values(poolAddressToPool),
        };
    }
    getPoolAddress(tokenA, tokenB) {
        return this.poolProvider.getPoolAddress(tokenA, tokenB);
    }
}
exports.CachingV2PoolProvider = CachingV2PoolProvider;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY2FjaGluZy1wb29sLXByb3ZpZGVyLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiLi4vLi4vLi4vLi4vc3JjL3Byb3ZpZGVycy92Mi9jYWNoaW5nLXBvb2wtcHJvdmlkZXIudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7Ozs7O0FBRUEsb0RBQXVCO0FBRXZCLHdDQUFxQztBQU1yQzs7Ozs7R0FLRztBQUNILE1BQWEscUJBQXFCO0lBSWhDOzs7OztPQUtHO0lBQ0gsWUFDWSxPQUFnQixFQUNoQixZQUE2QjtJQUN2Qyw2RkFBNkY7SUFDN0YsK0JBQStCO0lBQy9CLDRGQUE0RjtJQUNwRixLQUE2QztRQUwzQyxZQUFPLEdBQVAsT0FBTyxDQUFTO1FBQ2hCLGlCQUFZLEdBQVosWUFBWSxDQUFpQjtRQUkvQixVQUFLLEdBQUwsS0FBSyxDQUF3QztRQWYvQyxhQUFRLEdBQUcsQ0FBQyxPQUFnQixFQUFFLE9BQWUsRUFBRSxFQUFFLENBQ3ZELFFBQVEsT0FBTyxJQUFJLE9BQU8sRUFBRSxDQUFDO0lBZTVCLENBQUM7SUFFRyxLQUFLLENBQUMsUUFBUSxDQUNuQixVQUE0QixFQUM1QixjQUErQjtRQUUvQixNQUFNLGNBQWMsR0FBZ0IsSUFBSSxHQUFHLEVBQVUsQ0FBQztRQUN0RCxNQUFNLG9CQUFvQixHQUEwQixFQUFFLENBQUM7UUFDdkQsTUFBTSxtQkFBbUIsR0FBYSxFQUFFLENBQUM7UUFDekMsTUFBTSxpQkFBaUIsR0FBb0MsRUFBRSxDQUFDO1FBRTlELE1BQU0sV0FBVyxHQUFHLE1BQU0sQ0FBQSxjQUFjLGFBQWQsY0FBYyx1QkFBZCxjQUFjLENBQUUsV0FBVyxDQUFBLENBQUM7UUFFdEQsS0FBSyxNQUFNLENBQUMsTUFBTSxFQUFFLE1BQU0sQ0FBQyxJQUFJLFVBQVUsRUFBRTtZQUN6QyxNQUFNLEVBQUUsV0FBVyxFQUFFLE1BQU0sRUFBRSxNQUFNLEVBQUUsR0FBRyxJQUFJLENBQUMsY0FBYyxDQUN6RCxNQUFNLEVBQ04sTUFBTSxDQUNQLENB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