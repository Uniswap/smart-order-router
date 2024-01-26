import { ChainId } from '@uniswap/sdk-core';
import retry from 'async-retry';
import Timeout from 'await-timeout';
import { gql, GraphQLClient } from 'graphql-request';
import _ from 'lodash';
import { log } from '../../util';
export const printV3SubgraphPool = (s) => `${s.token0.id}/${s.token1.id}/${s.feeTier}`;
export const printV2SubgraphPool = (s) => `${s.token0.id}/${s.token1.id}`;
const SUBGRAPH_URL_BY_CHAIN = {
    [ChainId.MAINNET]: 'https://api.thegraph.com/subgraphs/name/uniswap/uniswap-v3',
    [ChainId.OPTIMISM]: 'https://api.thegraph.com/subgraphs/name/ianlapham/optimism-post-regenesis',
    [ChainId.ARBITRUM_ONE]: 'https://api.thegraph.com/subgraphs/name/ianlapham/arbitrum-minimal',
    [ChainId.POLYGON]: 'https://api.thegraph.com/subgraphs/name/ianlapham/uniswap-v3-polygon',
    [ChainId.CELO]: 'https://api.thegraph.com/subgraphs/name/jesse-sawa/uniswap-celo',
    [ChainId.GOERLI]: 'https://api.thegraph.com/subgraphs/name/ianlapham/uniswap-v3-gorli',
    [ChainId.BNB]: 'https://api.thegraph.com/subgraphs/name/ilyamk/uniswap-v3---bnb-chain',
    [ChainId.AVALANCHE]: 'https://api.thegraph.com/subgraphs/name/lynnshaoyu/uniswap-v3-avax',
    [ChainId.BASE]: 'https://api.studio.thegraph.com/query/48211/uniswap-v3-base/version/latest',
    [ChainId.UNREAL]: 'https://api.goldsky.com/api/public/project_clrpcv6yrbv7901vg2s0p1rk7/subgraphs/pearlv2-univ3-subgraph/1.0.2/gn',
};
const PAGE_SIZE = 1000; // 1k is max possible query size from subgraph.
export class V3SubgraphProvider {
    constructor(chainId, retries = 2, timeout = 30000, rollback = true) {
        this.chainId = chainId;
        this.retries = retries;
        this.timeout = timeout;
        this.rollback = rollback;
        const subgraphUrl = SUBGRAPH_URL_BY_CHAIN[this.chainId];
        if (!subgraphUrl) {
            throw new Error(`No subgraph url for chain id: ${this.chainId}`);
        }
        this.client = new GraphQLClient(subgraphUrl);
    }
    async getPools(_tokenIn, _tokenOut, providerConfig) {
        let blockNumber = (providerConfig === null || providerConfig === void 0 ? void 0 : providerConfig.blockNumber)
            ? await providerConfig.blockNumber
            : undefined;
        const query = gql `
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
        log.info(`Getting V3 pools from the subgraph with page size ${PAGE_SIZE}${(providerConfig === null || providerConfig === void 0 ? void 0 : providerConfig.blockNumber)
            ? ` as of block ${providerConfig === null || providerConfig === void 0 ? void 0 : providerConfig.blockNumber}`
            : ''}.`);
        await retry(async () => {
            const timeout = new Timeout();
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
                    _.includes(err.message, 'indexed up to')) {
                    blockNumber = blockNumber - 10;
                    log.info(`Detected subgraph indexing error. Rolled back block number to: ${blockNumber}`);
                }
                pools = [];
                log.info({ err }, `Failed to get pools from subgraph. Retry attempt: ${retry}`);
            },
        });
        const poolsSanitized = pools
            .filter((pool) => parseInt(pool.liquidity) > 0 ||
            parseFloat(pool.totalValueLockedETH) > 0.01)
            .map((pool) => {
            const { totalValueLockedETH, totalValueLockedUSD, ...rest } = pool;
            return {
                ...rest,
                id: pool.id.toLowerCase(),
                token0: {
                    id: pool.token0.id.toLowerCase(),
                },
                token1: {
                    id: pool.token1.id.toLowerCase(),
                },
                tvlETH: parseFloat(totalValueLockedETH),
                tvlUSD: parseFloat(totalValueLockedUSD),
            };
        });
        log.info(`Got ${pools.length} V3 pools from the subgraph. ${poolsSanitized.length} after filtering`);
        return poolsSanitized;
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoic3ViZ3JhcGgtcHJvdmlkZXIuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi8uLi8uLi8uLi9zcmMvcHJvdmlkZXJzL3YzL3N1YmdyYXBoLXByb3ZpZGVyLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBLE9BQU8sRUFBRSxPQUFPLEVBQVMsTUFBTSxtQkFBbUIsQ0FBQztBQUNuRCxPQUFPLEtBQUssTUFBTSxhQUFhLENBQUM7QUFDaEMsT0FBTyxPQUFPLE1BQU0sZUFBZSxDQUFDO0FBQ3BDLE9BQU8sRUFBRSxHQUFHLEVBQUUsYUFBYSxFQUFFLE1BQU0saUJBQWlCLENBQUM7QUFDckQsT0FBTyxDQUFDLE1BQU0sUUFBUSxDQUFDO0FBRXZCLE9BQU8sRUFBRSxHQUFHLEVBQUUsTUFBTSxZQUFZLENBQUM7QUFrQ2pDLE1BQU0sQ0FBQyxNQUFNLG1CQUFtQixHQUFHLENBQUMsQ0FBaUIsRUFBRSxFQUFFLENBQ3ZELEdBQUcsQ0FBQyxDQUFDLE1BQU0sQ0FBQyxFQUFFLElBQUksQ0FBQyxDQUFDLE1BQU0sQ0FBQyxFQUFFLElBQUksQ0FBQyxDQUFDLE9BQU8sRUFBRSxDQUFDO0FBRS9DLE1BQU0sQ0FBQyxNQUFNLG1CQUFtQixHQUFHLENBQUMsQ0FBaUIsRUFBRSxFQUFFLENBQ3ZELEdBQUcsQ0FBQyxDQUFDLE1BQU0sQ0FBQyxFQUFFLElBQUksQ0FBQyxDQUFDLE1BQU0sQ0FBQyxFQUFFLEVBQUUsQ0FBQztBQUVsQyxNQUFNLHFCQUFxQixHQUFzQztJQUMvRCxDQUFDLE9BQU8sQ0FBQyxPQUFPLENBQUMsRUFDZiw0REFBNEQ7SUFDOUQsQ0FBQyxPQUFPLENBQUMsUUFBUSxDQUFDLEVBQ2hCLDJFQUEyRTtJQUM3RSxDQUFDLE9BQU8sQ0FBQyxZQUFZLENBQUMsRUFDcEIsb0VBQW9FO0lBQ3RFLENBQUMsT0FBTyxDQUFDLE9BQU8sQ0FBQyxFQUNmLHNFQUFzRTtJQUN4RSxDQUFDLE9BQU8sQ0FBQyxJQUFJLENBQUMsRUFDWixpRUFBaUU7SUFD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