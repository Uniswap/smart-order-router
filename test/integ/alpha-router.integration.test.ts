/**
 * @jest-environment hardhat
 */
import DEFAULT_TOKEN_LIST from '@uniswap/default-token-list';
import { Protocol } from '@uniswap/router-sdk';
import { Percent } from '@uniswap/sdk-core';
import 'jest-environment-hardhat';
import _ from 'lodash';
import NodeCache from 'node-cache';
import {
  AlphaRouter,
  AlphaRouterConfig,
  CachingTokenListProvider,
  CachingTokenProviderWithFallback,
  CachingV3PoolProvider,
  ChainId,
  EthEstimateGasSimulator,
  FallbackTenderlySimulator,
  ITokenProvider,
  NodeJSCache,
  SUPPORTED_CHAINS,
  SwapOptions,
  SwapType,
  TenderlySimulator,
  TokenProvider,
  UniswapMulticallProvider,
  V2PoolProvider,
  V3PoolProvider,
} from '../../src';
import { DEFAULT_ROUTING_CONFIG_BY_CHAIN } from '../../src/routers/alpha-router/config';
import {
  BaseRoutingIntegTest,
  getQuoteToken,
  parseDeadline,
  QuoteConfig,
} from './base.test';

const envVars = {
  INTEG_TEST_DEBUG: process.env.INTEG_TEST_DEBUG,
  TESTER_PK: process.env.TESTER_PK,
  TENDERLY_BASE_URL: process.env.TENDERLY_BASE_URL,
  TENDERLY_USER: process.env.TENDERLY_USER,
  TENDERLY_PROJECT: process.env.TENDERLY_PROJECT,
  TENDERLY_ACCESS_KEY: process.env.TENDERLY_ACCESS_KEY,
};

class SmartOrderRouterIntegrationTestRunner extends BaseRoutingIntegTest {
  alphaRouter: AlphaRouter;
  customAlphaRouter: AlphaRouter;
  tokenProvider: ITokenProvider;
  routingConfig: AlphaRouterConfig;

  constructor() {
    super(envVars);
    const multicall2Provider = new UniswapMulticallProvider(
      ChainId.MAINNET,
      hardhat.provider
    );

    this.tokenProvider = new CachingTokenProviderWithFallback(
      ChainId.MAINNET,
      new NodeJSCache(new NodeCache({ stdTTL: 3600, useClones: false })),
      new CachingTokenListProvider(
        ChainId.MAINNET,
        DEFAULT_TOKEN_LIST,
        new NodeJSCache(new NodeCache({ stdTTL: 3600, useClones: false }))
      ),
      new TokenProvider(ChainId.MAINNET, multicall2Provider)
    );

    this.routingConfig = {
      // @ts-ignore
      ...DEFAULT_ROUTING_CONFIG_BY_CHAIN[ChainId.MAINNET],
      protocols: [Protocol.V3, Protocol.V2],
    };

    const v3PoolProvider = new CachingV3PoolProvider(
      ChainId.MAINNET,
      new V3PoolProvider(ChainId.MAINNET, multicall2Provider),
      new NodeJSCache(new NodeCache({ stdTTL: 360, useClones: false }))
    );
    const v2PoolProvider = new V2PoolProvider(
      ChainId.MAINNET,
      multicall2Provider
    );

    const ethEstimateGasSimulator = new EthEstimateGasSimulator(
      ChainId.MAINNET,
      hardhat.providers[0]!,
      v2PoolProvider,
      v3PoolProvider
    );

    const tenderlySimulator = new TenderlySimulator(
      ChainId.MAINNET,
      envVars.TENDERLY_BASE_URL!,
      envVars.TENDERLY_USER!,
      envVars.TENDERLY_PROJECT!,
      envVars.TENDERLY_ACCESS_KEY!,
      v2PoolProvider,
      v3PoolProvider,
      hardhat.providers[0]!
    );

    const simulator = new FallbackTenderlySimulator(
      ChainId.MAINNET,
      hardhat.providers[0]!,
      tenderlySimulator,
      ethEstimateGasSimulator
    );

    this.alphaRouter = new AlphaRouter({
      chainId: ChainId.MAINNET,
      provider: hardhat.providers[0]!,
      multicall2Provider,
      v2PoolProvider,
      v3PoolProvider,
      simulator,
    });

    // this will be used to test gas limit simulation for web flow
    // in the web flow, we won't simulate on tenderly, only through eth estimate gas
    this.customAlphaRouter = new AlphaRouter({
      chainId: ChainId.MAINNET,
      provider: hardhat.providers[0]!,
      multicall2Provider,
      v2PoolProvider,
      v3PoolProvider,
      simulator: ethEstimateGasSimulator,
    });
  }

  // Transform quoteConfig into inputs for AlphaRouter.route()
  quote = async (quoteConfig: QuoteConfig) => {
    if (quoteConfig.tokenIn === quoteConfig.tokenOut)
      throw new Error('Token in and token out are the same');

    const swapType = quoteConfig.enableUniversalRouter
      ? SwapType.UNIVERSAL_ROUTER
      : SwapType.SWAP_ROUTER_02;

    const swapConfig = {
      // Annoying because regular definedness check will fail if enableUniversalRouter is false
      ...('enableUniversalRouter' in quoteConfig && {
        type: swapType,
      }),
      ...(quoteConfig.recipient && {
        recipient: quoteConfig.recipient,
      }),
      ...(quoteConfig.deadline && {
        deadline: parseDeadline(Number(quoteConfig.deadline)),
      }),
      ...(quoteConfig.slippageTolerance && {
        slippageTolerance: new Percent(quoteConfig.slippageTolerance, 100),
      }),
      ...(quoteConfig.simulate && { simulate: quoteConfig.simulate }),
      ...(quoteConfig.permit && { permit: quoteConfig.permit }),
    } as SwapOptions;

    // if swapConfig is empty object, set to undefined
    const swapConfigFinal =
      Object.keys(swapConfig).length === 0 ? undefined : swapConfig;

    const swap = await this.alphaRouter.route(
      quoteConfig.amount,
      getQuoteToken(
        quoteConfig.tokenIn,
        quoteConfig.tokenOut,
        quoteConfig.tradeType
      ),
      quoteConfig.tradeType,
      swapConfigFinal,
      {
        ...this.routingConfig,
        ...(quoteConfig.routingConfig && quoteConfig.routingConfig),
      }
    );
    expect(swap).toBeDefined();
    expect(swap).not.toBeNull();

    return swap!;
  };

  run = async () => {
    await super.run();
  };

  runExternalTests = async () => {
    await super.runExternalTests();
  };

  runTestsOnAllChains = async () => {
    for (const chain of _.filter(
      SUPPORTED_CHAINS,
      (c) =>
        c != ChainId.RINKEBY &&
        c != ChainId.ROPSTEN &&
        c != ChainId.KOVAN &&
        c != ChainId.OPTIMISTIC_KOVAN &&
        c != ChainId.OPTIMISM_GOERLI &&
        c != ChainId.POLYGON_MUMBAI &&
        c != ChainId.ARBITRUM_RINKEBY &&
        c != ChainId.ARBITRUM_GOERLI &&
        c != ChainId.OPTIMISM && /// @dev infura has been having issues with optimism lately
        // Tests are failing https://github.com/Uniswap/smart-order-router/issues/104
        c != ChainId.CELO_ALFAJORES
    )) {
      await super.runTestOnChain(chain);
    }
  };
}

describe('AlphaRouter', () => {
  const testRunner = new SmartOrderRouterIntegrationTestRunner();
  testRunner.run();
  testRunner.runExternalTests();
  testRunner.runTestsOnAllChains();
});
