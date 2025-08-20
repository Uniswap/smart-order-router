import { Protocol } from '@uniswap/router-sdk';
import { ChainId, Currency, Token } from '@uniswap/sdk-core';
import retry from 'async-retry';
import Timeout from 'await-timeout';
import { gql, GraphQLClient } from 'graphql-request';
import _ from 'lodash';

import { SubgraphPool } from '../routers/alpha-router/functions/get-candidate-pools';
import { log, metric } from '../util';

import { ProviderConfig } from './provider';
import { V4RawSubgraphPool } from './v4/subgraph-provider';

export interface ISubgraphProvider<TSubgraphPool extends SubgraphPool> {
  getPools(
    tokenIn?: Token,
    tokenOut?: Token,
    providerConfig?: ProviderConfig
  ): Promise<TSubgraphPool[]>;
}

export const PAGE_SIZE = 1000; // 1k is max possible query size from subgraph.
export const BASE_V4_PAGE_SIZE = 3500; // TheGraph v4 base max pagesize is 3600.

export type V3V4SubgraphPool = {
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
};

export type V3V4RawSubgraphPool = {
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

export abstract class SubgraphProvider<
  TRawSubgraphPool extends V3V4RawSubgraphPool,
  TSubgraphPool extends V3V4SubgraphPool
> {
  private client: GraphQLClient;

  constructor(
    private protocol: Protocol,
    private chainId: ChainId,
    private retries = 2,
    private timeout = 30000,
    private rollback = true,
    private trackedEthThreshold = 0.01,
    private trackedZoraEthThreshold = 0.001,
    // @ts-expect-error - kept for backward compatibility
    private untrackedUsdThreshold = Number.MAX_VALUE,
    private subgraphUrl?: string,
    private bearerToken?: string
  ) {
    this.protocol = protocol;
    if (!this.subgraphUrl) {
      throw new Error(`No subgraph url for chain id: ${this.chainId}`);
    }
    if (this.bearerToken) {
      this.client = new GraphQLClient(this.subgraphUrl, {
        headers: {
          authorization: `Bearer ${this.bearerToken}`,
        },
      });
    } else {
      this.client = new GraphQLClient(this.subgraphUrl);
    }
  }

  public async getPools(
    _currencyIn?: Currency,
    _currencyOut?: Currency,
    providerConfig?: ProviderConfig
  ): Promise<TSubgraphPool[]> {
    const beforeAll = Date.now();
    let blockNumber = providerConfig?.blockNumber
      ? await providerConfig.blockNumber
      : undefined;

    const pageSizeToUse =
      this.protocol === Protocol.V4 && this.chainId == ChainId.BASE
        ? BASE_V4_PAGE_SIZE
        : PAGE_SIZE;

    log.info(
      `Getting ${
        this.protocol
      } pools from the subgraph with page size ${pageSizeToUse}${
        providerConfig?.blockNumber
          ? ` as of block ${providerConfig?.blockNumber}`
          : ''
      }.`
    );

    // Define separate queries for each filtering condition
    const queries = [
      // 1. Pools with high tracked ETH (for both V3 and V4)
      {
        name: 'High tracked ETH pools',
        query: gql`
          query getHighTrackedETHPools($pageSize: Int!, $id: String, $threshold: String!) {
            pools(
              first: $pageSize
              ${blockNumber ? `block: { number: ${blockNumber} }` : ``}
              where: {
                id_gt: $id,
                totalValueLockedETH_gt: $threshold
              }
            ) {
              ${this.getPoolFields()}
            }
          }
        `,
        variables: { threshold: this.trackedEthThreshold.toString() },
      },
      // 2. V4: Pools with liquidity > 0 (separate condition for V4)
      ...(this.protocol === Protocol.V4
        ? [
            {
              name: 'V4 high liquidity pools',
              query: gql`
          query getV4HighLiquidityPools($pageSize: Int!, $id: String) {
            pools(
              first: $pageSize
              ${blockNumber ? `block: { number: ${blockNumber} }` : ``}
              where: {
                id_gt: $id,
                liquidity_gt: "0"
              }
            ) {
              ${this.getPoolFields()}
            }
          }
        `,
              variables: {},
            },
          ]
        : []),
      // 3. V3: Pools with liquidity > 0 AND totalValueLockedETH = 0 (special V3 condition)
      ...(this.protocol === Protocol.V3
        ? [
            {
              name: 'V3 zero ETH pools',
              query: gql`
          query getV3ZeroETHPools($pageSize: Int!, $id: String) {
            pools(
              first: $pageSize
              ${blockNumber ? `block: { number: ${blockNumber} }` : ``}
              where: {
                id_gt: $id,
                liquidity_gt: "0",
                totalValueLockedETH: "0"
              }
            ) {
              ${this.getPoolFields()}
            }
          }
        `,
              variables: {},
            },
          ]
        : []),
    ];

    let allPools: TRawSubgraphPool[] = [];
    let retries = 0;

    await retry(
      async () => {
        const timeout = new Timeout();

        const fetchPoolsForQuery = async (
          queryConfig: any
        ): Promise<TRawSubgraphPool[]> => {
          let lastId = '';
          let pools: TRawSubgraphPool[] = [];
          let poolsPage: TRawSubgraphPool[] = [];
          let totalPages = 0;

          do {
            totalPages += 1;

            const start = Date.now();
            log.info(
              `Starting fetching for ${queryConfig.name} page ${totalPages} with page size ${pageSizeToUse}`
            );

            const poolsResult = await this.client.request<{
              pools: TRawSubgraphPool[];
            }>(queryConfig.query, {
              pageSize: pageSizeToUse,
              id: lastId,
              ...queryConfig.variables,
            });

            poolsPage = poolsResult.pools;

            pools = pools.concat(poolsPage);

            if (pools.length > 0) {
              lastId = pools[pools.length - 1]!.id;
            }

            metric.putMetric(
              `${this.protocol}SubgraphProvider.chain_${
                this.chainId
              }.getPools.${queryConfig.name
                .replace(/\s+/g, '_')
                .toLowerCase()}.paginate.pageSize`,
              poolsPage.length
            );
            log.info(
              `Fetched ${poolsPage.length} pools for ${queryConfig.name} in ${
                Date.now() - start
              }ms`
            );
          } while (poolsPage.length > 0);

          metric.putMetric(
            `${this.protocol}SubgraphProvider.chain_${
              this.chainId
            }.getPools.${queryConfig.name
              .replace(/\s+/g, '_')
              .toLowerCase()}.paginate`,
            totalPages
          );
          metric.putMetric(
            `${this.protocol}SubgraphProvider.chain_${
              this.chainId
            }.getPools.${queryConfig.name
              .replace(/\s+/g, '_')
              .toLowerCase()}.pools.length`,
            pools.length
          );

          return pools;
        };

        try {
          // Fetch pools for each query in parallel
          const poolPromises = queries.map((queryConfig) =>
            fetchPoolsForQuery(queryConfig)
          );
          const allPoolsArrays = await Promise.all(poolPromises);

          // Merge all results and deduplicate by pool ID
          const poolMap = new Map<string, TRawSubgraphPool>();
          allPoolsArrays.forEach((pools) => {
            pools.forEach((pool) => {
              poolMap.set(pool.id, pool);
            });
          });

          allPools = Array.from(poolMap.values());

          const getPoolsPromise = Promise.resolve(allPools);
          const timerPromise = timeout.set(this.timeout).then(() => {
            throw new Error(
              `Timed out getting pools from subgraph: ${this.timeout}`
            );
          });
          allPools = await Promise.race([getPoolsPromise, timerPromise]);
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
          allPools = [];
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

    const beforeFilter = Date.now();
    let poolsSanitized: TSubgraphPool[] = [];
    if (this.protocol === Protocol.V3) {
      // Special treatment for all V3 pools in order to reduce latency due to thousands of pools with very low TVL locked
      // - Include "parseFloat(pool.totalValueLockedETH) === 0" as in certain occasions we have no way of calculating derivedETH so this is 0
      poolsSanitized = allPools
        .filter(
          (pool) =>
            (parseInt(pool.liquidity) > 0 &&
              parseFloat(pool.totalValueLockedETH) === 0) ||
            parseFloat(pool.totalValueLockedETH) > this.trackedEthThreshold
        )
        .map((pool) => {
          return this.mapSubgraphPool(pool);
        });
    } else if (this.protocol === Protocol.V4) {
      poolsSanitized = allPools
        .filter(
          (pool) =>
            parseInt(pool.liquidity) > 0 ||
            parseFloat(pool.totalValueLockedETH) > this.trackedEthThreshold ||
            (((pool as unknown as V4RawSubgraphPool).hooks ===
              '0xd61a675f8a0c67a73dc3b54fb7318b4d91409040' || // Zora Creator Hook on Base
              (pool as unknown as V4RawSubgraphPool).hooks ===
                '0x9ea932730a7787000042e34390b8e435dd839040') && // Zora Post Hook on Base
              parseFloat(pool.totalValueLockedETH) >
                this.trackedZoraEthThreshold)
        )
        .map((pool) => {
          return this.mapSubgraphPool(pool);
        });
    }

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
      (poolsSanitized.length / allPools.length) * 100
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
      `Got ${allPools.length} ${this.protocol} pools from the subgraph (after deduplication). ${poolsSanitized.length} after filtering`
    );

    return poolsSanitized;
  }

  protected abstract mapSubgraphPool(
    rawSubgraphPool: TRawSubgraphPool
  ): TSubgraphPool;

  // Helper method to get the pool fields for GraphQL queries
  protected getPoolFields(): string {
    return `
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
    `;
  }
}
