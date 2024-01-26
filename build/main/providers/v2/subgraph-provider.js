"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.V2SubgraphProvider = void 0;
const sdk_core_1 = require("@uniswap/sdk-core");
const async_retry_1 = __importDefault(require("async-retry"));
const await_timeout_1 = __importDefault(require("await-timeout"));
const graphql_request_1 = require("graphql-request");
const lodash_1 = __importDefault(require("lodash"));
const log_1 = require("../../util/log");
const SUBGRAPH_URL_BY_CHAIN = {
    [sdk_core_1.ChainId.MAINNET]: 'https://api.thegraph.com/subgraphs/name/ianlapham/uniswap-v2-dev',
    [sdk_core_1.ChainId.UNREAL]: 'https://api.goldsky.com/api/public/project_clrpcv6yrbv7901vg2s0p1rk7/subgraphs/pearlv2-univ2-subgraph/1.0.1/gn',
};
const threshold = 0.025;
const PAGE_SIZE = 1000; // 1k is max possible query size from subgraph.
class V2SubgraphProvider {
    constructor(chainId, retries = 2, timeout = 360000, rollback = true, pageSize = PAGE_SIZE) {
        this.chainId = chainId;
        this.retries = retries;
        this.timeout = timeout;
        this.rollback = rollback;
        this.pageSize = pageSize;
        const subgraphUrl = SUBGRAPH_URL_BY_CHAIN[this.chainId];
        if (!subgraphUrl) {
            throw new Error(`No subgraph url for chain id: ${this.chainId}`);
        }
        this.client = new graphql_request_1.GraphQLClient(subgraphUrl);
    }
    async getPools(_tokenIn, _tokenOut, providerConfig) {
        let blockNumber = (providerConfig === null || providerConfig === void 0 ? void 0 : providerConfig.blockNumber)
            ? await providerConfig.blockNumber
            : undefined;
        // Due to limitations with the Subgraph API this is the only way to parameterize the query.
        const query2 = (0, graphql_request_1.gql) `
        query getPools($pageSize: Int!, $id: String) {
            pairs(
                first: $pageSize
                ${blockNumber ? `block: { number: ${blockNumber} }` : ``}
                where: { id_gt: $id }
            ) {
                id
                token0 { id, symbol }
                token1 { id, symbol }
                totalSupply
                trackedReserveETH
                reserveUSD
            }
        }
    `;
        let pools = [];
        log_1.log.info(`Getting V2 pools from the subgraph with page size ${this.pageSize}${(providerConfig === null || providerConfig === void 0 ? void 0 : providerConfig.blockNumber)
            ? ` as of block ${providerConfig === null || providerConfig === void 0 ? void 0 : providerConfig.blockNumber}`
            : ''}.`);
        await (0, async_retry_1.default)(async () => {
            const timeout = new await_timeout_1.default();
            const getPools = async () => {
                let lastId = '';
                let pairs = [];
                let pairsPage = [];
                do {
                    await (0, async_retry_1.default)(async () => {
                        const poolsResult = await this.client.request(query2, {
                            pageSize: this.pageSize,
                            id: lastId,
                        });
                        pairsPage = poolsResult.pairs;
                        pairs = pairs.concat(pairsPage);
                        lastId = pairs[pairs.length - 1].id;
                    }, {
                        retries: this.retries,
                        onRetry: (err, retry) => {
                            pools = [];
                            log_1.log.info({ err }, `Failed request for page of pools from subgraph. Retry attempt: ${retry}`);
                        },
                    });
                } while (pairsPage.length > 0);
                return pairs;
            };
            /* eslint-disable no-useless-catch */
            try {
                const getPoolsPromise = getPools();
                const timerPromise = timeout.set(this.timeout).then(() => {
                    throw new Error(`Timed out getting pools from subgraph: ${this.timeout}`);
                });
                pools = await Promise.race([getPoolsPromise, timerPromise]);
                return;
            }
            catch (err) {
                throw err;
            }
            finally {
                timeout.clear();
            }
            /* eslint-enable no-useless-catch */
        }, {
            retries: this.retries,
            onRetry: (err, retry) => {
                if (this.rollback &&
                    blockNumber &&
                    lodash_1.default.includes(err.message, 'indexed up to')) {
                    blockNumber = blockNumber - 10;
                    log_1.log.info(`Detected subgraph indexing error. Rolled back block number to: ${blockNumber}`);
                }
                pools = [];
                log_1.log.info({ err }, `Failed to get pools from subgraph. Retry attempt: ${retry}`);
            },
        });
        // Filter pools that have tracked reserve ETH less than threshold.
        // trackedReserveETH filters pools that do not involve a pool from this allowlist:
        // https://github.com/Uniswap/v2-subgraph/blob/7c82235cad7aee4cfce8ea82f0030af3d224833e/src/mappings/pricing.ts#L43
        // Which helps filter pools with manipulated prices/liquidity.
        // TODO: Remove. Temporary fix to ensure tokens without trackedReserveETH are in the list.
        const FEI = '0x956f47f50a910163d8bf957cf5846d573e7f87ca';
        const poolsSanitized = pools
            .filter((pool) => {
            return (pool.token0.id == FEI ||
                pool.token1.id == FEI ||
                parseFloat(pool.trackedReserveETH) > threshold);
        })
            .map((pool) => {
            return Object.assign(Object.assign({}, pool), { id: pool.id.toLowerCase(), token0: {
                    id: pool.token0.id.toLowerCase(),
                }, token1: {
                    id: pool.token1.id.toLowerCase(),
                }, supply: parseFloat(pool.totalSupply), reserve: parseFloat(pool.trackedReserveETH), reserveUSD: parseFloat(pool.reserveUSD) });
        });
        log_1.log.info(`Got ${pools.length} V2 pools from the subgraph. ${poolsSanitized.length} after filtering`);
        return poolsSanitized;
    }
}
exports.V2SubgraphProvider = V2SubgraphProvider;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoic3ViZ3JhcGgtcHJvdmlkZXIuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi8uLi8uLi8uLi9zcmMvcHJvdmlkZXJzL3YyL3N1YmdyYXBoLXByb3ZpZGVyLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7Ozs7OztBQUFBLGdEQUFtRDtBQUNuRCw4REFBZ0M7QUFDaEMsa0VBQW9DO0FBQ3BDLHFEQUFxRDtBQUNyRCxvREFBdUI7QUFFdkIsd0NBQXFDO0FBK0JyQyxNQUFNLHFCQUFxQixHQUFzQztJQUMvRCxDQUFDLGtCQUFPLENBQUMsT0FBTyxDQUFDLEVBQ2Ysa0VBQWtFO0lBQ3BFLENBQUMsa0JBQU8sQ0FBQyxNQUFNLENBQUMsRUFDZCxnSEFBZ0g7Q0FDbkgsQ0FBQztBQUVGLE1BQU0sU0FBUyxHQUFHLEtBQUssQ0FBQztBQUV4QixNQUFNLFNBQVMsR0FBRyxJQUFJLENBQUMsQ0FBQywrQ0FBK0M7QUFnQnZFLE1BQWEsa0JBQWtCO0lBRzdCLFlBQ1UsT0FBZ0IsRUFDaEIsVUFBVSxDQUFDLEVBQ1gsVUFBVSxNQUFNLEVBQ2hCLFdBQVcsSUFBSSxFQUNmLFdBQVcsU0FBUztRQUpwQixZQUFPLEdBQVAsT0FBTyxDQUFTO1FBQ2hCLFlBQU8sR0FBUCxPQUFPLENBQUk7UUFDWCxZQUFPLEdBQVAsT0FBTyxDQUFTO1FBQ2hCLGFBQVEsR0FBUixRQUFRLENBQU87UUFDZixhQUFRLEdBQVIsUUFBUSxDQUFZO1FBRTVCLE1BQU0sV0FBVyxHQUFHLHFCQUFxQixDQUFDLElBQUksQ0FBQyxPQUFPLENBQUMsQ0FBQztRQUN4RCxJQUFJLENBQUMsV0FBVyxFQUFFO1lBQ2hCLE1BQU0sSUFBSSxLQUFLLENBQUMsaUNBQWlDLElBQUksQ0FBQyxPQUFPLEVBQUUsQ0FBQyxDQUFDO1NBQ2xFO1FBQ0QsSUFBSSxDQUFDLE1BQU0sR0FBRyxJQUFJLCtCQUFhLENBQUMsV0FBVyxDQUFDLENBQUM7SUFDL0MsQ0FBQztJQUVNLEtBQUssQ0FBQyxRQUFRLENBQ25CLFFB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