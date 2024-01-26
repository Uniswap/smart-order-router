import retry from 'async-retry';
import Timeout from 'await-timeout';
import axios from 'axios';
import { log } from '../util/log';
/**
 * Gets subgraph pools from a URI. The URI shoudl contain a JSON
 * stringified array of V2SubgraphPool objects or V3SubgraphPool
 * objects.
 *
 * @export
 * @class URISubgraphProvider
 * @template TSubgraphPool
 */
export class URISubgraphProvider {
    constructor(chainId, uri, timeout = 6000, retries = 2) {
        this.chainId = chainId;
        this.uri = uri;
        this.timeout = timeout;
        this.retries = retries;
    }
    async getPools() {
        log.info({ uri: this.uri }, `About to get subgraph pools from URI ${this.uri}`);
        let allPools = [];
        await retry(async () => {
            const timeout = new Timeout();
            const timerPromise = timeout.set(this.timeout).then(() => {
                throw new Error(`Timed out getting pools from subgraph: ${this.timeout}`);
            });
            let response;
            /* eslint-disable no-useless-catch */
            try {
                response = await Promise.race([axios.get(this.uri), timerPromise]);
            }
            catch (err) {
                throw err;
            }
            finally {
                timeout.clear();
            }
            /* eslint-enable no-useless-catch */
            const { data: poolsBuffer, status } = response;
            if (status != 200) {
                log.error({ response }, `Unabled to get pools from ${this.uri}.`);
                throw new Error(`Unable to get pools from ${this.uri}`);
            }
            const pools = poolsBuffer;
            log.info({ uri: this.uri, chain: this.chainId }, `Got subgraph pools from uri. Num: ${pools.length}`);
            allPools = pools;
        }, {
            retries: this.retries,
            onRetry: (err, retry) => {
                log.info({ err }, `Failed to get pools from uri ${this.uri}. Retry attempt: ${retry}`);
            },
        });
        return allPools;
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidXJpLXN1YmdyYXBoLXByb3ZpZGVyLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiLi4vLi4vLi4vc3JjL3Byb3ZpZGVycy91cmktc3ViZ3JhcGgtcHJvdmlkZXIudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQ0EsT0FBTyxLQUFLLE1BQU0sYUFBYSxDQUFDO0FBQ2hDLE9BQU8sT0FBTyxNQUFNLGVBQWUsQ0FBQztBQUNwQyxPQUFPLEtBQUssTUFBTSxPQUFPLENBQUM7QUFFMUIsT0FBTyxFQUFFLEdBQUcsRUFBRSxNQUFNLGFBQWEsQ0FBQztBQUtsQzs7Ozs7Ozs7R0FRRztBQUNILE1BQU0sT0FBTyxtQkFBbUI7SUFHOUIsWUFDVSxPQUFnQixFQUNoQixHQUFXLEVBQ1gsVUFBVSxJQUFJLEVBQ2QsVUFBVSxDQUFDO1FBSFgsWUFBTyxHQUFQLE9BQU8sQ0FBUztRQUNoQixRQUFHLEdBQUgsR0FBRyxDQUFRO1FBQ1gsWUFBTyxHQUFQLE9BQU8sQ0FBTztRQUNkLFlBQU8sR0FBUCxPQUFPLENBQUk7SUFDbEIsQ0FBQztJQUVHLEtBQUssQ0FBQyxRQUFRO1FBQ25CLEdBQUcsQ0FBQyxJQUFJLENBQ04sRUFBRSxHQUFHLEVBQUUsSUFBSSxDQUFDLEdBQUcsRUFBRSxFQUNqQix3Q0FBd0MsSUFBSSxDQUFDLEdBQUcsRUFBRSxDQUNuRCxDQUFDO1FBRUYsSUFBSSxRQUFRLEdBQW9CLEVBQUUsQ0FBQztRQUVuQyxNQUFNLEtBQUssQ0FDVCxLQUFLLElBQUksRUFBRTtZQUNULE1BQU0sT0FBTyxHQUFHLElBQUksT0FBTyxFQUFFLENBQUM7WUFDOUIsTUFBTSxZQUFZLEdBQUcsT0FBTyxDQUFDLEdBQUcsQ0FBQyxJQUFJLENBQUMsT0FBTyxDQUFDLENBQUMsSUFBSSxDQUFDLEdBQUcsRUFBRTtnQkFDdkQsTUFBTSxJQUFJLEtBQUssQ0FDYiwwQ0FBMEMsSUFBSSxDQUFDLE9BQU8sRUFBRSxDQUN6RCxDQUFDO1lBQ0osQ0FBQyxDQUFDLENBQUM7WUFFSCxJQUFJLFFBQVEsQ0FBQztZQUViLHFDQUFxQztZQUNyQyxJQUFJO2dCQUNGLFFBQVEsR0FBRyxNQUFNLE9BQU8sQ0FBQyxJQUFJLENBQUMsQ0FBQyxLQUFLLENBQUMsR0FBRyxDQUFDLElBQUksQ0FBQyxHQUFHLENBQUMsRUFBRSxZQUFZLENBQUMsQ0FBQyxDQUFDO2FBQ3BFO1lBQUMsT0FBTyxHQUFHLEVBQUU7Z0JBQ1osTUFBTSxHQUFHLENBQUM7YUFDWDtvQkFBUztnQkFDUixPQUFPLENBQUMsS0FBSyxFQUFFLENBQUM7YUFDakI7WUFDRCxvQ0FBb0M7WUFFcEMsTUFBTSxFQUFFLElBQUksRUFBRSxXQUFXLEVBQUUsTUFBTSxFQUFFLEdBQUcsUUFBUSxDQUFDO1lBRS9DLElBQUksTUFBTSxJQUFJLEdBQUcsRUFBRTtnQkFDakIsR0FBRyxDQUFDLEtBQUssQ0FBQyxFQUFFLFFBQVEsRUFBRSxFQUFFLDZCQUE2QixJQUFJLENBQUMsR0FBRyxHQUFHLENBQUMsQ0FBQztnQkFFbEUsTUFBTSxJQUFJLEtBQUssQ0FBQyw0QkFBNEIsSUFBSSxDQUFDLEdBQUcsRUFBRSxDQUFDLENBQUM7YUFDekQ7WUFFRCxNQUFNLEtBQUssR0FBRyxXQUE4QixDQUFDO1lBRTdDLEdBQUcsQ0FBQyxJQUFJLENBQ04sRUFBRSxHQUFHLEVBQUUsSUFBSSxDQUFDLEdBQUcsRUFBRSxLQUFLLEVBQUUsSUFBSSxDQUFDLE9BQU8sRUFBRSxFQUN0QyxxQ0FBcUMsS0FBSyxDQUFDLE1BQU0sRUFBRSxDQUNwRCxDQUFDO1lBRUYsUUFBUSxHQUFHLEtBQUssQ0FBQztRQUNuQixDQUFDLEVBQ0Q7WUFDRSxPQUFPLEVBQUUsSUFBSSxDQUFDLE9BQU87WUFDckIsT0FBTyxFQUFFLENBQUMsR0FBRyxFQUFFLEtBQUssRUFBRSxFQUFFO2dCQUN0QixHQUFHLENBQUMsSUFBSSxDQUNOLEVBQUUsR0FBRyxFQUFFLEVBQ1AsZ0NBQWdDLElBQUksQ0FBQyxHQUFHLG9CQUFvQixLQUFLLEVBQUUsQ0FDcEUsQ0FBQztZQUNKLENBQUM7U0FDRixDQUNGLENBQUM7UUFFRixPQUFPLFFBQVEsQ0FBQztJQUNsQixDQUFDO0NBQ0YifQ==