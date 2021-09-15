import { default as retry } from 'async-retry';
import { gql, GraphQLClient } from 'graphql-request';
import _ from 'lodash';
import { log } from '../util/log';
import { ProviderConfig } from './provider';
import Timeout from 'await-timeout';
import { ChainId } from '../util/chains';

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

const SUBGRAPH_URL_BY_CHAIN: { [chainId in ChainId]?: string } = {
  [ChainId.MAINNET]: 'https://api.thegraph.com/subgraphs/name/uniswap/uniswap-v3',
  [ChainId.RINKEBY]: 'https://api.thegraph.com/subgraphs/name/ianlapham/uniswap-v3-rinkeby',
}

const PAGE_SIZE = 1000; // 1k is max possible query size from subgraph.
export interface ISubgraphProvider {
  getPools(providerConfig?: ProviderConfig): Promise<SubgraphPool[]>;
}
export class SubgraphProvider implements ISubgraphProvider {
  private client: GraphQLClient;

  constructor(private chainId: ChainId, private retries = 2, private timeout = 7000) {
    const subgraphUrl = SUBGRAPH_URL_BY_CHAIN[this.chainId];
    if (!subgraphUrl) {
      throw new Error(`No subgraph url for chain id: ${this.chainId}`);
    }
    this.client = new GraphQLClient(subgraphUrl);
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

    let pools: RawSubgraphPool[] = [];

    log.info(
      `Getting pools from the subgraph with page size ${PAGE_SIZE}${
        providerConfig?.blockNumber
          ? ` as of block ${providerConfig?.blockNumber}`
          : ''
      }.`
    );

    await retry(
      async () => {
        const timeout = new Timeout();

        const getPools = async (): Promise<RawSubgraphPool[]> => {
          let skip = 0;
          let pools: RawSubgraphPool[] = [];
          let poolsPage: RawSubgraphPool[] = [];
  
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

          return pools;
        }

        try {
          const getPoolsPromise = getPools();
          const timerPromise = timeout.set(this.timeout).then(() => { throw new Error(`Timed out getting pools from subgraph: ${this.timeout}`) });
          pools = await Promise.race([getPoolsPromise, timerPromise]);
          return;
        } catch (err) {
          throw err;
        } finally {
          timeout.clear();
        }

      },
      {
        retries: this.retries,
        onRetry: (err, retry) => {
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
