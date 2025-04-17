import { Protocol } from '@uniswap/router-sdk';
import {
ChainId,
Currency,
CurrencyAmount as CurrencyAmountRaw,
Percent,
Token,
TradeType
} from '@uniswap/sdk-core';
import { UniversalRouterVersion } from '@uniswap/universal-router-sdk';
import { ethers } from 'ethers';
import { parseUnits } from 'ethers/lib/utils';
import JSBI from 'jsbi';
import NodeCache from 'node-cache';
import { AlphaRouter,AlphaRouterConfig } from '..';
import {
CachingV3PoolProvider,
CachingV4PoolProvider,
NodeJSCache,
TokenPropertiesProvider,
UniswapMulticallProvider,
V2PoolProvider,
V3PoolProvider,
V4PoolProvider
} from '../../providers';
import { OnChainTokenFeeFetcher } from '../../providers/token-fee-fetcher';
import { DEFAULT_ROUTING_CONFIG_BY_CHAIN } from '../alpha-router/config';
import { SwapType } from '../router';

const ROUTING_CONFIG: AlphaRouterConfig = {
  ...DEFAULT_ROUTING_CONFIG_BY_CHAIN(ChainId.WORLDCHAIN),
  protocols: [Protocol.V3, Protocol.V4, Protocol.V2, Protocol.MIXED],
  saveTenderlySimulationIfFailed: true, // save tenderly simulation on integ-test runs, easier for debugging
};

export class CurrencyAmount extends CurrencyAmountRaw<Currency> {}

function parseAmount(value: string, currency: Currency): CurrencyAmount {
  const typedValueParsed = parseUnits(value, currency.decimals).toString();
  return CurrencyAmount.fromRawAmount(currency, JSBI.BigInt(typedValueParsed));
}

function parseDeadline(deadlineOrPreviousBlockhash: number): number {
  return Math.floor(Date.now() / 1000) + deadlineOrPreviousBlockhash;
}

const getQuoteToken = (
  tokenIn: Currency,
  tokenOut: Currency,
  tradeType: TradeType
): Currency => {
  return tradeType == TradeType.EXACT_INPUT ? tokenOut : tokenIn;
};

const SLIPPAGE = new Percent(15, 100); // 5% or 10_000?
// const LARGE_SLIPPAGE = new Percent(75, 100); // 5% or 10_000?

const USDC_WORLDCHAIN = new Token(
  ChainId.WORLDCHAIN,
  '0x79A02482A880bCE3F13e09Da970dC34db4CD24d1',
  6,
  'USDC',
  'USD//C'
);

// const WETH_WORLDCHAIN = new Token(
//   ChainId.WORLDCHAIN,
//   '0x4200000000000000000000000000000000000006',
//   18,
//   'WETH',
//   'WETH'
// );

const KERNEL_WORLDCHAIN = new Token(
  ChainId.WORLDCHAIN,
  '0x11d5e321901a93512fb043fe047e1eb77c2fb3d4',
  18,
  'KERNEL',
  'KERNEL'
);

describe('alpha Router', () => {
  it(
    'should be defined',
    async () => {
      // declaring these to reduce confusion
      const tokenIn = KERNEL_WORLDCHAIN;
      const tokenOut = USDC_WORLDCHAIN;
      const amount = parseAmount('1000', tokenIn);
      const tradeType = TradeType.EXACT_INPUT;

      const chainId = ChainId.WORLDCHAIN;
      const provider = new ethers.providers.JsonRpcProvider(
        'https://worldchain-mainnet.gateway.tenderly.co'
      );

      const tokenFeeFetcher = new OnChainTokenFeeFetcher(chainId, provider);
      const tokenPropertiesProvider = new TokenPropertiesProvider(
        chainId,
        new NodeJSCache(new NodeCache({ stdTTL: 360, useClones: false })),
        tokenFeeFetcher
      );
      const multicall2Provider = new UniswapMulticallProvider(
        chainId,
        provider
      );

      const v2PoolProvider = new V2PoolProvider(
        chainId,
        multicall2Provider,
        tokenPropertiesProvider
      );

      const v3PoolProvider = new CachingV3PoolProvider(
        chainId,
        new V3PoolProvider(chainId, multicall2Provider),
        new NodeJSCache(new NodeCache({ stdTTL: 360, useClones: false }))
      );

      const v4PoolProvider = new CachingV4PoolProvider(
        chainId,
        new V4PoolProvider(chainId, multicall2Provider),
        new NodeJSCache(new NodeCache({ stdTTL: 360, useClones: false }))
      );

      const alphaRouter = new AlphaRouter({
        chainId,
        provider,
        multicall2Provider,
        v2PoolProvider,
        v3PoolProvider,
        v4PoolProvider,
        // simulator,
      });

      const startTime = Date.now();

      const swap = await alphaRouter.fastRoutePath(
        amount,
        getQuoteToken(tokenIn, tokenOut, tradeType),
        tradeType,
        {
          type: SwapType.UNIVERSAL_ROUTER,
          version: UniversalRouterVersion.V1_2,
          recipient: '0x138021392da7fdff698a453c94bf914b5045c3a0',
          slippageTolerance: SLIPPAGE,
          deadlineOrPreviousBlockhash: parseDeadline(360),
        },
        {
          ...ROUTING_CONFIG,
        }
      );

      console.log(12222, swap);

      console.log('Running time', (Date.now() - startTime) / 1000);
      expect(swap).toBeDefined();
    },
    120 * 1000
  );
});
