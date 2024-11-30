import { ChainId, Token } from '@uniswap/sdk-core';
import retry from 'async-retry';
import Timeout from 'await-timeout';
import { gql, GraphQLClient } from 'graphql-request';
import _ from 'lodash';

import { log } from '../../util/log';
import { metric } from '../../util/metric';
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
  reserveUSD: number;
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
  trackedReserveETH: string;
  reserveUSD: string;
};

const SUBGRAPH_URL_BY_CHAIN: { [chainId in ChainId]?: string } = {
  [ChainId.MAINNET]:
    'https://api.thegraph.com/subgraphs/name/ianlapham/uniswap-v2-dev',
};

const PAGE_SIZE = 1000; // 1k is max possible query size from subgraph.

/**
 * Provider for getting V2 pools from the Subgraph
 *
 * @export
 * @interface IV2SubgraphProvider
 */
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
    private timeout = 360000,
    private rollback = true,
    private pageSize = PAGE_SIZE,
    private trackedEthThreshold = 0.025,
    private untrackedUsdThreshold = Number.MAX_VALUE,
    private subgraphUrlOverride?: string
  ) {
    const subgraphUrl =
      this.subgraphUrlOverride ?? SUBGRAPH_URL_BY_CHAIN[this.chainId];
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
    const beforeAll = Date.now();
    let blockNumber = providerConfig?.blockNumber
      ? await providerConfig.blockNumber
      : undefined;
    // Due to limitations with the Subgraph API this is the only way to parameterize the query.
    const query2 = gql`
        query getPools($pageSize: Int!, $id: String) {
            pairs(
                first: $pageSize
                ${blockNumber ? `block: { number: ${blockNumber} }` : ``}
                where: { id_gt: $id }
            ) {
                id
                token0 { id, symbol }
                token1 { id, symbol }
                totalSupply
                trackedReserveETH
                reserveETH
                reserveUSD
            }
        }
    `;

    let pools: RawV2SubgraphPool[] = [];

    log.info(
      `Getting V2 pools from the subgraph with page size ${this.pageSize}${
        providerConfig?.blockNumber
          ? ` as of block ${providerConfig?.blockNumber}`
          : ''
      }.`
    );

    let outerRetries = 0;
    await retry(
      async () => {
        const timeout = new Timeout();

        const getPools = async (): Promise<RawV2SubgraphPool[]> => {
          let lastId = '';
          let pairs: RawV2SubgraphPool[] = [];
          let pairsPage: RawV2SubgraphPool[] = [];

          // metrics variables
          let totalPages = 0;
          let retries = 0;

          do {
            totalPages += 1;

            await retry(
              async () => {
                const before = Date.now();
                const poolsResult = await this.client.request<{
                  pairs: RawV2SubgraphPool[];
                }>(query2, {
                  pageSize: this.pageSize,
                  id: lastId,
                });
                metric.putMetric(
                  `V2SubgraphProvider.chain_${this.chainId}.getPools.paginate.latency`,
                  Date.now() - before
                );

                pairsPage = poolsResult.pairs;

                pairs = pairs.concat(pairsPage);
                lastId = pairs[pairs.length - 1]!.id;

                metric.putMetric(
                  `V2SubgraphProvider.chain_${this.chainId}.getPools.paginate.pageSize`,
                  pairsPage.length
                );
              },
              {
                retries: this.retries,
                onRetry: (err, retry) => {
                  pools = [];
                  retries += 1;
                  log.error(
                    { err, lastId },
                    `Failed request for page of pools from subgraph. Retry attempt: ${retry}. LastId: ${lastId}`
                  );
                },
              }
            );
          } while (pairsPage.length > 0);

          metric.putMetric(
            `V2SubgraphProvider.chain_${this.chainId}.getPools.paginate`,
            totalPages
          );
          metric.putMetric(
            `V2SubgraphProvider.chain_${this.chainId}.getPools.pairs.length`,
            pairs.length
          );
          metric.putMetric(
            `V2SubgraphProvider.chain_${this.chainId}.getPools.paginate.retries`,
            retries
          );

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
          log.error({ err }, 'Error fetching V2 Subgraph Pools.');
          throw err;
        } finally {
          timeout.clear();
        }
      },
      {
        retries: this.retries,
        onRetry: (err, retry) => {
          outerRetries += 1;
          if (
            this.rollback &&
            blockNumber &&
            _.includes(err.message, 'indexed up to')
          ) {
            metric.putMetric(
              `V2SubgraphProvider.chain_${this.chainId}.getPools.indexError`,
              1
            );
            blockNumber = blockNumber - 10;
            log.info(
              `Detected subgraph indexing error. Rolled back block number to: ${blockNumber}`
            );
          }
          metric.putMetric(
            `V2SubgraphProvider.chain_${this.chainId}.getPools.timeout`,
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
      `V2SubgraphProvider.chain_${this.chainId}.getPools.retries`,
      outerRetries
    );

    // Filter pools that have tracked reserve ETH less than threshold.
    // trackedReserveETH filters pools that do not involve a pool from this allowlist:
    // https://github.com/Uniswap/v2-subgraph/blob/7c82235cad7aee4cfce8ea82f0030af3d224833e/src/mappings/pricing.ts#L43
    // Which helps filter pools with manipulated prices/liquidity.

    // TODO: Remove. Temporary fix to ensure tokens without trackedReserveETH are in the list.
    const FEI = '0x956f47f50a910163d8bf957cf5846d573e7f87ca';

    const tracked = pools.filter(
      (pool) =>
        pool.token0.id == FEI ||
        pool.token1.id == FEI ||
        this.isVirtualPairBaseV2Pool(pool.id) ||
        parseFloat(pool.trackedReserveETH) > this.trackedEthThreshold
    );

    metric.putMetric(
      `V2SubgraphProvider.chain_${this.chainId}.getPools.filter.length`,
      tracked.length
    );
    metric.putMetric(
      `V2SubgraphProvider.chain_${this.chainId}.getPools.filter.percent`,
      (tracked.length / pools.length) * 100
    );

    const beforeFilter = Date.now();
    const poolsSanitized: V2SubgraphPool[] = pools
      .filter((pool) => {
        return (
          pool.token0.id == FEI ||
          pool.token1.id == FEI ||
          this.isVirtualPairBaseV2Pool(pool.id) ||
          parseFloat(pool.trackedReserveETH) > this.trackedEthThreshold ||
          parseFloat(pool.reserveUSD) > this.untrackedUsdThreshold
        );
      })
      .map((pool) => {
        return {
          id: pool.id.toLowerCase(),
          token0: {
            id: pool.token0.id.toLowerCase(),
          },
          token1: {
            id: pool.token1.id.toLowerCase(),
          },
          supply: parseFloat(pool.totalSupply),
          reserve: parseFloat(pool.trackedReserveETH),
          reserveUSD: parseFloat(pool.reserveUSD),
        };
      });

    metric.putMetric(
      `V2SubgraphProvider.chain_${this.chainId}.getPools.filter.latency`,
      Date.now() - beforeFilter
    );
    metric.putMetric(
      `V2SubgraphProvider.chain_${this.chainId}.getPools.untracked.length`,
      poolsSanitized.length
    );
    metric.putMetric(
      `V2SubgraphProvider.chain_${this.chainId}.getPools.untracked.percent`,
      (poolsSanitized.length / pools.length) * 100
    );
    metric.putMetric(`V2SubgraphProvider.chain_${this.chainId}.getPools`, 1);
    metric.putMetric(
      `V2SubgraphProvider.chain_${this.chainId}.getPools.latency`,
      Date.now() - beforeAll
    );

    log.info(
      `Got ${pools.length} V2 pools from the subgraph. ${poolsSanitized.length} after filtering`
    );

    return poolsSanitized;
  }

  // This method checks if a given pool is part of the Virtual Pair Base V2 Pool IDs.
  public isVirtualPairBaseV2Pool(poolId: string): boolean {
    return (
      this.chainId === ChainId.BASE &&
      V2SubgraphProvider.VirtualPairBaseV2PoolIds.has(poolId.toLowerCase())
    );
  }

  // TODO: Remove. Temporary fix to allow VIRTUAL/* V2 top pools to be included in the list until the subgraph is re-indexed.
  private static readonly VirtualPairBaseV2PoolIds: Set<string> = new Set([
    // Pool ID for VIRTUAL / GAME
    '0xd418dfe7670c21f682e041f34250c114db5d7789',
    // Pool ID for VIRTUAL / AIXBT
    '0x7464850cc1cfb54a2223229b77b1bca2f888d946',
    // Pool ID for VIRTUAL / LUNA
    '0xa8e64fb120ce8796594670bae72279c8aa1e5359',
    // Pool ID for VIRTUAL / TOSHI
    '0x368ea6f645deb6d1a8692fe93c550d2834150865',
    // Pool ID for VIRTUAL / KEYCAT
    '0x3b9ddad7459fdfcfdb7117d53301182dd46b7042',
    // Pool ID for VIRTUAL / VADER
    '0xa1dddb82501e8fe2d92ad0e8ba331313f501de72',
    // Pool ID for VIRTUAL / SEKOIA
    '0x9e046c706f9ea6ce8f9287d30a15438c07f42d64',
    // Pool ID for VIRTUAL / SAINT
    '0x93d65a935e7c0f1aa153780e0db3ad08b9448c89',
    // Pool ID for VIRTUAL / $mfer
    '0xcaabcb34b48d29631c2b2c1d947d669fd8117a51',
    // Pool ID for VIRTUAL / AIINU
    '0xd2d670c91d14d9abcca7749f65e3181b2124e12d',
    // Pool ID for VIRTUAL / CONVO
    '0x3268d7efa254e648ffe968664e47ca226e27cd04',
    // Pool ID for VIRTUAL / POLY
    '0xde40586745a4e21efc0e8e0073cdd431ae88876a',
    // Pool ID for VIRTUAL / GUAN
    '0xff5bbda63e87210edd0ab9bc424086589d92e0af',
    // Pool ID for VIRTUAL / SAM
    '0xd72a82022134ba0d417c8d733139057e9bb9ea3f',
    // Pool ID for VIRTUAL / VIRTU
    '0xd9436bdaaf364181f1a39bb4c5e0a307c7353a01',
    // Pool ID for VIRTUAL / CYI
    '0x9d89c0cb73143927761534143747e26c47a1589f',
    // Pool ID for VIRTUAL / VU
    '0xfa65a76655f3c0641b79e89de3f51459c3727823',
    // Pool ID for VIRTUAL / ECHO
    '0x75cf1180ceb1cbef7508a4a4a0de940e2db4f087',
    // Pool ID for VIRTUAL / MUSIC
    '0xcef84d17513ede0ab951f7be9829e638a20bfba4',
    // Pool ID for VIRTUAL / MISATO
    '0x863e3a73c604d5038d41e2512272a73585f70017',
    // Pool ID for VIRTUAL / NIKITA
    '0xb9d782f2cfb755d47e2a5fa1350100c2ce3287ee',
  ]);
}
