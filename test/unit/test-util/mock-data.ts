import { Token } from '@uniswap/sdk-core';
import { TokenList } from '@uniswap/token-lists';
import { encodeSqrtRatioX96, FeeAmount, Pool } from '@uniswap/v3-sdk';
import { BigNumber } from 'ethers';
import _ from 'lodash';
import {
  DAI_MAINNET as DAI,
  PoolAccessor,
  SubgraphPool,
  TokenAccessor,
  USDC_MAINNET as USDC,
  USDT_MAINNET as USDT,
  WBTC_MAINNET as WBTC,
  WETH9,
} from '../../../src';

export const mockBlock = 123456789;
export const mockGasPriceWeiBN = BigNumber.from(100000);
export const mockBlockBN = BigNumber.from(mockBlock);

export const mockRoutingConfig = {
  topN: 0,
  topNDirectSwaps: 0,
  topNTokenInOut: 0,
  topNSecondHop: 0,
  topNWithEachBaseToken: 0,
  topNWithBaseToken: 0,
  topNWithBaseTokenInSet: false,
  maxSwapsPerPath: 3,
  minSplits: 1,
  maxSplits: 4,
  distributionPercent: 5,
};

export const USDC_WETH_LOW = new Pool(
  USDC,
  WETH9[1],
  FeeAmount.LOW,
  encodeSqrtRatioX96(1, 1),
  500,
  0
);

export const USDC_WETH_MEDIUM = new Pool(
  USDC,
  WETH9[1],
  FeeAmount.MEDIUM,
  encodeSqrtRatioX96(1, 1),
  500,
  0
);

export const WETH9_USDT_LOW = new Pool(
  WETH9[1],
  USDT,
  FeeAmount.LOW,
  encodeSqrtRatioX96(1, 1),
  200,
  0
);
export const USDC_DAI_LOW = new Pool(
  USDC,
  DAI,
  FeeAmount.LOW,
  encodeSqrtRatioX96(1, 1),
  10,
  0
);
export const USDC_DAI_MEDIUM = new Pool(
  USDC,
  DAI,
  FeeAmount.MEDIUM,
  encodeSqrtRatioX96(1, 1),
  8,
  0
);
export const USDC_USDT_MEDIUM = new Pool(
  USDC,
  USDT,
  FeeAmount.MEDIUM,
  encodeSqrtRatioX96(1, 1),
  8,
  0
);

export const DAI_USDT_LOW = new Pool(
  DAI,
  USDT,
  FeeAmount.LOW,
  encodeSqrtRatioX96(1, 1),
  10,
  0
);
export const DAI_USDT_MEDIUM = new Pool(
  DAI,
  USDT,
  FeeAmount.MEDIUM,
  encodeSqrtRatioX96(1, 1),
  10,
  0
);
export const WBTC_USDT_MEDIUM = new Pool(
  USDT,
  WBTC,
  FeeAmount.MEDIUM,
  encodeSqrtRatioX96(1, 1),
  500,
  0
);
export const WBTC_WETH_MEDIUM = new Pool(
  WETH9[1],
  WBTC,
  FeeAmount.MEDIUM,
  encodeSqrtRatioX96(1, 1),
  500,
  0
);

export const poolToSubgraphPool = (pool: Pool, idx: number): SubgraphPool => {
  return {
    id: idx.toString(),
    feeTier: pool.fee.toString(),
    liquidity: pool.liquidity.toString(),
    token0: {
      symbol: pool.token0.symbol!,
      id: pool.token0.address,
    },
    token1: {
      symbol: pool.token1.symbol!,
      id: pool.token1.address,
    },
    totalValueLockedUSD: pool.liquidity.toString(),
    totalValueLockedETH: pool.liquidity.toString(),
    totalValueLockedETHFloat: parseFloat(pool.liquidity.toString()),
    totalValueLockedUSDFloat: parseFloat(pool.liquidity.toString()),
  };
};

export const buildMockPoolAccessor: (pools: Pool[]) => PoolAccessor = (
  pools: Pool[]
) => {
  return {
    getAllPools: () => pools,
    getPoolByAddress: (address: string) =>
      _.find(
        pools,
        (p) =>
          Pool.getAddress(p.token0, p.token1, p.fee).toLowerCase() ==
          address.toLowerCase()
      ),
    getPool: (tokenA, tokenB, fee) =>
      _.find(
        pools,
        (p) =>
          Pool.getAddress(p.token0, p.token1, p.fee) ==
          Pool.getAddress(tokenA, tokenB, fee)
      ),
  };
};

export const buildMockTokenAccessor: (tokens: Token[]) => TokenAccessor = (
  tokens
) => {
  return {
    getAllTokens: () => tokens,
    getTokenByAddress: (address) =>
      _.find(tokens, (t) => t.address.toLowerCase() == address.toLowerCase()),
    getTokenBySymbol: (symbol) =>
      _.find(tokens, (t) => t.symbol!.toLowerCase() == symbol.toLowerCase()),
  };
};

export const mockTokenList: TokenList = {
  "name": "Tokens",
  "timestamp": "2021-01-05T20:47:02.923Z",
  "version": {
    "major": 1,
    "minor": 0,
    "patch": 0
  },
  "tags": {},
  "logoURI": "ipfs://QmNa8mQkrNKp1WEEeGjFezDmDeodkWRevGFN8JCV7b4Xir",
  "keywords": ["uniswap"],
  "tokens": [
    {
      "name": "USD//C",
      "address": "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
      "symbol": "USDC",
      "decimals": 6,
      "chainId": 1,
      "logoURI": ""
    },
    {
      "name": "USDT",
      "address": "0xdAC17F958D2ee523a2206206994597C13D831ec7",
      "symbol": "USDT",
      "decimals": 6,
      "chainId": 1,
      "logoURI": ""
    },
    {
      "name": "DAI",
      "address": "0x6B175474E89094C44Da98b954EedeAC495271d0F",
      "symbol": "DAI",
      "decimals": 18,
      "chainId": 1,
      "logoURI": ""
    },
    {
      "name": "USDT",
      "address": "0x110a13FC3efE6A245B50102D2d79B3E76125Ae83",
      "symbol": "USDT",
      "decimals": 18,
      "chainId": 2,
      "logoURI": ""
    },
    {
      "name": "WBTC",
      "address": "0x577D296678535e4903D59A4C929B718e1D575e0A",
      "symbol": "WBTC",
      "decimals": 18,
      "chainId": 777,
      "logoURI": ""
    }
  ],
};
