import { ChainId, Token } from '@uniswap/sdk-core';
import { ADDRESS_ZERO, FeeAmount } from '@uniswap/v3-sdk';
import { Pool } from '@uniswap/v4-sdk';
import _ from 'lodash';

import { log, unparseFeeAmount } from '../../util';
import { BASES_TO_CHECK_TRADES_AGAINST } from '../caching-subgraph-provider';

import JSBI from 'jsbi';
import { ProviderConfig } from '../provider';
import { IV4PoolProvider, V4PoolConstruct } from './pool-provider';
import { IV4SubgraphProvider, V4SubgraphPool } from './subgraph-provider';

export class StaticV4SubgraphProvider implements IV4SubgraphProvider {
  constructor(
    private chainId: ChainId,
    private poolProvider: IV4PoolProvider
  ) {}

  public async getPools(
    tokenIn?: Token,
    tokenOut?: Token,
    providerConfig?: ProviderConfig
  ): Promise<V4SubgraphPool[]> {
    log.info('In static subgraph provider for V4');
    const bases = BASES_TO_CHECK_TRADES_AGAINST[this.chainId];

    const basePairs: [Token, Token][] = _.flatMap(
      bases,
      (base): [Token, Token][] => bases.map((otherBase) => [base, otherBase])
    );

    if (tokenIn && tokenOut) {
      basePairs.push(
        [tokenIn, tokenOut],
        ...bases.map((base): [Token, Token] => [tokenIn, base]),
        ...bases.map((base): [Token, Token] => [tokenOut, base])
      );
    }

    const pairs: V4PoolConstruct[] = _(basePairs)
      .filter((tokens): tokens is [Token, Token] =>
        Boolean(tokens[0] && tokens[1])
      )
      .filter(
        ([tokenA, tokenB]) =>
          tokenA.address !== tokenB.address && !tokenA.equals(tokenB)
      )
      .flatMap<V4PoolConstruct>(([tokenA, tokenB]) => {
        // TODO: we will follow up with expanding the fee tiers and tick spacing from just hard-coding from v3 for now.
        return [
          [tokenA, tokenB, FeeAmount.LOWEST, 1, ADDRESS_ZERO],
          [tokenA, tokenB, FeeAmount.LOW, 10, ADDRESS_ZERO],
          [tokenA, tokenB, FeeAmount.MEDIUM, 60, ADDRESS_ZERO],
          [tokenA, tokenB, FeeAmount.HIGH, 200, ADDRESS_ZERO],
        ];
      })
      .value();

    log.info(
      `V4 Static subgraph provider about to get ${pairs.length} pools on-chain`
    );
    const poolAccessor = await this.poolProvider.getPools(
      pairs,
      providerConfig
    );
    const pools = poolAccessor.getAllPools();

    const poolAddressSet = new Set<string>();
    const subgraphPools: V4SubgraphPool[] = _(pools)
      .map((pool) => {
        const { token0, token1, fee, tickSpacing, hooks, liquidity } = pool;

        const poolAddress = Pool.getPoolId(
          token0,
          token1,
          fee,
          tickSpacing,
          hooks
        );

        if (poolAddressSet.has(poolAddress)) {
          return undefined;
        }
        poolAddressSet.add(poolAddress);

        const liquidityNumber = JSBI.toNumber(liquidity);

        return {
          id: poolAddress,
          feeTier: unparseFeeAmount(fee),
          tickSpacing: tickSpacing.toString(),
          hooks: hooks,
          liquidity: liquidity.toString(),
          token0: {
            id: token0.wrapped.address,
          },
          token1: {
            id: token1.wrapped.address,
          },
          // As a very rough proxy we just use liquidity for TVL.
          tvlETH: liquidityNumber,
          tvlUSD: liquidityNumber,
        };
      })
      .compact()
      .value();

    return subgraphPools;
  }
}
