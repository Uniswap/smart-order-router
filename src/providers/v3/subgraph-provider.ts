import { ChainId, Token } from '@nizaglobal/sdk-core';
import retry from 'async-retry';
import Timeout from 'await-timeout';
import { gql, GraphQLClient } from 'graphql-request';
import _ from 'lodash';

import { log, metric } from '../../util';
import { ProviderConfig } from '../provider';
import { V2SubgraphPool } from '../v2/subgraph-provider';

export interface V3SubgraphPool {
  id: string;
  feeTier: string;
  liquidity: string;
  token0: {
    id: string;
  };
  token1: {
    id: string;
  };
  tvlETH: number;
  tvlUSD: number;
}

type RawV3SubgraphPool = {
  id: string;
  feeTier: string;
  liquidity: string;
  token0: {
    symbol: string;
    id: string;
  };
  token1: {
    symbol: string;
    id: string;
  };
  totalValueLockedUSD: string;
  totalValueLockedETH: string;
  totalValueLockedUSDUntracked: string;
};

export const printV3SubgraphPool = (s: V3SubgraphPool) =>
  `${s.token0.id}/${s.token1.id}/${s.feeTier}`;

export const printV2SubgraphPool = (s: V2SubgraphPool) =>
  `${s.token0.id}/${s.token1.id}`;

const SUBGRAPH_URL_BY_CHAIN: { [chainId in ChainId]?: string } = {
  [ChainId.MAINNET]:
    'https://api.thegraph.com/subgraphs/name/uniswap/uniswap-v3',
  [ChainId.OPTIMISM]:
    'https://api.thegraph.com/subgraphs/name/ianlapham/optimism-post-regenesis',
  // todo: add once subgraph is live
  [ChainId.OPTIMISM_SEPOLIA]: '',
  [ChainId.ARBITRUM_ONE]:
    'https://api.thegraph.com/subgraphs/name/ianlapham/arbitrum-minimal',
  // todo: add once subgraph is live
  [ChainId.ARBITRUM_SEPOLIA]: '',
  [ChainId.POLYGON]:
    'https://api.thegraph.com/subgraphs/name/ianlapham/uniswap-v3-polygon',
  [ChainId.CELO]:
    'https://api.thegraph.com/subgraphs/name/jesse-sawa/uniswap-celo',
  [ChainId.GOERLI]:
    'https://api.thegraph.com/subgraphs/name/ianlapham/uniswap-v3-gorli',
  [ChainId.BNB]:
    'https://api.thegraph.com/subgraphs/name/ilyamk/uniswap-v3---bnb-chain',
  [ChainId.AVALANCHE]:
    'https://api.thegraph.com/subgraphs/name/lynnshaoyu/uniswap-v3-avax',
  [ChainId.BASE]:
    'https://api.studio.thegraph.com/query/48211/uniswap-v3-base/version/latest',
  [ChainId.BLAST]: 'https://gateway-arbitrum.network.thegraph.com/api/0ae45f0bf40ae2e73119b44ccd755967/subgraphs/id/2LHovKznvo8YmKC9ZprPjsYAZDCc4K5q4AYz8s3cnQn1',
};

const PAGE_SIZE = 1000; // 1k is max possible query size from subgraph.

/**
 * Provider for getting V3 pools from the Subgraph
 *
 * @export
 * @interface IV3SubgraphProvider
 */
export interface IV3SubgraphProvider {
  getPools(
    tokenIn?: Token,
    tokenOut?: Token,
    providerConfig?: ProviderConfig
  ): Promise<V3SubgraphPool[]>;
}

export class V3SubgraphProvider implements IV3SubgraphProvider {
  private client: GraphQLClient;

  constructor(
    private chainId: ChainId,
    private retries = 2,
    private timeout = 30000,
    private rollback = true,
    private trackedEthThreshold = 0.01,
    private untrackedUsdThreshold = Number.MAX_VALUE,
    private subgraphUrlOverride?: string
  ) {
    const subgraphUrl = this.subgraphUrlOverride ?? SUBGRAPH_URL_BY_CHAIN[this.chainId];
    if (!subgraphUrl) {
      throw new Error(`No subgraph url for chain id: ${this.chainId}`);
    }
    this.client = new GraphQLClient(subgraphUrl);
  }

  public async getPools(
    _tokenIn?: Token,
    _tokenOut?: Token,
    providerConfig?: ProviderConfig
  ): Promise<V3SubgraphPool[]> {
    const beforeAll = Date.now();
    let blockNumber = providerConfig?.blockNumber
      ? await providerConfig.blockNumber
      : undefined;

    const query = gql`
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
          totalValueLockedUSDUntracked
        }
      }
    `;

    let pools: RawV3SubgraphPool[] = [];

    log.info(
      `Getting V3 pools from the subgraph with page size ${PAGE_SIZE}${providerConfig?.blockNumber
        ? ` as of block ${providerConfig?.blockNumber}`
        : ''
      }.`
    );

    let retries = 0;

    await retry(
      async () => {
        const timeout = new Timeout();

        const getPools = async (): Promise<RawV3SubgraphPool[]> => {
          let lastId = '';
          let pools: RawV3SubgraphPool[] = [];
          let poolsPage: RawV3SubgraphPool[] = [];

          // metrics variables
          let totalPages = 0;

          do {
            totalPages += 1;

            const poolsResult = await this.client.request<{
              pools: RawV3SubgraphPool[];
            }>(query, {
              pageSize: PAGE_SIZE,
              id: lastId,
            });

            poolsPage = poolsResult.pools;

            pools = pools.concat(poolsPage);

            lastId = pools[pools.length - 1]!.id;
            metric.putMetric(`V3SubgraphProvider.chain_${this.chainId}.getPools.paginate.pageSize`, poolsPage.length);

          } while (poolsPage.length > 0);

          metric.putMetric(`V3SubgraphProvider.chain_${this.chainId}.getPools.paginate`, totalPages);
          metric.putMetric(`V3SubgraphProvider.chain_${this.chainId}.getPools.pools.length`, pools.length);

          return pools;
        };

        /* eslint-disable no-useless-catch */
        try {
          const getPoolsPromise = getPools();
          const timerPromise = timeout.set(this.timeout).then(() => {
            throw new Error(
              `Timed out getting pools from subgraph: ${this.timeout}`
            );
          });
          pools = await Promise.race([getPoolsPromise, timerPromise]);
          return;
        } catch (err) {
          throw err;
        } finally {
          timeout.clear();
        }
        /* eslint-enable no-useless-catch */
      },
      {
        retries: this.retries,
        onRetry: (err, retry) => {
          retries += 1;
          if (
            this.rollback &&
            blockNumber &&
            _.includes(err.message, 'indexed up to')
          ) {
            metric.putMetric(`V3SubgraphProvider.chain_${this.chainId}.getPools.indexError`, 1);
            blockNumber = blockNumber - 10;
            log.info(
              `Detected subgraph indexing error. Rolled back block number to: ${blockNumber}`
            );
          }
          metric.putMetric(`V3SubgraphProvider.chain_${this.chainId}.getPools.timeout`, 1);
          pools = [];
          log.info(
            { err },
            `Failed to get pools from subgraph. Retry attempt: ${retry}`
          );
        },
      }
    );

    metric.putMetric(`V3SubgraphProvider.chain_${this.chainId}.getPools.retries`, retries);

    const untrackedPools = pools.filter(pool =>
      parseInt(pool.liquidity) > 0 ||
      parseFloat(pool.totalValueLockedETH) > this.trackedEthThreshold ||
      parseFloat(pool.totalValueLockedUSDUntracked) > this.untrackedUsdThreshold
    );
    metric.putMetric(`V3SubgraphProvider.chain_${this.chainId}.getPools.untracked.length`, untrackedPools.length);
    metric.putMetric(
      `V3SubgraphProvider.chain_${this.chainId}.getPools.untracked.percent`,
      (untrackedPools.length / pools.length) * 100
    );

    const beforeFilter = Date.now();
    const poolsSanitized = pools
      .filter(
        (pool) =>
          parseInt(pool.liquidity) > 0 ||
          parseFloat(pool.totalValueLockedETH) > this.trackedEthThreshold
      )
      .map((pool) => {
        const { totalValueLockedETH, totalValueLockedUSD } = pool;

        return {
          id: pool.id.toLowerCase(),
          feeTier: pool.feeTier,
          token0: {
            id: pool.token0.id.toLowerCase(),
          },
          token1: {
            id: pool.token1.id.toLowerCase(),
          },
          liquidity: pool.liquidity,
          tvlETH: parseFloat(totalValueLockedETH),
          tvlUSD: parseFloat(totalValueLockedUSD),
        };
      });

    metric.putMetric(`V3SubgraphProvider.chain_${this.chainId}.getPools.filter.latency`, Date.now() - beforeFilter);
    metric.putMetric(`V3SubgraphProvider.chain_${this.chainId}.getPools.filter.length`, poolsSanitized.length);
    metric.putMetric(
      `V3SubgraphProvider.chain_${this.chainId}.getPools.filter.percent`,
      (poolsSanitized.length / pools.length) * 100
    );
    metric.putMetric(`V3SubgraphProvider.chain_${this.chainId}.getPools`, 1);
    metric.putMetric(`V3SubgraphProvider.chain_${this.chainId}.getPools.latency`, Date.now() - beforeAll);

    log.info(
      `Got ${pools.length} V3 pools from the subgraph. ${poolsSanitized.length} after filtering`
    );

    return poolsSanitized;
  }
}
