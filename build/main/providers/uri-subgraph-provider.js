"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.URISubgraphProvider = void 0;
const async_retry_1 = __importDefault(require("async-retry"));
const await_timeout_1 = __importDefault(require("await-timeout"));
const axios_1 = __importDefault(require("axios"));
const log_1 = require("../util/log");
/**
 * Gets subgraph pools from a URI. The URI shoudl contain a JSON
 * stringified array of V2SubgraphPool objects or V3SubgraphPool
 * objects.
 *
 * @export
 * @class URISubgraphProvider
 * @template TSubgraphPool
 */
class URISubgraphProvider {
    constructor(chainId, uri, timeout = 6000, retries = 2) {
        this.chainId = chainId;
        this.uri = uri;
        this.timeout = timeout;
        this.retries = retries;
    }
    async getPools() {
        log_1.log.info({ uri: this.uri }, `About to get subgraph pools from URI ${this.uri}`);
        let allPools = [];
        await (0, async_retry_1.default)(async () => {
            const timeout = new await_timeout_1.default();
            const timerPromise = timeout.set(this.timeout).then(() => {
                throw new Error(`Timed out getting pools from subgraph: ${this.timeout}`);
            });
            let response;
            /* eslint-disable no-useless-catch */
            try {
                response = await Promise.race([axios_1.default.get(this.uri), timerPromise]);
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
                log_1.log.error({ response }, `Unabled to get pools from ${this.uri}.`);
                throw new Error(`Unable to get pools from ${this.uri}`);
            }
            const pools = poolsBuffer;
            log_1.log.info({ uri: this.uri, chain: this.chainId }, `Got subgraph pools from uri. Num: ${pools.length}`);
            allPools = pools;
        }, {
            retries: this.retries,
            onRetry: (err, retry) => {
                log_1.log.info({ err }, `Failed to get pools from uri ${this.uri}. Retry attempt: ${retry}`);
            },
        });
        return allPools;
    }
}
exports.URISubgraphProvider = URISubgraphProvider;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidXJpLXN1YmdyYXBoLXByb3ZpZGVyLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiLi4vLi4vLi4vc3JjL3Byb3ZpZGVycy91cmktc3ViZ3JhcGgtcHJvdmlkZXIudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7Ozs7O0FBQ0EsOERBQWdDO0FBQ2hDLGtFQUFvQztBQUNwQyxrREFBMEI7QUFFMUIscUNBQWtDO0FBS2xDOzs7Ozs7OztHQVFHO0FBQ0gsTUFBYSxtQkFBbUI7SUFHOUIsWUFDVSxPQUFnQixFQUNoQixHQUFXLEVBQ1gsVUFBVSxJQUFJLEVBQ2QsVUFBVSxDQUFDO1FBSFgsWUFBTyxHQUFQLE9BQU8sQ0FBUztRQUNoQixRQUFHLEdBQUgsR0FBRyxDQUFRO1FBQ1gsWUFBTyxHQUFQLE9BQU8sQ0FBTztRQUNkLFlBQU8sR0FBUCxPQUFPLENBQUk7SUFDbEIsQ0FBQztJQUVHLEtBQUssQ0FBQyxRQUFRO1FBQ25CLFNBQUcsQ0FBQyxJQUFJLENBQ04sRUFBRSxHQUFHLEVBQUUsSUFBSSxDQUFDLEdBQUcsRUFBRSxFQUNqQix3Q0FBd0MsSUFBSSxDQUFDLEdBQUcsRUFBRSxDQUNuRCxDQUFDO1FBRUYsSUFBSSxRQUFRLEdBQW9CLEVBQUUsQ0FBQztRQUVuQyxNQUFNLElBQUEscUJBQUssRUFDVCxLQUFLLElBQUksRUFBRTtZQUNULE1BQU0sT0FBTyxHQUFHLElBQUksdUJBQU8sRUFBRSxDQUFDO1lBQzlCLE1BQU0sWUFBWSxHQUFHLE9BQU8sQ0FBQyxHQUFHLENBQUMsSUFBSSxDQUFDLE9BQU8sQ0FBQyxDQUFDLElBQUksQ0FBQyxHQUFHLEVBQUU7Z0JBQ3ZELE1BQU0sSUFBSSxLQUFLLENBQ2IsMENBQTBDLElBQUksQ0FBQyxPQUFPLEVBQUUsQ0FDekQsQ0FBQztZQUNKLENBQUMsQ0FBQyxDQUFDO1lBRUgsSUFBSSxRQUFRLENBQUM7WUFFYixxQ0FBcUM7WUFDckMsSUFBSTtnQkFDRixRQUFRLEdBQUcsTUFBTSxPQUFPLENBQUMsSUFBSSxDQUFDLENBQUMsZUFBSyxDQUFDLEdBQUcsQ0FBQyxJQUFJLENBQUMsR0FBRyxDQUFDLEVBQUUsWUFBWSxDQUFDLENBQUMsQ0FBQzthQUNwRTtZQUFDLE9BQU8sR0FBRyxFQUFFO2dCQUNaLE1BQU0sR0FBRyxDQUFDO2FBQ1g7b0JBQVM7Z0JBQ1IsT0FBTyxDQUFDLEtBQUssRUFBRSxDQUFDO2FBQ2pCO1lBQ0Qsb0NBQW9DO1lBRXBDLE1BQU0sRUFBRSxJQUFJLEVBQUUsV0FBVyxFQUFFLE1BQU0sRUFBRSxHQUFHLFFBQVEsQ0FBQztZQUUvQyxJQUFJLE1BQU0sSUFBSSxHQUFHLEVBQUU7Z0JBQ2pCLFNBQUcsQ0FBQyxLQUFLLENBQUMsRUFBRSxRQUFRLEVBQUUsRUFBRSw2QkFBNkIsSUFBSSxDQUFDLEdBQUcsR0FBRyxDQUFDLENBQUM7Z0JBRWxFLE1BQU0sSUFBSSxLQUFLLENBQUMsNEJBQTRCLElBQUksQ0FBQyxHQUFHLEVBQUUsQ0FBQyxDQUFDO2FBQ3pEO1lBRUQsTUFBTSxLQUFLLEdBQUcsV0FBOEIsQ0FBQztZQUU3QyxTQUFHLENBQUMsSUFBSSxDQUNOLEVBQUUsR0FBRyxFQUFFLElBQUksQ0FBQyxHQUFHLEVBQUUsS0FBSyxFQUFFLElBQUksQ0FBQyxPQUFPLEVBQUUsRUFDdEMscUNBQXFDLEtBQUssQ0FBQyxNQUFNLEVBQUUsQ0FDcEQsQ0FBQztZQUVGLFFBQVEsR0FBRyxLQUFLLENBQUM7UUFDbkIsQ0FBQyxFQUNEO1lBQ0UsT0FBTyxFQUFFLElBQUksQ0FBQyxPQUFPO1lBQ3JCLE9BQU8sRUFBRSxDQUFDLEdBQUcsRUFBRSxLQUFLLEVBQUUsRUFBRTtnQkFDdEIsU0FBRyxDQUFDLElBQUksQ0FDTixFQUFFLEdBQUcsRUFBRSxFQUNQLGdDQUFnQyxJQUFJLENBQUMsR0FBRyxvQkFBb0IsS0FBSyxFQUFFLENBQ3BFLENBQUM7WUFDSixDQUFDO1NBQ0YsQ0FDRixDQUFDO1FBRUYsT0FBTyxRQUFRLENBQUM7SUFDbEIsQ0FBQztDQUNGO0FBckVELGtEQXFFQyJ9