/**
 * Provider for getting V3 pools, with functionality for caching the results.
 *
 * @export
 * @class CachingV3SubgraphProvider
 */
export class CachingV3SubgraphProvider {
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY2FjaGluZy1zdWJncmFwaC1wcm92aWRlci5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbIi4uLy4uLy4uLy4uL3NyYy9wcm92aWRlcnMvdjMvY2FjaGluZy1zdWJncmFwaC1wcm92aWRlci50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFLQTs7Ozs7R0FLRztBQUNILE1BQU0sT0FBTyx5QkFBeUI7SUFHcEM7Ozs7O09BS0c7SUFDSCxZQUNVLE9BQWdCLEVBQ2QsZ0JBQXFDLEVBQ3ZDLEtBQStCO1FBRi9CLFlBQU8sR0FBUCxPQUFPLENBQVM7UUFDZCxxQkFBZ0IsR0FBaEIsZ0JBQWdCLENBQXFCO1FBQ3ZDLFVBQUssR0FBTCxLQUFLLENBQTBCO1FBWGpDLGlCQUFZLEdBQUcsQ0FBQyxPQUFnQixFQUFFLEVBQUUsQ0FBQyxrQkFBa0IsT0FBTyxFQUFFLENBQUM7SUFZdEUsQ0FBQztJQUVHLEtBQUssQ0FBQyxRQUFRO1FBQ25CLE1BQU0sV0FBVyxHQUFHLE1BQU0sSUFBSSxDQUFDLEtBQUssQ0FBQyxHQUFHLENBQUMsSUFBSSxDQUFDLFlBQVksQ0FBQyxJQUFJLENBQUMsT0FBTyxDQUFDLENBQUMsQ0FBQztRQUUxRSxJQUFJLFdBQVcsRUFBRTtZQUNmLE9BQU8sV0FBVyxDQUFDO1NBQ3BCO1FBRUQsTUFBTSxLQUFLLEdBQUcsTUFBTSxJQUFJLENBQUMsZ0JBQWdCLENBQUMsUUFBUSxFQUFFLENBQUM7UUFFckQsTUFBTSxJQUFJLENBQUMsS0FBSyxDQUFDLEdBQUcsQ0FBQyxJQUFJLENBQUMsWUFBWSxDQUFDLElBQUksQ0FBQyxPQUFPLENBQUMsRUFBRSxLQUFLLENBQUMsQ0FBQztRQUU3RCxPQUFPLEtBQUssQ0FBQztJQUNmLENBQUM7Q0FDRiJ9