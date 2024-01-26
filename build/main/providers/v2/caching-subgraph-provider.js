"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CachingV2SubgraphProvider = void 0;
/**
 * Provider for getting V2 pools, with functionality for caching the results.
 *
 * @export
 * @class CachingV2SubgraphProvider
 */
class CachingV2SubgraphProvider {
    /**
     * Creates an instance of CachingV2SubgraphProvider.
     * @param chainId The chain id to use.
     * @param subgraphProvider The provider to use to get the subgraph pools when not in the cache.
     * @param cache Cache instance to hold cached pools.
     */
    constructor(chainId, subgraphProvider, cache) {
        this.chainId = chainId;
        this.subgraphProvider = subgraphProvider;
        this.cache = cache;
        this.SUBGRAPH_KEY = (chainId) => `subgraph-pools-v2-${chainId}`;
    }
    async getPools() {
        const cachedPools = await this.cache.get(this.SUBGRAPH_KEY(this.chainId));
        if (cachedPools) {
            return cachedPools;
        }
        const pools = await this.subgraphProvider.getPools();
        await this.cache.set(this.SUBGRAPH_KEY(this.chainId), pools);
        return pools;
    }
}
exports.CachingV2SubgraphProvider = CachingV2SubgraphProvider;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY2FjaGluZy1zdWJncmFwaC1wcm92aWRlci5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbIi4uLy4uLy4uLy4uL3NyYy9wcm92aWRlcnMvdjIvY2FjaGluZy1zdWJncmFwaC1wcm92aWRlci50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiOzs7QUFLQTs7Ozs7R0FLRztBQUNILE1BQWEseUJBQXlCO0lBR3BDOzs7OztPQUtHO0lBQ0gsWUFDVSxPQUFnQixFQUNkLGdCQUFxQyxFQUN2QyxLQUErQjtRQUYvQixZQUFPLEdBQVAsT0FBTyxDQUFTO1FBQ2QscUJBQWdCLEdBQWhCLGdCQUFnQixDQUFxQjtRQUN2QyxVQUFLLEdBQUwsS0FBSyxDQUEwQjtRQVhqQyxpQkFBWSxHQUFHLENBQUMsT0FBZ0IsRUFBRSxFQUFFLENBQUMscUJBQXFCLE9BQU8sRUFBRSxDQUFDO0lBWXpFLENBQUM7SUFFRyxLQUFLLENBQUMsUUFBUTtRQUNuQixNQUFNLFdBQVcsR0FBRyxNQUFNLElBQUksQ0FBQyxLQUFLLENBQUMsR0FBRyxDQUFDLElBQUksQ0FBQyxZQUFZLENBQUMsSUFBSSxDQUFDLE9BQU8sQ0FBQyxDQUFDLENBQUM7UUFFMUUsSUFBSSxXQUFXLEVBQUU7WUFDZixPQUFPLFdBQVcsQ0FBQztTQUNwQjtRQUVELE1BQU0sS0FBSyxHQUFHLE1BQU0sSUFBSSxDQUFDLGdCQUFnQixDQUFDLFFBQVEsRUFBRSxDQUFDO1FBRXJELE1BQU0sSUFBSSxDQUFDLEtBQUssQ0FBQyxHQUFHLENBQUMsSUFBSSxDQUFDLFlBQVksQ0FBQyxJQUFJLENBQUMsT0FBTyxDQUFDLEVBQUUsS0FBSyxDQUFDLENBQUM7UUFFN0QsT0FBTyxLQUFLLENBQUM7SUFDZixDQUFDO0NBQ0Y7QUE1QkQsOERBNEJDIn0=