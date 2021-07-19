import { gql, request } from 'graphql-request';
import _ from 'lodash';
import { log } from '../util/log';

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
  getPools(): Promise<SubgraphPool[]>;
}
export class SubgraphProvider implements ISubgraphProvider {
  constructor() {}

  public async getPools(): Promise<SubgraphPool[]> {
    const query = gql`
      query getPools($pageSize: Int!, $skip: Int!) {
        pools(
          first: $pageSize
          skip: $skip
          orderBy: totalValueLockedETH
          orderDirection: desc
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

    log.info(`Getting pools from the subgraph with page size ${PAGE_SIZE}.`);

    do {
      const poolsResult = await request<{ pools: RawSubgraphPool[] }>(
        SUBGRAPH_URL,
        query,
        {
          pageSize: PAGE_SIZE,
          skip,
        }
      );

      poolsPage = poolsResult.pools;

      pools = pools.concat(poolsPage);
      skip = skip + PAGE_SIZE;
    } while (poolsPage.length > 0);

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


