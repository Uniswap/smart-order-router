import { JsonRpcProvider } from '@ethersproject/providers';
import DEFAULT_TOKEN_LIST from '@uniswap/default-token-list';
import { Protocol } from '@uniswap/router-sdk';
import {
  Currency,
  CurrencyAmount,
  Percent,
  Token,
  TradeType,
} from '@uniswap/sdk-core';
import { UniversalRouterVersion } from '@uniswap/universal-router-sdk';
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
import { NATIVE_NAMES_BY_ID, TO_PROTOCOL } from '../../src/util';

async function main() {
  const payload = {
    amount: '3500000000',
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
    tokenIn: '0xdAC17F958D2ee523a2206206994597C13D831ec7',
    tokenInChainId: 1,
    tokenOut: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',
    tokenOutChainId: 1,
    type: 'EXACT_INPUT',
    urgency: 'normal',
    protocols: ['V4'],
    autoSlippage: 'DEFAULT',
  };

  const result = await getQuote(payload);
  console.log('result:', result);
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
  const provider = new JsonRpcProvider(process.env.JSON_RPC_PROVIDER, chainId);
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
      maxSplits: 3,
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

dotenv.config();
if (!!process.env.DEVELOP) {
  main().catch((error) => {
    console.error('Error:', error);
  });
}
