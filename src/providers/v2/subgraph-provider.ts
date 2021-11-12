import { Token } from '@uniswap/sdk-core';
import { default as retry } from 'async-retry';
import Timeout from 'await-timeout';
import { gql, GraphQLClient } from 'graphql-request';
import { ChainId } from '../../util/chains';
import { log } from '../../util/log';
import { ProviderConfig } from '../provider';

export interface V2SubgraphPool {
  id: string;
  token0: {
    id: string;
  };
  token1: {
    id: string;
  };
  supply: number;
  reserve: number;
}

type RawV2SubgraphPool = {
  id: string;
  token0: {
    symbol: string;
    id: string;
  };
  token1: {
    symbol: string;
    id: string;
  };
  totalSupply: string;
  reserveETH: string;
  trackedReserveETH: string;
};

const SUBGRAPH_URL_BY_CHAIN: { [chainId in ChainId]?: string } = {
  [ChainId.MAINNET]:
    'https://api.thegraph.com/subgraphs/name/uniswap/uniswap-v2',
  [ChainId.RINKEBY]:
    'https://api.thegraph.com/subgraphs/name/ianlapham/uniswap-v2-rinkeby',
};

const threshold = 0.025;

const PAGE_SIZE = 1000; // 1k is max possible query size from subgraph.
export interface IV2SubgraphProvider {
  getPools(
    tokenIn?: Token,
    tokenOut?: Token,
    providerConfig?: ProviderConfig
  ): Promise<V2SubgraphPool[]>;
}

export class V2SubgraphProvider implements IV2SubgraphProvider {
  private client: GraphQLClient;

  constructor(
    private chainId: ChainId,
    private retries = 2,
    private timeout = 360000
  ) {
    const subgraphUrl = SUBGRAPH_URL_BY_CHAIN[this.chainId];
    if (!subgraphUrl) {
      throw new Error(`No subgraph url for chain id: ${this.chainId}`);
    }
    this.client = new GraphQLClient(subgraphUrl);
  }

  public async getPools(
    _tokenIn?: Token,
    _tokenOut?: Token,
    providerConfig?: ProviderConfig
  ): Promise<V2SubgraphPool[]> {
    const blockNumber = providerConfig?.blockNumber
      ? await providerConfig.blockNumber
      : undefined;
    // Due to limitations with the Subgraph API this is the only way to parameterize the query.
    const query2 = (id: string) => gql`
      query getPools($pageSize: Int!) {
        pairs(
          first: $pageSize
          ${blockNumber ? `block: { number: ${blockNumber} }` : ``}
          ${id !== '' ? `where: { id_gt: "${id}" }` : ``}
        ) {
          id
          token0 { id, symbol }
          token1 { id, symbol }
          totalSupply
          reserveETH
          trackedReserveETH
        }
      }
    `;

    let pools: RawV2SubgraphPool[] = [];

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

        const getPools = async (): Promise<RawV2SubgraphPool[]> => {
          let lastId: string = '';
          let pairs: RawV2SubgraphPool[] = [];
          let pairsPage: RawV2SubgraphPool[] = [];

          do {
            await retry(
              async () => {
                const poolsResult = await this.client.request<{
                  pairs: RawV2SubgraphPool[];
                }>(query2(lastId), {
                  pageSize: PAGE_SIZE,
                });

                pairsPage = poolsResult.pairs;

                pairs = pairs.concat(pairsPage);
                lastId = pairs[pairs.length - 1]!.id;
              },
              {
                retries: this.retries,
                onRetry: (err, retry) => {
                  pools = [];
                  log.info(
                    { err },
                    `Failed request for page of pools from subgraph. Retry attempt: ${retry}`
                  );
                },
              }
            );
          } while (pairsPage.length > 0);

          return pairs;
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
    // filter pools that have liquidity less than threshold
    const poolsSanitized: V2SubgraphPool[] = pools
      .filter((pool) => parseFloat(pool.trackedReserveETH) > threshold)
      .map((pool) => {
        return {
          ...pool,
          id: pool.id.toLowerCase(),
          token0: {
            id: pool.token0.id.toLowerCase(),
          },
          token1: {
            id: pool.token1.id.toLowerCase(),
          },
          supply: parseFloat(pool.totalSupply),
          reserve: parseFloat(pool.trackedReserveETH),
        };
      });

    return poolsSanitized;
  }
}
