import { BigNumber } from '@ethersproject/bignumber';
import { BaseProvider } from '@ethersproject/providers';
import { Protocol, SwapRouter } from '@uniswap/router-sdk';
import { Fraction, Percent, TradeType } from '@uniswap/sdk-core';
import { Pair } from '@uniswap/v2-sdk';
import { encodeSqrtRatioX96, Pool, Position } from '@uniswap/v3-sdk';
import JSBI from 'jsbi';
import _ from 'lodash';
import sinon from 'sinon';
import {
  AlphaRouter,
  AlphaRouterConfig,
  CachingTokenListProvider,
  CurrencyAmount,
  DAI_MAINNET as DAI,
  ETHGasStationInfoProvider,
  parseAmount,
  SwapAndAddConfig,
  SwapAndAddOptions,
  SwapRouterProvider,
  SwapToRatioStatus,
  TokenProvider,
  UniswapMulticallProvider,
  USDC_MAINNET as USDC,
  USDT_MAINNET as USDT,
  V2AmountQuote,
  V2QuoteProvider,
  V2Route,
  V2RouteWithQuotes,
  V2RouteWithValidQuote,
  V2SubgraphPool,
  V2SubgraphProvider,
  V3AmountQuote,
  V3HeuristicGasModelFactory,
  V3PoolProvider,
  V3QuoteProvider,
  V3Route,
  V3RouteWithQuotes,
  V3RouteWithValidQuote,
  V3SubgraphPool,
  V3SubgraphProvider,
  WRAPPED_NATIVE_CURRENCY,
} from '../../../../src';
import { ProviderConfig } from '../../../../src/providers/provider';
import {
  TokenValidationResult,
  TokenValidatorProvider,
} from '../../../../src/providers/token-validator-provider';
import { V2PoolProvider } from '../../../../src/providers/v2/pool-provider';
import { V2HeuristicGasModelFactory } from '../../../../src/routers/alpha-router/gas-models/v2/v2-heuristic-gas-model';
import {
  buildMockTokenAccessor,
  buildMockV2PoolAccessor,
  buildMockV3PoolAccessor,
  DAI_USDT,
  DAI_USDT_LOW,
  DAI_USDT_MEDIUM,
  mockBlock,
  mockBlockBN,
  mockGasPriceWeiBN,
  MOCK_ZERO_DEC_TOKEN,
  pairToV2SubgraphPool,
  poolToV3SubgraphPool,
  USDC_DAI,
  USDC_DAI_LOW,
  USDC_DAI_MEDIUM,
  USDC_MOCK_LOW,
  USDC_USDT_MEDIUM,
  USDC_WETH,
  USDC_WETH_LOW,
  WBTC_WETH,
  WETH9_USDT_LOW,
  WETH_USDT,
} from '../../../test-util/mock-data';

const helper = require('../../../../src/routers/alpha-router/functions/calculate-ratio-amount-in');


