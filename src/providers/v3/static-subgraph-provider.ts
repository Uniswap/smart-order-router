import { Token, WETH9 } from '@uniswap/sdk-core';
import { FeeAmount } from '@uniswap/v3-sdk';
import _ from 'lodash';
import { unparseFeeAmount } from '../../util/amounts';
import { ChainId } from '../../util/chains';
import { log } from '../../util/log';
import {
  DAI_MAINNET,
  USDC_MAINNET,
  USDT_MAINNET,
  WBTC_MAINNET,
} from '../token-provider';
import { IV3PoolProvider } from './pool-provider';
import { IV3SubgraphProvider, V3SubgraphPool } from './subgraph-provider';

type ChainTokenList = {
  readonly [chainId in ChainId]: Token[];
};

const BASES_TO_CHECK_TRADES_AGAINST: ChainTokenList = {
  [ChainId.MAINNET]: [
    WETH9[ChainId.MAINNET]!,
    DAI_MAINNET,
    USDC_MAINNET,
    USDT_MAINNET,
    WBTC_MAINNET,
  ],
  [ChainId.ROPSTEN]: [WETH9[ChainId.ROPSTEN]!],
  [ChainId.RINKEBY]: [WETH9[ChainId.RINKEBY]!],
  [ChainId.GÖRLI]: [WETH9[ChainId.GÖRLI]!],
  [ChainId.KOVAN]: [WETH9[ChainId.KOVAN]!],
};

export class StaticV3SubgraphProvider implements IV3SubgraphProvider {
  constructor(
    private chainId: ChainId,
    private v3PoolProvider: IV3PoolProvider
  ) {}

  public async getPools(
    tokenIn?: Token,
    tokenOut?: Token
  ): Promise<V3SubgraphPool[]> {
    log.info('In static subgraph provider for V3')
    const bases = BASES_TO_CHECK_TRADES_AGAINST[this.chainId];

    let basePairs: [Token, Token][] = _.flatMap(
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

    const pairs: [Token, Token, FeeAmount][] = _(basePairs)
      .filter((tokens): tokens is [Token, Token] =>
        Boolean(tokens[0] && tokens[1])
      )
      .filter(
        ([tokenA, tokenB]) =>
          tokenA.address !== tokenB.address && !tokenA.equals(tokenB)
      )
      .flatMap<[Token, Token, FeeAmount]>(([tokenA, tokenB]) => {
        return [
          [tokenA, tokenB, FeeAmount.LOWEST],
          [tokenA, tokenB, FeeAmount.LOW],
          [tokenA, tokenB, FeeAmount.MEDIUM],
          [tokenA, tokenB, FeeAmount.HIGH],
        ];
      })
      .value();

    const poolAddressSet = new Set<string>();

    const subgraphPools: V3SubgraphPool[] = _(pairs)
      .map(([tokenA, tokenB, fee]) => {
        const { poolAddress, token0, token1 } =
          this.v3PoolProvider.getPoolAddress(tokenA, tokenB, fee);

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
          tvlETH: 100,
          tvlUSD: 100,
        };
      })
      .compact()
      .value();

    return subgraphPools;
  }
}
