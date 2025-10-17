import { ChainId, Currency } from '@uniswap/sdk-core';
import { Pool } from '@uniswap/v4-sdk';
import JSBI from 'jsbi';
import _ from 'lodash';

import {
  getAddress,
  getApplicableV4FeesTickspacingsHooks,
  log,
} from '../../util';
import { BASES_TO_CHECK_TRADES_AGAINST } from '../caching-subgraph-provider';
import { ProviderConfig } from '../provider';

import { IV4PoolProvider, V4PoolConstruct } from './pool-provider';
import { IV4SubgraphProvider, V4SubgraphPool } from './subgraph-provider';

export class StaticV4SubgraphProvider implements IV4SubgraphProvider {
  constructor(
    private chainId: ChainId,
    private poolProvider: IV4PoolProvider,
    private v4PoolParams: Array<
      [number, number, string]
    > = getApplicableV4FeesTickspacingsHooks(chainId)
  ) {}

  public async getPools(
    currencyIn?: Currency,
    currencyOut?: Currency,
    providerConfig?: ProviderConfig
  ): Promise<V4SubgraphPool[]> {
    log.info('In static subgraph provider for V4');
    const bases = BASES_TO_CHECK_TRADES_AGAINST[this.chainId];

    const basePairs: [Currency, Currency][] = _.flatMap(
      bases,
      (base): [Currency, Currency][] =>
        bases.map((otherBase) => [base, otherBase])
    );

    if (currencyIn && currencyOut) {
      basePairs.push(
        [currencyIn, currencyOut],
        ...bases.map((base): [Currency, Currency] => [currencyIn, base]),
        ...bases.map((base): [Currency, Currency] => [currencyOut, base])
      );
    }

    const pairs: V4PoolConstruct[] = _(basePairs)
      .filter((tokens): tokens is [Currency, Currency] =>
        Boolean(tokens[0] && tokens[1])
      )
      .filter(
        ([tokenA, tokenB]) =>
          tokenA.wrapped.address !== tokenB.wrapped.address &&
          !tokenA.equals(tokenB)
      )
      .flatMap<V4PoolConstruct>(([tokenA, tokenB]) => {
        const tokensWithPoolParams: Array<
          [Currency, Currency, number, number, string]
        > = this.v4PoolParams.map(([feeAmount, tickSpacing, hooks]) => {
          return [tokenA, tokenB, feeAmount, tickSpacing, hooks];
        });

        return tokensWithPoolParams;
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
          feeTier: fee.toString(),
          tickSpacing: tickSpacing.toString(),
          hooks: hooks,
          liquidity: liquidity.toString(),
          token0: {
            symbol: token0.symbol,
            id: getAddress(token0),
            name: token0.name,
            decimals: token0.decimals.toString(),
          },
          token1: {
            symbol: token1.symbol,
            id: getAddress(token1),
            name: token1.name,
            decimals: token1.decimals.toString(),
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
