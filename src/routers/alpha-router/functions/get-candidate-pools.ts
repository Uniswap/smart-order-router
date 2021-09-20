import { Token, TradeType, WETH9 } from '@uniswap/sdk-core';
import { FeeAmount } from '@uniswap/v3-sdk';
import _ from 'lodash';
import { ITokenListProvider } from '../../../providers';
import { IPoolProvider, PoolAccessor } from '../../../providers/pool-provider';
import {
  ISubgraphProvider,
  printSubgraphPool,
  SubgraphPool,
} from '../../../providers/subgraph-provider';
import {
  DAI_MAINNET,
  DAI_RINKEBY_1,
  ITokenProvider,
  USDC_MAINNET,
  USDT_MAINNET,
  WBTC_MAINNET,
} from '../../../providers/token-provider';
import { ChainId } from '../../../util';
import { parseFeeAmount } from '../../../util/amounts';
import { log } from '../../../util/log';
import { metric, MetricLoggerUnit } from '../../../util/metric';
import { AlphaRouterConfig } from '../alpha-router';

export type CandidatePoolsBySelectionCriteria = {
  topByBaseWithTokenIn: SubgraphPool[];
  topByBaseWithTokenOut: SubgraphPool[];
  top2DirectSwapPool: SubgraphPool[];
  top2EthQuoteTokenPool: SubgraphPool[];
  topByTVL: SubgraphPool[];
  topByTVLUsingTokenIn: SubgraphPool[];
  topByTVLUsingTokenOut: SubgraphPool[];
  topByTVLUsingTokenInSecondHops: SubgraphPool[];
  topByTVLUsingTokenOutSecondHops: SubgraphPool[];
};

export type GetCandidatePoolsParams = {
  tokenIn: Token;
  tokenOut: Token;
  routeType: TradeType;
  routingConfig: AlphaRouterConfig;
  subgraphProvider: ISubgraphProvider;
  tokenProvider: ITokenProvider;
  poolProvider: IPoolProvider;
  blockedTokenListProvider?: ITokenListProvider;
  chainId: ChainId;
};

const baseTokensByChain: { [chainId in ChainId]?: Token[] } = {
  [ChainId.MAINNET]: [USDC_MAINNET, USDT_MAINNET, WBTC_MAINNET, DAI_MAINNET, WETH9[1]!],
  [ChainId.RINKEBY]: [DAI_RINKEBY_1],
}

export async function getCandidatePools({
  tokenIn,
  tokenOut,
  routeType,
  routingConfig,
  subgraphProvider,
  tokenProvider,
  poolProvider,
  blockedTokenListProvider,
  chainId,
}: GetCandidatePoolsParams): Promise<{
  poolAccessor: PoolAccessor;
  candidatePools: CandidatePoolsBySelectionCriteria;
}> {
  const {
    blockNumber,
    topN,
    topNDirectSwaps,
    topNTokenInOut,
    topNSecondHop,
    topNWithEachBaseToken,
    topNWithBaseTokenInSet,
    topNWithBaseToken,
  } = routingConfig;
  const tokenInAddress = tokenIn.address.toLowerCase();
  const tokenOutAddress = tokenOut.address.toLowerCase();

  const beforeSubgraphPools = Date.now();

  const allPoolsRaw = await subgraphProvider.getPools({ blockNumber });

  const allPools = _.map(allPoolsRaw, (pool) => {
    return {
      ...pool,
      token0: {
        ...pool.token0,
        id: pool.token0.id.toLowerCase(),
      },
      token1: {
        ...pool.token1,
        id: pool.token1.id.toLowerCase(),
      },
    };
  });

  metric.putMetric(
    'SubgraphPoolsLoad',
    Date.now() - beforeSubgraphPools,
    MetricLoggerUnit.Milliseconds
  );

  // Only consider pools where neither tokens are in the blocked token list.
  let filteredPools: SubgraphPool[] = allPools;
  if (blockedTokenListProvider) {
    filteredPools = [];
    for (const pool of allPools) {
      const token0InBlocklist = await blockedTokenListProvider.getTokenByAddress(pool.token0.id);
      const token1InBlocklist = await blockedTokenListProvider.getTokenByAddress(pool.token1.id);

      if (token0InBlocklist || token1InBlocklist) {
        continue;
      }

      filteredPools.push(pool);
    }
  }

  const subgraphPoolsSorted = _(filteredPools)
    .sortBy((tokenListPool) => -tokenListPool.totalValueLockedUSDFloat)
    .value();

  log.info(`After filtering blocked tokens went from ${allPools.length} to ${subgraphPoolsSorted.length}.`)

  const poolAddressesSoFar = new Set<string>();
  const addToAddressSet = (pools: SubgraphPool[]) => {
    _(pools)
      .map((pool) => pool.id)
      .forEach((poolAddress) => poolAddressesSoFar.add(poolAddress));
  };

  const baseTokens = baseTokensByChain[chainId] ?? [];

  const topByBaseWithTokenIn = _(baseTokens)
    .flatMap((token: Token) => {
      return _(subgraphPoolsSorted)
        .filter((subgraphPool) => {
          const tokenAddress = token.address.toLowerCase();
          return (
            (subgraphPool.token0.id == tokenAddress &&
              subgraphPool.token1.id == tokenInAddress) ||
            (subgraphPool.token1.id == tokenAddress &&
              subgraphPool.token0.id == tokenInAddress)
          );
        })
        .sortBy((tokenListPool) => -tokenListPool.totalValueLockedUSDFloat)
        .slice(0, topNWithEachBaseToken)
        .value();
    })
    .sortBy((tokenListPool) => -tokenListPool.totalValueLockedUSDFloat)
    .slice(0, topNWithBaseToken)
    .value();

  const topByBaseWithTokenOut = _(baseTokens)
    .flatMap((token: Token) => {
      return _(subgraphPoolsSorted)
        .filter((subgraphPool) => {
          const tokenAddress = token.address.toLowerCase();
          return (
            (subgraphPool.token0.id == tokenAddress &&
              subgraphPool.token1.id == tokenOutAddress) ||
            (subgraphPool.token1.id == tokenAddress &&
              subgraphPool.token0.id == tokenOutAddress)
          );
        })
        .sortBy((tokenListPool) => -tokenListPool.totalValueLockedUSDFloat)
        .slice(0, topNWithEachBaseToken)
        .value();
    })
    .sortBy((tokenListPool) => -tokenListPool.totalValueLockedUSDFloat)
    .slice(0, topNWithBaseToken)
    .value();

  if (topNWithBaseTokenInSet) {
    addToAddressSet(topByBaseWithTokenIn);
    addToAddressSet(topByBaseWithTokenOut);
  }

  const top2DirectSwapPool = _(subgraphPoolsSorted)
    .filter((subgraphPool) => {
      return (
        !poolAddressesSoFar.has(subgraphPool.id) &&
        ((subgraphPool.token0.id == tokenInAddress &&
          subgraphPool.token1.id == tokenOutAddress) ||
          (subgraphPool.token1.id == tokenInAddress &&
            subgraphPool.token0.id == tokenOutAddress))
      );
    })
    .slice(0, topNDirectSwaps)
    .value();

  addToAddressSet(top2DirectSwapPool);

  const wethAddress = WETH9[chainId]!.address;

  // Main reason we need this is for gas estimates, only needed if token out is not ETH.
  // We don't check the seen address set because if we've already added pools for getting ETH quotes
  // theres no need to add more.
  let top2EthQuoteTokenPool: SubgraphPool[] = [];
  if (
    tokenOut.symbol != 'WETH' &&
    tokenOut.symbol != 'WETH9' &&
    tokenOut.symbol != 'ETH'
  ) {
    top2EthQuoteTokenPool = _(subgraphPoolsSorted)
      .filter((subgraphPool) => {
        if (routeType == TradeType.EXACT_INPUT) {
          return (
            (subgraphPool.token0.id == wethAddress &&
              subgraphPool.token1.id == tokenOutAddress) ||
            (subgraphPool.token1.id == wethAddress &&
              subgraphPool.token0.id == tokenOutAddress)
          );
        } else {
          return (
            (subgraphPool.token0.symbol == wethAddress &&
              subgraphPool.token1.symbol == tokenIn.symbol) ||
            (subgraphPool.token1.symbol == wethAddress &&
              subgraphPool.token0.symbol == tokenIn.symbol)
          );
        }
      })
      .slice(0, 1)
      .value();
  }

  addToAddressSet(top2EthQuoteTokenPool);

  const topByTVL = _(subgraphPoolsSorted)
    .filter((subgraphPool) => {
      return !poolAddressesSoFar.has(subgraphPool.id);
    })
    .slice(0, topN)
    .value();

  addToAddressSet(topByTVL);

  const topByTVLUsingTokenIn = _(subgraphPoolsSorted)
    .filter((subgraphPool) => {
      return (
        !poolAddressesSoFar.has(subgraphPool.id) &&
        (subgraphPool.token0.id == tokenInAddress ||
          subgraphPool.token1.id == tokenInAddress)
      );
    })
    .slice(0, topNTokenInOut)
    .value();

  addToAddressSet(topByTVLUsingTokenIn);

  const topByTVLUsingTokenOut = _(subgraphPoolsSorted)
    .filter((subgraphPool) => {
      return (
        !poolAddressesSoFar.has(subgraphPool.id) &&
        (subgraphPool.token0.id == tokenOutAddress ||
          subgraphPool.token1.id == tokenOutAddress)
      );
    })
    .slice(0, topNTokenInOut)
    .value();

  addToAddressSet(topByTVLUsingTokenOut);

  const topByTVLUsingTokenInSecondHops = _(topByTVLUsingTokenIn)
    .map((subgraphPool) => {
      return tokenInAddress == subgraphPool.token0.id
        ? subgraphPool.token1.id
        : subgraphPool.token0.id;
    })
    .flatMap((secondHopId: string) => {
      return _(subgraphPoolsSorted)
        .filter((subgraphPool) => {
          return (
            !poolAddressesSoFar.has(subgraphPool.id) &&
            (subgraphPool.token0.id == secondHopId ||
              subgraphPool.token1.id == secondHopId)
          );
        })
        .slice(0, topNSecondHop)
        .value();
    })
    .uniqBy((pool) => pool.id)
    .sortBy((tokenListPool) => -tokenListPool.totalValueLockedUSDFloat)
    .slice(0, topNSecondHop)
    .value();

  addToAddressSet(topByTVLUsingTokenInSecondHops);

  const topByTVLUsingTokenOutSecondHops = _(topByTVLUsingTokenOut)
    .map((subgraphPool) => {
      return tokenOutAddress == subgraphPool.token0.id
        ? subgraphPool.token1.id
        : subgraphPool.token0.id;
    })
    .flatMap((secondHopId: string) => {
      return _(subgraphPoolsSorted)
        .filter((subgraphPool) => {
          return (
            !poolAddressesSoFar.has(subgraphPool.id) &&
            (subgraphPool.token0.id == secondHopId ||
              subgraphPool.token1.id == secondHopId)
          );
        })
        .slice(0, topNSecondHop)
        .value();
    })
    .uniqBy((pool) => pool.id)
    .sortBy((tokenListPool) => -tokenListPool.totalValueLockedUSDFloat)
    .slice(0, topNSecondHop)
    .value();

  addToAddressSet(topByTVLUsingTokenOutSecondHops);

  log.info(
    {
      topByBaseWithTokenIn: topByBaseWithTokenIn.map(printSubgraphPool),
      topByBaseWithTokenOut: topByBaseWithTokenOut.map(printSubgraphPool),
      topByTVL: topByTVL.map(printSubgraphPool),
      topByTVLUsingTokenIn: topByTVLUsingTokenIn.map(printSubgraphPool),
      topByTVLUsingTokenOut: topByTVLUsingTokenOut.map(printSubgraphPool),
      topByTVLUsingTokenInSecondHops:
        topByTVLUsingTokenInSecondHops.map(printSubgraphPool),
      topByTVLUsingTokenOutSecondHops:
        topByTVLUsingTokenOutSecondHops.map(printSubgraphPool),
      top2DirectSwap: top2DirectSwapPool.map(printSubgraphPool),
      top2EthQuotePool: top2EthQuoteTokenPool.map(printSubgraphPool),
    },
    `Candidate pools using top ${topN} for TVL, ${topNTokenInOut} in/out, ${topNSecondHop} second hop`
  );

  const subgraphPools = _([
    ...topByBaseWithTokenIn,
    ...topByBaseWithTokenOut,
    ...top2DirectSwapPool,
    ...top2EthQuoteTokenPool,
    ...topByTVL,
    ...topByTVLUsingTokenIn,
    ...topByTVLUsingTokenOut,
    ...topByTVLUsingTokenInSecondHops,
    ...topByTVLUsingTokenOutSecondHops,
  ])
    .compact()
    .uniqBy((pool) => pool.id)
    .value();

  const tokenAddresses = _(subgraphPools)
    .flatMap((subgraphPool) => [subgraphPool.token0.id, subgraphPool.token1.id])
    .compact()
    .value();

  log.info(
    `Getting the ${tokenAddresses.length} tokens within the pools for consideration`
  );

  const tokenAccessor = await tokenProvider.getTokens(tokenAddresses, {
    blockNumber,
  });

  const tokenPairsRaw = _.map<
    SubgraphPool,
    [Token, Token, FeeAmount] | undefined
  >(subgraphPools, (subgraphPool) => {
    const tokenA = tokenAccessor.getTokenByAddress(subgraphPool.token0.id);
    const tokenB = tokenAccessor.getTokenByAddress(subgraphPool.token1.id);
    const fee = parseFeeAmount(subgraphPool.feeTier);

    if (!tokenA || !tokenB) {
      log.info(
        `Dropping candidate pool for ${subgraphPool.token0.symbol}/${
          subgraphPool.token1.symbol
        }/${fee} because ${
          tokenA ? subgraphPool.token1.symbol : subgraphPool.token0.symbol
        } not found by token provider`
      );
      return undefined;
    }

    return [tokenA, tokenB, fee];
  });

  const tokenPairs = _.compact(tokenPairsRaw);

  const beforePoolsLoad = Date.now();

  const poolAccessor = await poolProvider.getPools(tokenPairs);

  metric.putMetric(
    'PoolsLoad',
    Date.now() - beforePoolsLoad,
    MetricLoggerUnit.Milliseconds
  );

  const poolsBySelection: CandidatePoolsBySelectionCriteria = {
    topByBaseWithTokenIn,
    topByBaseWithTokenOut,
    top2DirectSwapPool,
    top2EthQuoteTokenPool,
    topByTVL,
    topByTVLUsingTokenIn,
    topByTVLUsingTokenOut,
    topByTVLUsingTokenInSecondHops,
    topByTVLUsingTokenOutSecondHops,
  };

  return { poolAccessor, candidatePools: poolsBySelection };
}
