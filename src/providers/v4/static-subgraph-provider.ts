import { IV4SubgraphProvider, V4SubgraphPool } from './subgraph-provider';
import { ChainId, Token } from '@uniswap/sdk-core';
import { log, unparseFeeAmount } from '../../util';
import _ from 'lodash';
import { BASES_TO_CHECK_TRADES_AGAINST } from '../caching-subgraph-provider';
import { Pool } from '@uniswap/v4-sdk';
import { FeeAmount } from '@uniswap/v3-sdk';

export class StaticV4SubgraphProvider implements IV4SubgraphProvider {
  constructor(
    private chainId: ChainId,
  ) {}

  public async getPools(
    tokenIn?: Token,
    tokenOut?: Token
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

    const pairs: [Token, Token, FeeAmount, number][] = _(basePairs)
      .filter((tokens): tokens is [Token, Token] =>
        Boolean(tokens[0] && tokens[1])
      )
      .filter(
        ([tokenA, tokenB]) =>
          tokenA.address !== tokenB.address && !tokenA.equals(tokenB)
      )
      .flatMap<[Token, Token, FeeAmount, number]>(([tokenA, tokenB]) => {
        // TODO: we will follow up with expanding the fee tiers and tick spacing from just hard-coding from v3 for now.
        return [
          [tokenA, tokenB, FeeAmount.LOWEST, 1],
          [tokenA, tokenB, FeeAmount.LOW, 10],
          [tokenA, tokenB, FeeAmount.MEDIUM, 60],
          [tokenA, tokenB, FeeAmount.HIGH, 200],
        ]
      })
      .value();

    log.info(
      `V4 Static subgraph provider about to get ${pairs.length} pools on-chain`
    );

    const poolAddressSet = new Set<string>();
    const subgraphPools: V4SubgraphPool[] = _(pairs)
      .map(([token0, token1, fee, tickSpacing]) => {
        const poolAddress = Pool.getPoolId(token0, token1, fee, tickSpacing, '0x');

        if (poolAddressSet.has(poolAddress)) {
          return undefined;
        }
        poolAddressSet.add(poolAddress);

        return {
          id: poolAddress,
          feeTier: unparseFeeAmount(fee),
          liquidity: '100',
          token0: {
            id: token0.address,
          },
          token1: {
            id: token1.address,
          },
          // As a very rough proxy we just use liquidity for TVL.
          tvlETH: 100,
          tvlUSD: 100,
        };
      })
      .compact()
      .value();

    return subgraphPools;
  }
}
