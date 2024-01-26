import { log } from '../../util';
/**
 * Provider for getting V3 subgraph pools that falls back to a different provider
 * in the event of failure.
 *
 * @export
 * @class V3SubgraphProviderWithFallBacks
 */
export class V3SubgraphProviderWithFallBacks {
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
                log.info(`Failed to get subgraph pools for V3 from fallback #${i}`);
            }
        }
        throw new Error('Failed to get subgraph pools from any providers');
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoic3ViZ3JhcGgtcHJvdmlkZXItd2l0aC1mYWxsYmFjay5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbIi4uLy4uLy4uLy4uL3NyYy9wcm92aWRlcnMvdjMvc3ViZ3JhcGgtcHJvdmlkZXItd2l0aC1mYWxsYmFjay50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFFQSxPQUFPLEVBQUUsR0FBRyxFQUFFLE1BQU0sWUFBWSxDQUFDO0FBS2pDOzs7Ozs7R0FNRztBQUNILE1BQU0sT0FBTywrQkFBK0I7SUFDMUMsWUFBb0IsU0FBZ0M7UUFBaEMsY0FBUyxHQUFULFNBQVMsQ0FBdUI7SUFBRyxDQUFDO0lBRWpELEtBQUssQ0FBQyxRQUFRLENBQ25CLE9BQWUsRUFDZixRQUFnQixFQUNoQixjQUErQjtRQUUvQixLQUFLLElBQUksQ0FBQyxHQUFHLENBQUMsRUFBRSxDQUFDLEdBQUcsSUFBSSxDQUFDLFNBQVMsQ0FBQyxNQUFNLEVBQUUsQ0FBQyxFQUFFLEVBQUU7WUFDOUMsTUFBTSxRQUFRLEdBQUcsSUFBSSxDQUFDLFNBQVMsQ0FBQyxDQUFDLENBQUUsQ0FBQztZQUNwQyxJQUFJO2dCQUNGLE1BQU0sS0FBSyxHQUFHLE1BQU0sUUFBUSxDQUFDLFFBQVEsQ0FDbkMsT0FBTyxFQUNQLFFBQVEsRUFDUixjQUFjLENBQ2YsQ0FBQztnQkFDRixPQUFPLEtBQUssQ0FBQzthQUNkO1lBQUMsT0FBTyxHQUFHLEVBQUU7Z0JBQ1osR0FBRyxDQUFDLElBQUksQ0FBQyxzREFBc0QsQ0FBQyxFQUFFLENBQUMsQ0FBQzthQUNyRTtTQUNGO1FBRUQsTUFBTSxJQUFJLEtBQUssQ0FBQyxpREFBaUQsQ0FBQyxDQUFDO0lBQ3JFLENBQUM7Q0FDRiJ9