import { Protocol } from '@uniswap/router-sdk';
import { ChainId, Token } from '@uniswap/sdk-core';
import retry from 'async-retry';
import Timeout from 'await-timeout';
import { gql, GraphQLClient } from 'graphql-request';
import _ from 'lodash';

import { SubgraphPool } from '../routers/alpha-router/functions/get-candidate-pools';
import { log, metric } from '../util';

import { ProviderConfig } from './provider';
import { V3RawSubgraphPool, V3SubgraphPool } from './v3/subgraph-provider';
import { V4RawSubgraphPool, V4SubgraphPool } from './v4/subgraph-provider';

export interface ISubgraphProvider<TSubgraphPool extends SubgraphPool> {
  getPools(
    tokenIn?: Token,
    tokenOut?: Token,
    providerConfig?: ProviderConfig
  ): Promise<TSubgraphPool[]>;
}

const PAGE_SIZE = 1000; // 1k is max possible query size from subgraph.

export abstract class SubgraphProvider {
  private client: GraphQLClient;

  constructor(
    private protocol: Protocol,
    private chainId: ChainId,
    private retries = 2,
    private timeout = 30000,
    private rollback = true,
    private trackedEthThreshold = 0.01,
    private untrackedUsdThreshold = Number.MAX_VALUE,
    private subgraphUrl?: string
  ) {
    this.protocol = protocol;
    if (!this.subgraphUrl) {
      throw new Error(`No subgraph url for chain id: ${this.chainId}`);
    }
    this.client = new GraphQLClient(this.subgraphUrl);
  }

  public async getPools(
    _tokenIn?: Token,
    _tokenOut?: Token,
    providerConfig?: ProviderConfig
  ): Promise<(V3SubgraphPool | V4SubgraphPool)[]> {
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

    let pools: (V3RawSubgraphPool | V4RawSubgraphPool)[] = [];

    log.info(
      `Getting ${
        this.protocol
      } pools from the subgraph with page size ${PAGE_SIZE}${
        providerConfig?.blockNumber
          ? ` as of block ${providerConfig?.blockNumber}`
          : ''
      }.`
    );

    let retries = 0;

    await retry(
      async () => {
        const timeout = new Timeout();

        const getPools = async (): Promise<
          (V3RawSubgraphPool | V4RawSubgraphPool)[]
        > => {
          let lastId = '';
          let pools: (V3RawSubgraphPool | V4RawSubgraphPool)[] = [];
          let poolsPage: (V3RawSubgraphPool | V4RawSubgraphPool)[] = [];

          // metrics variables
          let totalPages = 0;

          do {
            totalPages += 1;

            const poolsResult = await this.client.request<{
              pools: (V3RawSubgraphPool | V4RawSubgraphPool)[];
            }>(query, {
              pageSize: PAGE_SIZE,
              id: lastId,
            });

            poolsPage = poolsResult.pools;

            pools = pools.concat(poolsPage);

            lastId = pools[pools.length - 1]!.id;
            metric.putMetric(
              `${this.protocol}SubgraphProvider.chain_${this.chainId}.getPools.paginate.pageSize`,
              poolsPage.length
            );
          } while (poolsPage.length > 0);

          metric.putMetric(
            `${this.protocol}SubgraphProvider.chain_${this.chainId}.getPools.paginate`,
            totalPages
          );
          metric.putMetric(
            `${this.protocol}SubgraphProvider.chain_${this.chainId}.getPools.pools.length`,
            pools.length
          );

          return pools;
        };

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
          log.error({ err }, `Error fetching ${this.protocol} Subgraph Pools.`);
          throw err;
        } finally {
          timeout.clear();
        }
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
            metric.putMetric(
              `${this.protocol}SubgraphProvider.chain_${this.chainId}.getPools.indexError`,
              1
            );
            blockNumber = blockNumber - 10;
            log.info(
              `Detected subgraph indexing error. Rolled back block number to: ${blockNumber}`
            );
          }
          metric.putMetric(
            `${this.protocol}SubgraphProvider.chain_${this.chainId}.getPools.timeout`,
            1
          );
          pools = [];
          log.info(
            { err },
            `Failed to get pools from subgraph. Retry attempt: ${retry}`
          );
        },
      }
    );

    metric.putMetric(
      `${this.protocol}SubgraphProvider.chain_${this.chainId}.getPools.retries`,
      retries
    );

    const untrackedPools = pools.filter(
      (pool) =>
        parseInt(pool.liquidity) > 0 ||
        parseFloat(pool.totalValueLockedETH) > this.trackedEthThreshold ||
        parseFloat(pool.totalValueLockedUSDUntracked) >
          this.untrackedUsdThreshold
    );
    metric.putMetric(
      `${this.protocol}SubgraphProvider.chain_${this.chainId}.getPools.untracked.length`,
      untrackedPools.length
    );
    metric.putMetric(
      `${this.protocol}SubgraphProvider.chain_${this.chainId}.getPools.untracked.percent`,
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

    metric.putMetric(
      `${this.protocol}SubgraphProvider.chain_${this.chainId}.getPools.filter.latency`,
      Date.now() - beforeFilter
    );
    metric.putMetric(
      `${this.protocol}SubgraphProvider.chain_${this.chainId}.getPools.filter.length`,
      poolsSanitized.length
    );
    metric.putMetric(
      `${this.protocol}SubgraphProvider.chain_${this.chainId}.getPools.filter.percent`,
      (poolsSanitized.length / pools.length) * 100
    );
    metric.putMetric(
      `${this.protocol}SubgraphProvider.chain_${this.chainId}.getPools`,
      1
    );
    metric.putMetric(
      `${this.protocol}SubgraphProvider.chain_${this.chainId}.getPools.latency`,
      Date.now() - beforeAll
    );

    log.info(
      `Got ${pools.length} ${this.protocol} pools from the subgraph. ${poolsSanitized.length} after filtering`
    );

    return poolsSanitized;
  }
}
