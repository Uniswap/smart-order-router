"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CachingV3SubgraphProvider = void 0;
/**
 * Provider for getting V3 pools, with functionality for caching the results.
 *
 * @export
 * @class CachingV3SubgraphProvider
 */
class CachingV3SubgraphProvider {
    /**
     * Creates an instance of CachingV3SubgraphProvider.
     * @param chainId The chain id to use.
     * @param subgraphProvider The provider to use to get the subgraph pools when not in the cache.
     * @param cache Cache instance to hold cached pools.
     */
    constructor(chainId, subgraphProvider, cache) {
        this.chainId = chainId;
        this.subgraphProvider = subgraphProvider;
        this.cache = cache;
        this.SUBGRAPH_KEY = (chainId) => `subgraph-pools-${chainId}`;
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
exports.CachingV3SubgraphProvider = CachingV3SubgraphProvider;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY2FjaGluZy1zdWJncmFwaC1wcm92aWRlci5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbIi4uLy4uLy4uLy4uL3NyYy9wcm92aWRlcnMvdjMvY2FjaGluZy1zdWJncmFwaC1wcm92aWRlci50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiOzs7QUFLQTs7Ozs7R0FLRztBQUNILE1BQWEseUJBQXlCO0lBR3BDOzs7OztPQUtHO0lBQ0gsWUFDVSxPQUFnQixFQUNkLGdCQUFxQyxFQUN2QyxLQUErQjtRQUYvQixZQUFPLEdBQVAsT0FBTyxDQUFTO1FBQ2QscUJBQWdCLEdBQWhCLGdCQUFnQixDQUFxQjtRQUN2QyxVQUFLLEdBQUwsS0FBSyxDQUEwQjtRQVhqQyxpQkFBWSxHQUFHLENBQUMsT0FBZ0IsRUFBRSxFQUFFLENBQUMsa0JBQWtCLE9BQU8sRUFBRSxDQUFDO0lBWXRFLENBQUM7SUFFRyxLQUFLLENBQUMsUUFBUTtRQUNuQixNQUFNLFdBQVcsR0FBRyxNQUFNLElBQUksQ0FBQyxLQUFLLENBQUMsR0FBRyxDQUFDLElBQUksQ0FBQyxZQUFZLENBQUMsSUFBSSxDQUFDLE9BQU8sQ0FBQyxDQUFDLENBQUM7UUFFMUUsSUFBSSxXQUFXLEVBQUU7WUFDZixPQUFPLFdBQVcsQ0FBQztTQUNwQjtRQUVELE1BQU0sS0FBSyxHQUFHLE1BQU0sSUFBSSxDQUFDLGdCQUFnQixDQUFDLFFBQVEsRUFBRSxDQUFDO1FBRXJELE1BQU0sSUFBSSxDQUFDLEtBQUssQ0FBQyxHQUFHLENBQUMsSUFBSSxDQUFDLFlBQVksQ0FBQyxJQUFJLENBQUMsT0FBTyxDQUFDLEVBQUUsS0FBSyxDQUFDLENBQUM7UUFFN0QsT0FBTyxLQUFLLENBQUM7SUFDZixDQUFDO0NBQ0Y7QUE1QkQsOERBNEJDIn0=