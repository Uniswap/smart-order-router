import {
  AlphaRouterConfig,
  CachedRoute,
  CachedRoutes,
  DAI_MAINNET,
  MixedRoute,
  shouldWipeoutCachedRoutes,
  USDC_MAINNET
} from '../../../../../src';
import { Protocol } from '@uniswap/router-sdk';
import { ChainId, TradeType } from '@uniswap/sdk-core';
import {
  USDC_DAI,
  USDC_DAI_LOW,
  USDC_DAI_MEDIUM,
  USDC_DAI_V4_LOW
} from '../../../../test-util/mock-data';
import {
  DEFAULT_ROUTING_CONFIG_BY_CHAIN
} from '../../../../../src/routers/alpha-router/config';

describe('routes', () => {
  const mixedRoutes1 = new MixedRoute([USDC_DAI, USDC_DAI_LOW], USDC_MAINNET, DAI_MAINNET);
  const cachedRoute1 = new CachedRoute({
    route: mixedRoutes1,
    percent: 50,
  });
  const mixedRoutes2 = new MixedRoute([USDC_DAI_V4_LOW, USDC_DAI_LOW], USDC_MAINNET, DAI_MAINNET);
  const cachedRoute2 = new CachedRoute({
    route: mixedRoutes2,
    percent: 50,
  });
  const mixedRoutes3 = new MixedRoute([USDC_DAI, USDC_DAI_LOW, USDC_DAI_MEDIUM], USDC_MAINNET, DAI_MAINNET);
  const cachedRoute3 = new CachedRoute({
    route: mixedRoutes3,
    percent: 50,
  });

  const cachedRoutesIncludeRouteWithV4Pool = new CachedRoutes({
    routes: [cachedRoute1, cachedRoute2],
    chainId: 1,
    currencyIn: USDC_MAINNET,
    currencyOut: DAI_MAINNET,
    protocolsCovered: [Protocol.V2, Protocol.V3, Protocol.V4, Protocol.MIXED],
    blockNumber: 1,
    tradeType: TradeType.EXACT_INPUT,
    originalAmount: '100',
    blocksToLive: 100
  });

  const cachedRoutesIncludeRouteWithoutV4Pool = new CachedRoutes({
    routes: [cachedRoute1, cachedRoute3],
    chainId: 1,
    currencyIn: USDC_MAINNET,
    currencyOut: DAI_MAINNET,
    protocolsCovered: [Protocol.V2, Protocol.V3, Protocol.V4, Protocol.MIXED],
    blockNumber: 1,
    tradeType: TradeType.EXACT_INPUT,
    originalAmount: '100',
    blocksToLive: 100
  });

  test(`do not exclude any cached route for empty excluded protocols list`, async () => {
    const routingConfig: AlphaRouterConfig = {
      // @ts-ignore[TS7053] - complaining about switch being non exhaustive
      ...DEFAULT_ROUTING_CONFIG_BY_CHAIN[ChainId.MAINNET],
      protocols: [Protocol.V2, Protocol.V3, Protocol.V4, Protocol.MIXED],
      excludedProtocolsFromMixed: [],
      optimisticCachedRoutes: false,
    };

    expect(shouldWipeoutCachedRoutes(cachedRoutesIncludeRouteWithV4Pool, routingConfig)).toBeFalsy();
  });

  test(`exclude cached route for V4 protocol`, async () => {
    const routingConfig: AlphaRouterConfig = {
      // @ts-ignore[TS7053] - complaining about switch being non exhaustive
      ...DEFAULT_ROUTING_CONFIG_BY_CHAIN[ChainId.MAINNET],
      protocols: [Protocol.V2, Protocol.V3, Protocol.V4, Protocol.MIXED],
      excludedProtocolsFromMixed: [Protocol.V4],
      optimisticCachedRoutes: false,
    };
    expect(shouldWipeoutCachedRoutes(cachedRoutesIncludeRouteWithV4Pool, routingConfig)).toBeTruthy();
  });

  test(`do not exclude cached route for V4 protocol`, async () => {
    const routingConfig: AlphaRouterConfig = {
      // @ts-ignore[TS7053] - complaining about switch being non exhaustive
      ...DEFAULT_ROUTING_CONFIG_BY_CHAIN[ChainId.MAINNET],
      protocols: [Protocol.V2, Protocol.V3, Protocol.V4, Protocol.MIXED],
      excludedProtocolsFromMixed: [Protocol.V4],
      optimisticCachedRoutes: false,
    };
    expect(shouldWipeoutCachedRoutes(cachedRoutesIncludeRouteWithoutV4Pool, routingConfig)).toBeFalsy();
  });
});
