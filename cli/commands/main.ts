import { JsonRpcProvider } from '@ethersproject/providers';
import { Protocol } from '@kittycorn-labs/router-sdk';
import {
  Currency,
  CurrencyAmount,
  Percent,
  Token,
  TradeType,
} from '@kittycorn-labs/sdk-core';
import { UniversalRouterVersion } from '@kittycorn-labs/universal-router-sdk';
import DEFAULT_TOKEN_LIST from '@uniswap/default-token-list';
import dotenv from 'dotenv';
import JSBI from 'jsbi';
import NodeCache from 'node-cache';
import {
  AlphaRouter,
  AlphaRouterConfig,
  CachingGasStationProvider,
  CachingTokenListProvider,
  CachingTokenProviderWithFallback,
  EIP1559GasPriceProvider,
  GasPrice,
  ID_TO_CHAIN_ID,
  LegacyGasPriceProvider,
  nativeOnChain,
  NodeJSCache,
  OnChainGasPriceProvider,
  SwapType,
  TokenProvider,
  UniswapMulticallProvider,
} from '../../src';
import { DEFAULT_ROUTING_CONFIG_BY_CHAIN } from '../../src/routers/alpha-router/config';
import {
  NATIVE_NAMES_BY_ID,
  routeAmountsToString,
  TO_PROTOCOL,
} from '../../src/util';

dotenv.config();
const RPC_URL: { [key: number]: string } = {
  1: `${process.env.JSON_RPC_PROVIDER}`,
  56: `${process.env.JSON_RPC_PROVIDER_BNB}`,
  11155111: `${process.env.JSON_RPC_PROVIDER_SEPOLIA}`,
};

async function main() {
  // const payload = {
  //   amount: '1000000000000000000',
  //   gasStrategies: [
  //     {
  //       limitInflationFactor: 1.15,
  //       displayLimitInflationFactor: 1.15,
  //       priceInflationFactor: 1.5,
  //       percentileThresholdFor1559Fee: 75,
  //       minPriorityFeeGwei: 2,
  //       maxPriorityFeeGwei: 9,
  //     },
  //   ],
  //   swapper: '0xd7e7d82374b94a1d807C9bfb10Ce311335Cb39f3',
  //   tokenIn: '0x0000000000000000000000000000000000000000',
  //   tokenInChainId: 11155111,
  //   tokenOut: '0x94a9D9AC8a22534E3FaCa9F4e7F2E2cf85d5E4C8',
  //   tokenOutChainId: 11155111,
  //   type: 'EXACT_INPUT',
  //   urgency: 'normal',
  //   protocols: ['V3'],
  //   autoSlippage: 'DEFAULT',
  // };

  // const payload = {
  //   amount: '1000000000000000000',
  //   gasStrategies: [
  //     {
  //       limitInflationFactor: 1.15,
  //       displayLimitInflationFactor: 1.15,
  //       priceInflationFactor: 1.5,
  //       percentileThresholdFor1559Fee: 75,
  //       minPriorityFeeGwei: 2,
  //       maxPriorityFeeGwei: 9,
  //     },
  //   ],
  //   swapper: '0xd7e7d82374b94a1d807C9bfb10Ce311335Cb39f3',
  //   tokenIn: '0x0000000000000000000000000000000000000000',
  //   tokenInChainId: 11155111,
  //   tokenOut: '0x94a9D9AC8a22534E3FaCa9F4e7F2E2cf85d5E4C8',
  //   tokenOutChainId: 11155111,
  //   type: 'EXACT_INPUT',
  //   urgency: 'normal',
  //   protocols: ['V3'],
  //   autoSlippage: 'DEFAULT',
  // };

  // const payload = {
  //   amount: '11000000000000000000',
  //   gasStrategies: [
  //     {
  //       limitInflationFactor: 1.15,
  //       displayLimitInflationFactor: 1.15,
  //       priceInflationFactor: 1.5,
  //       percentileThresholdFor1559Fee: 75,
  //       minPriorityFeeGwei: 2,
  //       maxPriorityFeeGwei: 9,
  //     },
  //   ],
  //   swapper: '0xfff0BF131DAEa9bA4e97829D2d3043aaef3213ff',
  //   tokenIn: '0x0000000000000000000000000000000000000000',
  //   tokenInChainId: 1,
  //   tokenOut: '0xdAC17F958D2ee523a2206206994597C13D831ec7',
  //   tokenOutChainId: 1,
  //   type: 'EXACT_INPUT',
  //   urgency: 'normal',
  //   protocols: ['V3'],
  //   autoSlippage: 'DEFAULT',
  // };

  const payload = {
    amount: '1000000000',
    gasStrategies: [
      {
        limitInflationFactor: 1.15,
        displayLimitInflationFactor: 1.15,
        priceInflationFactor: 1.5,
        percentileThresholdFor1559Fee: 75,
        minPriorityFeeGwei: 2,
        maxPriorityFeeGwei: 9,
      },
    ],
    swapper: '0xAAAA44272dc658575Ba38f43C438447dDED45358',
    tokenIn: '0x1E271DB8D8B446A0DEe8e9D774f4213e9Bc1C6ba',
    tokenInChainId: 11155111,
    tokenOut: '0x94a9D9AC8a22534E3FaCa9F4e7F2E2cf85d5E4C8',
    tokenOutChainId: 11155111,
    type: 'EXACT_OUTPUT',
    urgency: 'normal',
    protocols: ['V2', 'V3', 'V4'],
  };

  const swapRoutes = await getQuote(payload);

  if (swapRoutes) {
    const {
      // blockNumber,
      // estimatedGasUsed,
      // estimatedGasUsedQuoteToken,
      // estimatedGasUsedUSD,
      // estimatedGasUsedGasToken,
      // gasPriceWei,
      // methodParameters,
      // quote,
      // quoteGasAdjusted,
      route: routeAmounts,
      // simulationStatus,
      trade,
    } = swapRoutes;

    const routeString = routeAmountsToString(routeAmounts);
    console.log('routeString:', routeString);

    const currencyIn = trade.inputAmount.currency;
    console.log('currencyIn:', currencyIn);
    console.log('inputAmount:', trade.inputAmount.quotient.toString());
    console.log(
      'value:',
      currencyIn.isNative ? trade.inputAmount.quotient.toString() : '0'
    );
  }
}

async function getQuote(payload: any) {
  // Parse parameters
  const chainId = ID_TO_CHAIN_ID(payload.tokenInChainId);
  const tradeType =
    payload.type === 'EXACT_OUTPUT'
      ? TradeType.EXACT_OUTPUT
      : TradeType.EXACT_INPUT;
  const tokenInAddress = payload.tokenIn;
  const tokenOutAddress = payload.tokenOut;
  const amountRaw = payload.amount;
  const protocolsStr = payload.protocols;

  // Initialize providers
  const rpcUrl = RPC_URL[Number(payload.tokenInChainId)];
  if (!rpcUrl) {
    throw new Error(
      `RPC URL not defined for chainId ${payload.tokenInChainId}`
    );
  }

  const provider = new JsonRpcProvider(rpcUrl, chainId);
  const blockNumber = await provider.getBlockNumber();

  const tokenCache = new NodeJSCache<Token>(
    new NodeCache({ stdTTL: 3600, useClones: false })
  );

  const tokenListProvider = await CachingTokenListProvider.fromTokenList(
    chainId,
    DEFAULT_TOKEN_LIST, // or custom tokenListURI
    tokenCache
  );

  const multicall2Provider = new UniswapMulticallProvider(chainId, provider);

  // Initialize tokenProvider
  const tokenProviderOnChain = new TokenProvider(chainId, multicall2Provider);
  const tokenProvider = new CachingTokenProviderWithFallback(
    chainId,
    tokenCache,
    tokenListProvider,
    tokenProviderOnChain
  );

  const currencyIn: Currency = NATIVE_NAMES_BY_ID[chainId]!.includes(
    // Replace to support old native eth address
    tokenInAddress.replace(
      '0x0000000000000000000000000000000000000000',
      '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee'
    )
  )
    ? nativeOnChain(chainId)
    : (await tokenProvider.getTokens([tokenInAddress])).getTokenByAddress(
        tokenInAddress
      )!;

  const currencyOut: Currency = NATIVE_NAMES_BY_ID[chainId]!.includes(
    // Replace to support old native eth address
    tokenOutAddress.replace(
      '0x0000000000000000000000000000000000000000',
      '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee'
    )
  )
    ? nativeOnChain(chainId)
    : (await tokenProvider.getTokens([tokenOutAddress])).getTokenByAddress(
        tokenOutAddress
      )!;

  let protocols: Protocol[] = [];
  if (protocolsStr) {
    protocols = protocolsStr.map((version: string) => TO_PROTOCOL(version));
  }

  const gasPriceCache = new NodeJSCache<GasPrice>(
    new NodeCache({ stdTTL: 15, useClones: true })
  );

  // New AlphaRouter
  const router = new AlphaRouter({
    provider,
    chainId,
    multicall2Provider: multicall2Provider,
    gasPriceProvider: new CachingGasStationProvider(
      chainId,
      new OnChainGasPriceProvider(
        chainId,
        new EIP1559GasPriceProvider(provider),
        new LegacyGasPriceProvider(provider)
      ),
      gasPriceCache
    ),
  });

  const routingConfig: AlphaRouterConfig = {
    ...DEFAULT_ROUTING_CONFIG_BY_CHAIN(chainId),
    ...{
      blockNumber: blockNumber,
      protocols,
      maxSwapsPerPath: 6,
      minSplits: 1,
      maxSplits: 5,
      distributionPercent: 5,
      debugRouting: false,
    },
  };

  const recipient = undefined;

  if (tradeType === TradeType.EXACT_INPUT) {
    const amount = CurrencyAmount.fromRawAmount(
      currencyIn,
      JSBI.BigInt(amountRaw)
    );

    const swapRoute = await router.route(
      amount,
      currencyOut,
      tradeType,
      recipient
        ? {
            type: SwapType.UNIVERSAL_ROUTER,
            deadlineOrPreviousBlockhash: 10000000000000,
            recipient,
            slippageTolerance: new Percent(5, 100),
            simulate: undefined, // simulate ? { fromAddress: recipient } : undefined,
            version: UniversalRouterVersion.V2_0,
          }
        : undefined,
      routingConfig
    );
    return swapRoute;
  } else {
    const amount = CurrencyAmount.fromRawAmount(
      currencyOut,
      JSBI.BigInt(amountRaw)
    );

    const swapRoute = await router.route(
      amount,
      currencyIn,
      tradeType,
      recipient
        ? {
            type: SwapType.SWAP_ROUTER_02,
            deadline: 100,
            recipient,
            slippageTolerance: new Percent(5, 10_000),
          }
        : undefined,
      routingConfig
    );
    return swapRoute;
  }
}

if (process.env.DEVELOP === 'true') {
  main().catch((error) => {
    console.error('Error:', error);
  });
}
