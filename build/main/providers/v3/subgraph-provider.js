"use strict";
var __rest = (this && this.__rest) || function (s, e) {
    var t = {};
    for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p) && e.indexOf(p) < 0)
        t[p] = s[p];
    if (s != null && typeof Object.getOwnPropertySymbols === "function")
        for (var i = 0, p = Object.getOwnPropertySymbols(s); i < p.length; i++) {
            if (e.indexOf(p[i]) < 0 && Object.prototype.propertyIsEnumerable.call(s, p[i]))
                t[p[i]] = s[p[i]];
        }
    return t;
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.V3SubgraphProvider = exports.printV2SubgraphPool = exports.printV3SubgraphPool = void 0;
const sdk_core_1 = require("@uniswap/sdk-core");
const async_retry_1 = __importDefault(require("async-retry"));
const await_timeout_1 = __importDefault(require("await-timeout"));
const graphql_request_1 = require("graphql-request");
const lodash_1 = __importDefault(require("lodash"));
const util_1 = require("../../util");
const printV3SubgraphPool = (s) => `${s.token0.id}/${s.token1.id}/${s.feeTier}`;
exports.printV3SubgraphPool = printV3SubgraphPool;
const printV2SubgraphPool = (s) => `${s.token0.id}/${s.token1.id}`;
exports.printV2SubgraphPool = printV2SubgraphPool;
const SUBGRAPH_URL_BY_CHAIN = {
    [sdk_core_1.ChainId.MAINNET]: 'https://api.thegraph.com/subgraphs/name/uniswap/uniswap-v3',
    [sdk_core_1.ChainId.OPTIMISM]: 'https://api.thegraph.com/subgraphs/name/ianlapham/optimism-post-regenesis',
    [sdk_core_1.ChainId.ARBITRUM_ONE]: 'https://api.thegraph.com/subgraphs/name/ianlapham/arbitrum-minimal',
    [sdk_core_1.ChainId.POLYGON]: 'https://api.thegraph.com/subgraphs/name/ianlapham/uniswap-v3-polygon',
    [sdk_core_1.ChainId.CELO]: 'https://api.thegraph.com/subgraphs/name/jesse-sawa/uniswap-celo',
    [sdk_core_1.ChainId.GOERLI]: 'https://api.thegraph.com/subgraphs/name/ianlapham/uniswap-v3-gorli',
    [sdk_core_1.ChainId.BNB]: 'https://api.thegraph.com/subgraphs/name/ilyamk/uniswap-v3---bnb-chain',
    [sdk_core_1.ChainId.AVALANCHE]: 'https://api.thegraph.com/subgraphs/name/lynnshaoyu/uniswap-v3-avax',
    [sdk_core_1.ChainId.BASE]: 'https://api.studio.thegraph.com/query/48211/uniswap-v3-base/version/latest',
    [sdk_core_1.ChainId.UNREAL]: 'https://api.goldsky.com/api/public/project_clrpcv6yrbv7901vg2s0p1rk7/subgraphs/pearlv2-univ3-subgraph/1.0.2/gn',
};
const PAGE_SIZE = 1000; // 1k is max possible query size from subgraph.
class V3SubgraphProvider {
    constructor(chainId, retries = 2, timeout = 30000, rollback = true) {
        this.chainId = chainId;
        this.retries = retries;
        this.timeout = timeout;
        this.rollback = rollback;
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
        const query = (0, graphql_request_1.gql) `
      query getPools($pageSize: Int!, $id: String) {
        pools(
          first: $pageSize
          ${blockNumber ? `block: { number: ${blockNumber} }` : ``}
          where: { id_gt: $id }
        ) {
          id
          token0 {
            symbol
            id
          }
          token1 {
            symbol
            id
          }
          feeTier
          liquidity
          totalValueLockedUSD
          totalValueLockedETH
        }
      }
    `;
        let pools = [];
        util_1.log.info(`Getting V3 pools from the subgraph with page size ${PAGE_SIZE}${(providerConfig === null || providerConfig === void 0 ? void 0 : providerConfig.blockNumber)
            ? ` as of block ${providerConfig === null || providerConfig === void 0 ? void 0 : providerConfig.blockNumber}`
            : ''}.`);
        await (0, async_retry_1.default)(async () => {
            const timeout = new await_timeout_1.default();
            const getPools = async () => {
                let lastId = '';
                let pools = [];
                let poolsPage = [];
                do {
                    const poolsResult = await this.client.request(query, {
                        pageSize: PAGE_SIZE,
                        id: lastId,
                    });
                    poolsPage = poolsResult.pools;
                    pools = pools.concat(poolsPage);
                    lastId = pools[pools.length - 1].id;
                } while (poolsPage.length > 0);
                return pools;
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
                    util_1.log.info(`Detected subgraph indexing error. Rolled back block number to: ${blockNumber}`);
                }
                pools = [];
                util_1.log.info({ err }, `Failed to get pools from subgraph. Retry attempt: ${retry}`);
            },
        });
        const poolsSanitized = pools
            .filter((pool) => parseInt(pool.liquidity) > 0 ||
            parseFloat(pool.totalValueLockedETH) > 0.01)
            .map((pool) => {
            const { totalValueLockedETH, totalValueLockedUSD } = pool, rest = __rest(pool, ["totalValueLockedETH", "totalValueLockedUSD"]);
            return Object.assign(Object.assign({}, rest), { id: pool.id.toLowerCase(), token0: {
                    id: pool.token0.id.toLowerCase(),
                }, token1: {
                    id: pool.token1.id.toLowerCase(),
                }, tvlETH: parseFloat(totalValueLockedETH), tvlUSD: parseFloat(totalValueLockedUSD) });
        });
        util_1.log.info(`Got ${pools.length} V3 pools from the subgraph. ${poolsSanitized.length} after filtering`);
        return poolsSanitized;
    }
}
exports.V3SubgraphProvider = V3SubgraphProvider;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoic3ViZ3JhcGgtcHJvdmlkZXIuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi8uLi8uLi8uLi9zcmMvcHJvdmlkZXJzL3YzL3N1YmdyYXBoLXByb3ZpZGVyLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7Ozs7Ozs7Ozs7Ozs7Ozs7O0FBQUEsZ0RBQW1EO0FBQ25ELDhEQUFnQztBQUNoQyxrRUFBb0M7QUFDcEMscURBQXFEO0FBQ3JELG9EQUF1QjtBQUV2QixxQ0FBaUM7QUFrQzFCLE1BQU0sbUJBQW1CLEdBQUcsQ0FBQyxDQUFpQixFQUFFLEVBQUUsQ0FDdkQsR0FBRyxDQUFDLENBQUMsTUFBTSxDQUFDLEVBQUUsSUFBSSxDQUFDLENBQUMsTUFBTSxDQUFDLEVBQUUsSUFBSSxDQUFDLENBQUMsT0FBTyxFQUFFLENBQUM7QUFEbEMsUUFBQSxtQkFBbUIsdUJBQ2U7QUFFeEMsTUFBTSxtQkFBbUIsR0FBRyxDQUFDLENBQWlCLEVBQUUsRUFBRSxDQUN2RCxHQUFHLENBQUMsQ0FBQyxNQUFNLENBQUMsRUFBRSxJQUFJLENBQUMsQ0FBQyxNQUFNLENBQUMsRUFBRSxFQUFFLENBQUM7QUFEckIsUUFBQSxtQkFBbUIsdUJBQ0U7QUFFbEMsTUFBTSxxQkFBcUIsR0FBc0M7SUFDL0QsQ0FBQyxrQkFBTyxDQUFDLE9BQU8sQ0FBQyxFQUNmLDREQUE0RDtJQUM5RCxDQUFDLGtCQUFPLENBQUMsUUFBUSxDQUFDLEVBQ2hCLDJFQUEyRTtJQUM3RSxDQUFDLGtCQUFPLENBQUMsWUFBWSxDQUFDLEVBQ3BCLG9FQUFvRTtJQUN0RSxDQUFDLGtCQUFPLENBQUMsT0FBTyxDQUFDLEVBQ2Ysc0VBQXNFO0lBQ3hFLENBQUMsa0JBQU8sQ0FBQyxJQUFJLENBQUMsRUFDWixpRUFBaUU7SUFDbkUsQ0FBQyxrQkFBTyxDQUFDLE1BQU0sQ0FBQyxFQUNkLG9FQUFvRTtJQUN0RSxDQUFDLGtCQUFPLENBQUMsR0FBRyxDQUFDLEVBQ1gsdUVBQXVFO0lBQ3pFLENBQUMsa0JBQU8s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