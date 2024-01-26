"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.V3SubgraphProviderWithFallBacks = void 0;
const util_1 = require("../../util");
/**
 * Provider for getting V3 subgraph pools that falls back to a different provider
 * in the event of failure.
 *
 * @export
 * @class V3SubgraphProviderWithFallBacks
 */
class V3SubgraphProviderWithFallBacks {
    constructor(fallbacks) {
        this.fallbacks = fallbacks;
    }
    async getPools(tokenIn, tokenOut, providerConfig) {
        for (let i = 0; i < this.fallbacks.length; i++) {
            const provider = this.fallbacks[i];
            try {
                const pools = await provider.getPools(tokenIn, tokenOut, providerConfig);
                return pools;
            }
            catch (err) {
                util_1.log.info(`Failed to get subgraph pools for V3 from fallback #${i}`);
            }
        }
        throw new Error('Failed to get subgraph pools from any providers');
    }
}
exports.V3SubgraphProviderWithFallBacks = V3SubgraphProviderWithFallBacks;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoic3ViZ3JhcGgtcHJvdmlkZXItd2l0aC1mYWxsYmFjay5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbIi4uLy4uLy4uLy4uL3NyYy9wcm92aWRlcnMvdjMvc3ViZ3JhcGgtcHJvdmlkZXItd2l0aC1mYWxsYmFjay50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiOzs7QUFFQSxxQ0FBaUM7QUFLakM7Ozs7OztHQU1HO0FBQ0gsTUFBYSwrQkFBK0I7SUFDMUMsWUFBb0IsU0FBZ0M7UUFBaEMsY0FBUyxHQUFULFNBQVMsQ0FBdUI7SUFBRyxDQUFDO0lBRWpELEtBQUssQ0FBQyxRQUFRLENBQ25CLE9BQWUsRUFDZixRQUFnQixFQUNoQixjQUErQjtRQUUvQixLQUFLLElBQUksQ0FBQyxHQUFHLENBQUMsRUFBRSxDQUFDLEdBQUcsSUFBSSxDQUFDLFNBQVMsQ0FBQyxNQUFNLEVBQUUsQ0FBQyxFQUFFLEVBQUU7WUFDOUMsTUFBTSxRQUFRLEdBQUcsSUFBSSxDQUFDLFNBQVMsQ0FBQyxDQUFDLENBQUUsQ0FBQztZQUNwQyxJQUFJO2dCQUNGLE1BQU0sS0FBSyxHQUFHLE1BQU0sUUFBUSxDQUFDLFFBQVEsQ0FDbkMsT0FBTyxFQUNQLFFBQVEsRUFDUixjQUFjLENBQ2YsQ0FBQztnQkFDRixPQUFPLEtBQUssQ0FBQzthQUNkO1lBQUMsT0FBTyxHQUFHLEVBQUU7Z0JBQ1osVUFBRyxDQUFDLElBQUksQ0FBQyxzREFBc0QsQ0FBQyxFQUFFLENBQUMsQ0FBQzthQUNyRTtTQUNGO1FBRUQsTUFBTSxJQUFJLEtBQUssQ0FBQyxpREFBaUQsQ0FBQyxDQUFDO0lBQ3JFLENBQUM7Q0FDRjtBQXhCRCwwRUF3QkMifQ==