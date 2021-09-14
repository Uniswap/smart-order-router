import AbortControllerPoly from 'abort-controller';
import { default as retry } from 'async-retry';
import { gql, GraphQLClient } from 'graphql-request';
import _ from 'lodash';
import { log } from '../util/log';
import { ProviderConfig } from './provider';
export interface SubgraphPool {
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
  totalValueLockedETHFloat: number;
  totalValueLockedUSDFloat: number;
}

export type RawSubgraphPool = {
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
};

export const printSubgraphPool = (s: SubgraphPool) =>
  `${s.token0.symbol}/${s.token1.symbol}/${s.feeTier}`;

const SUBGRAPH_URL =
  'https://api.thegraph.com/subgraphs/name/uniswap/uniswap-v3';

const PAGE_SIZE = 1000; // 1k is max possible query size from subgraph.
export interface ISubgraphProvider {
  getPools(providerConfig?: ProviderConfig): Promise<SubgraphPool[]>;
}
export class SubgraphProvider implements ISubgraphProvider {
  private abortController: AbortController;
  private client: GraphQLClient;

  constructor(private retries = 2, private timeout = 7000) {
    this.abortController = new AbortControllerPoly();
    this.client = new GraphQLClient(SUBGRAPH_URL, {
      signal: this.abortController.signal,
    });
  }

  public async getPools(
    providerConfig?: ProviderConfig
  ): Promise<SubgraphPool[]> {
    const query = gql`
      query getPools($pageSize: Int!, $skip: Int!) {
        pools(
          first: $pageSize
          skip: $skip
          orderBy: totalValueLockedETH
          orderDirection: desc
          ${
            providerConfig?.blockNumber
              ? `block: { number: ${providerConfig?.blockNumber} }`
              : ``
          }
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

    let skip = 0;
    let pools: RawSubgraphPool[] = [];
    let poolsPage: RawSubgraphPool[] = [];

    log.info(
      `Getting pools from the subgraph with page size ${PAGE_SIZE}${
        providerConfig?.blockNumber
          ? ` as of block ${providerConfig?.blockNumber}`
          : ''
      }.`
    );

    

    await retry(
      async (bail) => {
        let done = false;
        
        setTimeout(() => {
          if (!done) {
            this.abortController.abort();
            bail(
              new Error('Failed to get pools from subgraph due to timeout.')
            );
          }
        }, this.timeout);

        do {
          const poolsResult = await this.client.request<{
            pools: RawSubgraphPool[];
          }>(query, {
            pageSize: PAGE_SIZE,
            skip,
          });

          poolsPage = poolsResult.pools;

          pools = pools.concat(poolsPage);
          skip = skip + PAGE_SIZE;
        } while (poolsPage.length > 0);

        done = true;
      },
      {
        retries: this.retries,
        onRetry: (err, retry) => {
          skip = 0;
          pools = [];
          log.info(
            { err },
            `Failed to get pools from subgraph. Retry attempt: ${retry}`
          );
        },
      }
    );

    log.info(`Got ${pools.length} pools from the subgraph.`);

    const poolsSanitized = _.map(pools, (pool) => {
      return {
        ...pool,
        id: pool.id.toLowerCase(),
        token0: {
          ...pool.token0,
          id: pool.token0.id.toLowerCase(),
        },
        token1: {
          ...pool.token1,
          id: pool.token1.id.toLowerCase(),
        },
        totalValueLockedETHFloat: parseFloat(pool.totalValueLockedETH),
        totalValueLockedUSDFloat: parseFloat(pool.totalValueLockedUSD),
      };
    });

    return poolsSanitized;
  }
}
