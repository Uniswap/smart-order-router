import { BigNumber } from '@ethersproject/bignumber';
import { ChainId, Currency, Ether, Token } from '@uniswap/sdk-core';
import { TokenList } from '@uniswap/token-lists';
import { Pair } from '@uniswap/v2-sdk';
import { encodeSqrtRatioX96, FeeAmount, Pool as V3Pool } from '@uniswap/v3-sdk';
import { Pool as V4Pool } from '@uniswap/v4-sdk';
import _ from 'lodash';
import {
  AlphaRouterConfig,
  CurrencyAmount,
  DAI_MAINNET as DAI,
  TokenAccessor,
  UNI_MAINNET,
  USDC_MAINNET as USDC,
  USDT_MAINNET as USDT,
  V2PoolAccessor,
  V2SubgraphPool,
  V3PoolAccessor,
  V3SubgraphPool,
  V4PoolAccessor,
  V4SubgraphPool,
  WBTC_MAINNET as WBTC,
  WRAPPED_NATIVE_CURRENCY,
} from '../../src';
import { ADDRESS_ZERO } from '@uniswap/router-sdk';

export const mockBlock = 123456789;
export const mockGasPriceWeiBN = BigNumber.from(100000);
export const mockBlockBN = BigNumber.from(mockBlock);

export const mockRoutingConfig: AlphaRouterConfig = {
  v4PoolSelection: {
    topN: 0,
    topNDirectSwaps: 0,
    topNTokenInOut: 0,
    topNSecondHop: 0,
    topNWithEachBaseToken: 0,
    topNWithBaseToken: 0,
  },
  v3PoolSelection: {
    topN: 0,
    topNDirectSwaps: 0,
    topNTokenInOut: 0,
    topNSecondHop: 0,
    topNWithEachBaseToken: 0,
    topNWithBaseToken: 0,
  },
  v2PoolSelection: {
    topN: 0,
    topNDirectSwaps: 0,
    topNTokenInOut: 0,
    topNSecondHop: 0,
    topNWithEachBaseToken: 0,
    topNWithBaseToken: 0,
  },
  maxSwapsPerPath: 3,
  minSplits: 1,
  maxSplits: 4,
  distributionPercent: 5,
  forceCrossProtocol: false,
};

// Mock 0 decimal token
export const MOCK_ZERO_DEC_TOKEN = new Token(
  ChainId.MAINNET,
  '0x11fe4b6ae13d2a6055c8d9cf65c55bac32b5d844',
  0,
  'MOCK',
  'Mock Zero Dec'
);

// Mock V4 Pools
export const USDC_DAI_V4_LOW = new V4Pool(
  USDC,
  DAI,
  FeeAmount.LOW,
  10,
  ADDRESS_ZERO,
  encodeSqrtRatioX96(1, 1),
  10,
  0
);

export const USDC_DAI_V4_MEDIUM = new V4Pool(
  USDC,
  DAI,
  FeeAmount.MEDIUM,
60,
  ADDRESS_ZERO,
  encodeSqrtRatioX96(1, 1),
  8,
  0
);

export const USDC_WETH_V4_LOW = new V4Pool(
  USDC,
  WRAPPED_NATIVE_CURRENCY[1]!,
  FeeAmount.LOW,
  10,
  ADDRESS_ZERO,
  encodeSqrtRatioX96(1, 1),
  500,
  0
);

export const WETH9_USDT_V4_LOW = new V4Pool(
  WRAPPED_NATIVE_CURRENCY[1]!,
  USDT,
  FeeAmount.LOW,
  10,
  ADDRESS_ZERO,
  encodeSqrtRatioX96(1, 1),
  200,
  0
);

export const DAI_USDT_V4_LOW = new V4Pool(
  DAI,
  USDT,
  FeeAmount.LOW,
  10,
  ADDRESS_ZERO,
  encodeSqrtRatioX96(1, 1),
  10,
  0
);

// Mock V3 Pools
export const USDC_MOCK_LOW = new V3Pool(
  USDC,
  MOCK_ZERO_DEC_TOKEN,
  FeeAmount.LOW,
  encodeSqrtRatioX96(1, 1),
  500,
  0
);

export const USDC_WETH_LOW = new V3Pool(
  USDC,
  WRAPPED_NATIVE_CURRENCY[1]!,
  FeeAmount.LOW,
  encodeSqrtRatioX96(1, 1),
  500,
  0
);

export const USDC_WETH_MEDIUM = new V3Pool(
  USDC,
  WRAPPED_NATIVE_CURRENCY[1]!,
  FeeAmount.MEDIUM,
  encodeSqrtRatioX96(1, 1),
  500,
  0
);

// Mock USDC weth pools with different liquidity

export const USDC_WETH_LOW_LIQ_LOW = new V3Pool(
  USDC,
  WRAPPED_NATIVE_CURRENCY[1]!,
  FeeAmount.LOW,
  encodeSqrtRatioX96(1, 1),
  100,
  0
);

export const USDC_WETH_MED_LIQ_MEDIUM = new V3Pool(
  USDC,
  WRAPPED_NATIVE_CURRENCY[1]!,
  FeeAmount.MEDIUM,
  encodeSqrtRatioX96(1, 1),
  500,
  0
);

export const USDC_WETH_HIGH_LIQ_HIGH = new V3Pool(
  USDC,
  WRAPPED_NATIVE_CURRENCY[1]!,
  FeeAmount.HIGH,
  encodeSqrtRatioX96(1, 1),
  1000,
  0
);

export const WETH9_USDT_LOW = new V3Pool(
  WRAPPED_NATIVE_CURRENCY[1]!,
  USDT,
  FeeAmount.LOW,
  encodeSqrtRatioX96(1, 1),
  200,
  0
);
export const USDC_DAI_LOW = new V3Pool(
  USDC,
  DAI,
  FeeAmount.LOW,
  encodeSqrtRatioX96(1, 1),
  10,
  0
);
export const USDC_DAI_MEDIUM = new V3Pool(
  USDC,
  DAI,
  FeeAmount.MEDIUM,
  encodeSqrtRatioX96(1, 1),
  8,
  0
);
export const USDC_USDT_MEDIUM = new V3Pool(
  USDC,
  USDT,
  FeeAmount.MEDIUM,
  encodeSqrtRatioX96(1, 1),
  8,
  0
);

export const DAI_USDT_LOW = new V3Pool(
  DAI,
  USDT,
  FeeAmount.LOW,
  encodeSqrtRatioX96(1, 1),
  10,
  0
);
export const DAI_USDT_MEDIUM = new V3Pool(
  DAI,
  USDT,
  FeeAmount.MEDIUM,
  encodeSqrtRatioX96(1, 1),
  10,
  0
);
export const DAI_WETH_MEDIUM = new V3Pool(
  DAI,
  WRAPPED_NATIVE_CURRENCY[1]!,
  FeeAmount.MEDIUM,
  encodeSqrtRatioX96(1, 1),
  10,
  0
);
export const WBTC_USDT_MEDIUM = new V3Pool(
  USDT,
  WBTC,
  FeeAmount.MEDIUM,
  encodeSqrtRatioX96(1, 1),
  500,
  0
);
export const WBTC_WETH_MEDIUM = new V3Pool(
  WRAPPED_NATIVE_CURRENCY[1]!,
  WBTC,
  FeeAmount.MEDIUM,
  encodeSqrtRatioX96(1, 1),
  500,
  0
);
export const UNI_WETH_MEDIUM = new V3Pool(
  WRAPPED_NATIVE_CURRENCY[1]!,
  UNI_MAINNET,
  FeeAmount.MEDIUM,
  encodeSqrtRatioX96(1, 1),
  500,
  0
);

// Mock V2 Pools
export const DAI_USDT = new Pair(
  CurrencyAmount.fromRawAmount(DAI, 10000000000),
  CurrencyAmount.fromRawAmount(USDT, 10000000000)
);

export const DAI_WETH = new Pair(
  CurrencyAmount.fromRawAmount(DAI, 10000000000),
  CurrencyAmount.fromRawAmount(WRAPPED_NATIVE_CURRENCY[1]!, 10000000000)
);

export const USDC_WETH = new Pair(
  CurrencyAmount.fromRawAmount(USDC, 10000000000),
  CurrencyAmount.fromRawAmount(WRAPPED_NATIVE_CURRENCY[1]!, 10000000000)
);

export const USDC_USDT = new Pair(
  CurrencyAmount.fromRawAmount(USDC, 10000000000),
  CurrencyAmount.fromRawAmount(USDT, 10000000000)
);

export const WETH_USDT = new Pair(
  CurrencyAmount.fromRawAmount(USDT, 10000000000),
  CurrencyAmount.fromRawAmount(WRAPPED_NATIVE_CURRENCY[1]!, 10000000000)
);

export const USDC_DAI = new Pair(
  CurrencyAmount.fromRawAmount(USDC, 10000000000),
  CurrencyAmount.fromRawAmount(DAI, 10000000000)
);

export const WETH_DAI = new Pair(
  CurrencyAmount.fromRawAmount(DAI, 10000000000),
  CurrencyAmount.fromRawAmount(WRAPPED_NATIVE_CURRENCY[1]!, 10000000000)
);

export const WBTC_WETH = new Pair(
  CurrencyAmount.fromRawAmount(WBTC, 10000000000),
  CurrencyAmount.fromRawAmount(WRAPPED_NATIVE_CURRENCY[1]!, 10000000000)
);

export const poolToV4SubgraphPool = (
  pool: V4Pool,
  idx: number | string
): V4SubgraphPool => {
  return {
    id: idx.toString(),
    feeTier: pool.fee.toString(),
    tickSpacing: pool.tickSpacing.toString(),
    hooks: pool.hooks,
    liquidity: pool.liquidity.toString(),
    token0: {
      id: pool.token0.wrapped.address,
    },
    token1: {
      id: pool.token1.wrapped.address,
    },
    tvlETH: parseFloat(pool.liquidity.toString()),
    tvlUSD: parseFloat(pool.liquidity.toString()),
  };
}

export const poolToV3SubgraphPool = (
  pool: V3Pool,
  idx: number | string
): V3SubgraphPool => {
  return {
    id: idx.toString(),
    feeTier: pool.fee.toString(),
    liquidity: pool.liquidity.toString(),
    token0: {
      id: pool.token0.address,
    },
    token1: {
      id: pool.token1.address,
    },
    tvlETH: parseFloat(pool.liquidity.toString()),
    tvlUSD: parseFloat(pool.liquidity.toString()),
  };
};

export const pairToV2SubgraphPool = (
  pool: Pair,
  idx: number | string
): V2SubgraphPool => {
  return {
    id: idx.toString(),
    token0: {
      id: pool.token0.address,
    },
    token1: {
      id: pool.token1.address,
    },
    reserve: 1000,
    supply: 100,
    reserveUSD: 100,
  };
};

export const buildMockV4PoolAccessor: (pools: V4Pool[]) => V4PoolAccessor = (
  pools: V4Pool[]
) => {
  return {
    getAllPools: () => pools,
    getPoolById: (poolId: string) =>
      _.find(pools, (p) => p.poolId.toLowerCase() == poolId.toLowerCase()),
    getPool: (tokenA, tokenB, fee, tickSpacing, hooks) =>
      _.find(
        pools,
        (p) =>
          V4Pool.getPoolId(p.currency0, p.currency1, p.fee, p.tickSpacing, p.hooks) ==
          V4Pool.getPoolId(tokenA, tokenB, fee, tickSpacing, hooks)
      ),
  };
}

export const buildMockV3PoolAccessor: (pools: V3Pool[]) => V3PoolAccessor = (
  pools: V3Pool[]
) => {
  return {
    getAllPools: () => pools,
    getPoolByAddress: (address: string) =>
      _.find(
        pools,
        (p) =>
          V3Pool.getAddress(p.token0, p.token1, p.fee).toLowerCase() ==
          address.toLowerCase()
      ),
    getPool: (tokenA, tokenB, fee) =>
      _.find(
        pools,
        (p) =>
          V3Pool.getAddress(p.token0, p.token1, p.fee) ==
          V3Pool.getAddress(tokenA, tokenB, fee)
      ),
  };
};

export const buildMockV2PoolAccessor: (pools: Pair[]) => V2PoolAccessor = (
  pools: Pair[]
) => {
  return {
    getAllPools: () => pools,
    getPoolByAddress: (address: string) =>
      _.find(
        pools,
        (p) =>
          Pair.getAddress(p.token0, p.token1).toLowerCase() ==
          address.toLowerCase()
      ),
    getPool: (tokenA, tokenB) =>
      _.find(
        pools,
        (p) =>
          Pair.getAddress(p.token0, p.token1) == Pair.getAddress(tokenA, tokenB)
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
  name: 'Tokens',
  timestamp: '2021-01-05T20:47:02.923Z',
  version: {
    major: 1,
    minor: 0,
    patch: 0,
  },
  tags: {},
  logoURI: 'ipfs://QmNa8mQkrNKp1WEEeGjFezDmDeodkWRevGFN8JCV7b4Xir',
  keywords: ['uniswap'],
  tokens: [
    {
      name: 'USD//C',
      address: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
      symbol: 'USDC',
      decimals: 6,
      chainId: 1,
      logoURI: '',
    },
    {
      name: 'USDT',
      address: '0xdAC17F958D2ee523a2206206994597C13D831ec7',
      symbol: 'USDT',
      decimals: 6,
      chainId: 1,
      logoURI: '',
    },
    {
      name: 'DAI',
      address: '0x6B175474E89094C44Da98b954EedeAC495271d0F',
      symbol: 'DAI',
      decimals: 18,
      chainId: 1,
      logoURI: '',
    },
    {
      name: 'USDT',
      address: '0x110a13FC3efE6A245B50102D2d79B3E76125Ae83',
      symbol: 'USDT',
      decimals: 18,
      chainId: 2,
      logoURI: '',
    },
    {
      name: 'WBTC',
      address: '0x577D296678535e4903D59A4C929B718e1D575e0A',
      symbol: 'WBTC',
      decimals: 18,
      chainId: 777,
      logoURI: '',
    },
  ],
};

export const BLAST_WITHOUT_TAX = new Token(
  ChainId.MAINNET,
  '0x3ed643e9032230f01c6c36060e305ab53ad3b482',
  18,
  'BLAST',
  'BLAST',
);
export const BLAST = new Token(
  ChainId.MAINNET,
  '0x3ed643e9032230f01c6c36060e305ab53ad3b482',
  18,
  'BLAST',
  'BLAST',
  false,
  BigNumber.from(400),
  BigNumber.from(10000)
);
export const BULLET_WITHOUT_TAX = new Token(
  ChainId.MAINNET,
  '0x8ef32a03784c8Fd63bBf027251b9620865bD54B6',
  8,
  'BULLET',
  'Bullet Game Betting Token',
  false
);
export const BULLET = new Token(
  ChainId.MAINNET,
  '0x8ef32a03784c8Fd63bBf027251b9620865bD54B6',
  8,
  'BULLET',
  'Bullet Game Betting Token',
  false,
  BigNumber.from(500),
  BigNumber.from(500)
);
export const STETH_WITHOUT_TAX = new Token(
  ChainId.MAINNET,
  '0xae7ab96520de3a18e5e111b5eaab095312d7fe84',
  18,
  'stETH',
  'stETH',
  false
);
// stETH is a special case (rebase token), that would make the token include buyFeeBps and sellFeeBps of 0 as always
export const STETH = new Token(
  ChainId.MAINNET,
  '0xae7ab96520de3a18e5e111b5eaab095312d7fe84',
  18,
  'stETH',
  'stETH',
  false,
  BigNumber.from(0),
  BigNumber.from(0)
);
export const BITBOY = new Token(
  ChainId.MAINNET,
  '0x4a500ed6add5994569e66426588168705fcc9767',
  8,
  'BITBOY',
  'BitBoy Fund',
  false,
  BigNumber.from(300),
  BigNumber.from(300)
);
export const BOYS = new Token(
  ChainId.BASE,
  '0x4d58608EFf50b691A3B76189aF2a7A123dF1e9ba',
  9,
  'BOYS',
  'Boysclub',
  false,
  BigNumber.from(0),
  BigNumber.from(200),
);
export const DFNDR = new Token(
  ChainId.MAINNET,
  '0x3f57c35633cb29834bb7577ba8052eab90f52a02',
  18,
  'DFNDR',
  'Defender Bot',
  false,
  BigNumber.from(500),
  BigNumber.from(500)
);
export const DFNDR_WITHOUT_TAX = new Token(
  ChainId.MAINNET,
  '0x3f57c35633cb29834bb7577ba8052eab90f52a02',
  18,
  'DFNDR',
  'Defender Bot',
  false
);

export const PORTION_BIPS = 12;
export const PORTION_RECIPIENT = '0xd8da6bf26964af9d7eed9e03e53415d37aa96045';
export const PORTION_TYPE = 'flat';

export type Portion = {
  bips: number,
  recipient: string,
  type: string,
}

export const FLAT_PORTION: Portion = {
  bips: PORTION_BIPS,
  recipient: PORTION_RECIPIENT,
  type: PORTION_TYPE,
};

export const GREENLIST_TOKEN_PAIRS: Array<[Currency, Currency]> = [
  [Ether.onChain(ChainId.MAINNET), USDC],
  [WRAPPED_NATIVE_CURRENCY[ChainId.MAINNET], USDT],
  [DAI, WBTC],
];

export const GREENLIST_CARVEOUT_PAIRS: Array<[Currency, Currency]> = [
  [USDC, DAI],
  [WRAPPED_NATIVE_CURRENCY[ChainId.MAINNET], Ether.onChain(ChainId.MAINNET)],
];
