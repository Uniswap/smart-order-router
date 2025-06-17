import { Protocol } from '@uniswap/router-sdk';
import { ChainId } from '@uniswap/sdk-core';
import retry from 'async-retry';
import Timeout from 'await-timeout';
import { gql, GraphQLClient } from 'graphql-request';
import _ from 'lodash';
import { SubgraphHooks } from '../../routers/alpha-router/functions/get-candidate-pools';
import { log, metric } from '../../util';
import { ProviderConfig } from '../provider';
import { PAGE_SIZE } from '../subgraph-provider';
import { SUBGRAPH_URL_BY_CHAIN } from './subgraph-provider';

export interface EulerSwapHooks {
  id: string; // euler id
  hook: string; // euler hooks address
  asset0: string; // euler token0
  asset1: string; // euler token1
  eulerAccount: string; // euler account address
}

export interface ISubgraphProvider<TSubgraphHooks extends SubgraphHooks> {
  getHooks(providerConfig?: ProviderConfig): Promise<TSubgraphHooks[]>;
}

export class EulerSwapHooksSubgraphProvider
  implements ISubgraphProvider<EulerSwapHooks>
{
  private client: GraphQLClient;
  private protocol = Protocol.V4;

  constructor(
    private chainId: ChainId,
    private retries = 2,
    private timeout = 30000,
    private rollback = true,
    subgraphUrlOverride = SUBGRAPH_URL_BY_CHAIN[chainId]
  ) {
    if (!subgraphUrlOverride) {
      throw new Error(`No subgraph url for chain id: ${chainId}`);
    }
    this.client = new GraphQLClient(subgraphUrlOverride);
  }

  async getHooks(providerConfig?: ProviderConfig): Promise<EulerSwapHooks[]> {
    const beforeAll = Date.now();
    let blockNumber = providerConfig?.blockNumber
      ? await providerConfig.blockNumber
      : undefined;

    const query = gql`
      query getEulerSwapHooks($pageSize: Int!, $id: String) {
        eulerSwapHooks(
          first: $pageSize,
          ${blockNumber ? `block: { number: ${blockNumber} }` : ``}
          where: { id_gt: $id }
        ) {
          id
          hook
          asset0
          asset1
          eulerAccount
        }
      }
    `;

    let hooks: EulerSwapHooks[] = [];

    log.info(
      `Getting hooks from the subgraph with page size ${PAGE_SIZE}${
        providerConfig?.blockNumber
          ? ` as of block ${providerConfig?.blockNumber}`
          : ''
      }.`
    );

    let retries = 0;

    await retry(
      async () => {
        const timeout = new Timeout();

        const getHooks = async (): Promise<EulerSwapHooks[]> => {
          let lastId = '';
          let hooks: EulerSwapHooks[] = [];
          let hooksPage: EulerSwapHooks[] = [];

          // metrics variables
          let totalPages = 0;

          do {
            totalPages += 1;

            const hooksResult = await this.client.request<{
              pools: EulerSwapHooks[];
            }>(query, {
              pageSize: PAGE_SIZE,
              id: lastId,
            });

            hooksPage = hooksResult.pools;

            hooks = hooks.concat(hooksPage);

            lastId = hooks[hooks.length - 1]!.id;
            metric.putMetric(
              `SubgraphProvider.chain_${this.chainId}.getPools.paginate.pageSize`,
              hooksPage.length
            );
          } while (hooksPage.length > 0);

          metric.putMetric(
            `SubgraphProvider.chain_${this.chainId}.getPools.paginate`,
            totalPages
          );
          metric.putMetric(
            `SubgraphProvider.chain_${this.chainId}.getPools.pools.length`,
            hooks.length
          );

          return hooks;
        };

        try {
          const getPoolsPromise = getHooks();
          const timerPromise = timeout.set(this.timeout).then(() => {
            throw new Error(
              `Timed out getting pools from subgraph: ${this.timeout}`
            );
          });
          hooks = await Promise.race([getPoolsPromise, timerPromise]);
          return;
        } catch (err) {
          log.error({ err }, `Error fetching ${this.protocol} Subgraph Hooks.`);
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
              `SubgraphProvider.chain_${this.chainId}.getPools.indexError`,
              1
            );
            blockNumber = blockNumber - 10;
            log.info(
              `Detected subgraph indexing error. Rolled back block number to: ${blockNumber}`
            );
          }
          metric.putMetric(
            `SubgraphProvider.chain_${this.chainId}.getPools.timeout`,
            1
          );
          hooks = [];
          log.info(
            { err },
            `Failed to get pools from subgraph. Retry attempt: ${retry}`
          );
        },
      }
    );

    metric.putMetric(
      `${this.protocol}SubgraphProvider.chain_${this.chainId}.getHooks.retries`,
      retries
    );
    metric.putMetric(
      `${this.protocol}SubgraphProvider.chain_${this.chainId}.getHooks.latency`,
      Date.now() - beforeAll
    );

    return hooks;
  }
}
