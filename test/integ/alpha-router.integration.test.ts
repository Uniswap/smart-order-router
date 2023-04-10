/**
 * @jest-environment hardhat
 */
import { JsonRpcProvider } from '@ethersproject/providers';
import { Protocol } from '@uniswap/router-sdk';
import { Percent } from '@uniswap/sdk-core';
import 'jest-environment-hardhat';
import NodeCache from 'node-cache';
import {
  AlphaRouter,
  AlphaRouterParams,
  CachingV3PoolProvider,
  ChainId,
  EthEstimateGasSimulator,
  FallbackTenderlySimulator,
  NodeJSCache,
  SUPPORTED_CHAINS,
  SwapOptions,
  SwapType,
  TenderlySimulator,
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
  constructor() {
    super(envVars);
    // // this will be used to test gas limit simulation for web flow
    // // in the web flow, we won't simulate on tenderly, only through eth estimate gas
    // this.customAlphaRouter = new AlphaRouter({
    //   chainId: chainId,
    //   provider: hardhat.providers[0]!,
    //   multicall2Provider,
    //   v2PoolProvider,
    //   v3PoolProvider,
    //   simulator: ethEstimateGasSimulator,
    // });

    describe('Smart Order Router Integration Tests', () => {
      this.run();
      this.runExternalTests();

      for (const chain of SUPPORTED_CHAINS.filter(
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
        this.runTestOnChain(chain);
      }
    });
  }

  getAlphaRouter = (
    chainId: ChainId,
    additionalAlphaRouterParams?: Partial<AlphaRouterParams>
  ) => {
    const provider =
      (additionalAlphaRouterParams?.provider as JsonRpcProvider) ??
      hardhat.providers[0]!;

    const multicall2Provider = new UniswapMulticallProvider(chainId, provider);

    const v3PoolProvider = new CachingV3PoolProvider(
      chainId,
      new V3PoolProvider(chainId, multicall2Provider),
      new NodeJSCache(new NodeCache({ stdTTL: 360, useClones: false }))
    );
    const v2PoolProvider = new V2PoolProvider(chainId, multicall2Provider);

    const ethEstimateGasSimulator = new EthEstimateGasSimulator(
      chainId,
      provider,
      v2PoolProvider,
      v3PoolProvider
    );

    const tenderlySimulator = new TenderlySimulator(
      chainId,
      envVars.TENDERLY_BASE_URL!,
      envVars.TENDERLY_USER!,
      envVars.TENDERLY_PROJECT!,
      envVars.TENDERLY_ACCESS_KEY!,
      v2PoolProvider,
      v3PoolProvider,
      provider
    );

    const simulator = new FallbackTenderlySimulator(
      chainId,
      provider,
      tenderlySimulator,
      ethEstimateGasSimulator
    );

    return new AlphaRouter({
      chainId: chainId,
      provider,
      multicall2Provider,
      v2PoolProvider,
      v3PoolProvider,
      simulator,
      ...additionalAlphaRouterParams,
    });
  };

  // Transform quoteConfig into inputs for AlphaRouter.route()
  quote = async (
    quoteConfig: QuoteConfig,
    additionalAlphaRouterParams?: Partial<AlphaRouterParams>,
    allowNullSwap: boolean = false
  ) => {
    if (quoteConfig.tokenIn === quoteConfig.tokenOut)
      throw new Error('Token in and token out are the same');
    if (quoteConfig.tokenInChainId !== quoteConfig.tokenOutChainId)
      throw new Error('Token in and token out are on different chains');

    const chainId = quoteConfig.tokenInChainId;

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

    const defaultRoutingConfig = {
      // @ts-ignore
      ...DEFAULT_ROUTING_CONFIG_BY_CHAIN[chainId],
      protocols: [Protocol.V3, Protocol.V2],
    };

    const swap = await this.getAlphaRouter(
      chainId,
      additionalAlphaRouterParams
    ).route(
      quoteConfig.amount,
      getQuoteToken(
        quoteConfig.tokenIn,
        quoteConfig.tokenOut,
        quoteConfig.tradeType
      ),
      quoteConfig.tradeType,
      swapConfigFinal,
      {
        ...defaultRoutingConfig,
        ...(quoteConfig.routingConfig && quoteConfig.routingConfig),
      }
    );
    if (!allowNullSwap) {
      expect(swap).toBeDefined();
      expect(swap).not.toBeNull();
    }
    return swap!;
  };
}

describe('Smart Order Router base integration tests', () => {
  new SmartOrderRouterIntegrationTestRunner();
});
