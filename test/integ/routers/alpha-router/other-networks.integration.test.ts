import {
  AlphaRouter,
  ChainId,
  DAI_ON,
  ID_TO_NETWORK_NAME,
  ID_TO_PROVIDER,
  nativeOnChain,
  NATIVE_CURRENCY,
  parseAmount,
  SUPPORTED_CHAINS,
  UniswapMulticallProvider,
  UNI_GÖRLI,
  USDC_ON,
  WNATIVE_ON,
} from '../../../../src';
import { DEFAULT_ROUTING_CONFIG_BY_CHAIN } from '../../../../src/routers/alpha-router/config';

import { JsonRpcProvider } from '@ethersproject/providers';
import { Protocol } from '@uniswap/router-sdk';
import {
  Currency,
  Token,
  TradeType,
} from '@uniswap/sdk-core';
import { config } from 'dotenv'
import _ from 'lodash';

config()


const getQuoteToken = (
  tokenIn: Currency,
  tokenOut: Currency,
  tradeType: TradeType
): Currency => {
  return tradeType == TradeType.EXACT_INPUT ? tokenOut : tokenIn;
};

describe('other networks', () => {
  const TEST_ERC20_1: { [chainId in ChainId]: Token } = {
    [ChainId.MAINNET]: USDC_ON(1),
    [ChainId.ROPSTEN]: USDC_ON(ChainId.ROPSTEN),
    [ChainId.RINKEBY]: USDC_ON(ChainId.RINKEBY),
    [ChainId.GÖRLI]: UNI_GÖRLI,
    [ChainId.KOVAN]: USDC_ON(ChainId.KOVAN),
    [ChainId.OPTIMISM]: USDC_ON(ChainId.OPTIMISM),
    [ChainId.OPTIMISTIC_KOVAN]: USDC_ON(ChainId.OPTIMISTIC_KOVAN),
    [ChainId.ARBITRUM_ONE]: USDC_ON(ChainId.ARBITRUM_ONE),
    [ChainId.ARBITRUM_RINKEBY]: USDC_ON(ChainId.ARBITRUM_RINKEBY),
    [ChainId.POLYGON]: USDC_ON(ChainId.POLYGON),
    [ChainId.POLYGON_MUMBAI]: USDC_ON(ChainId.POLYGON_MUMBAI),
  };
  const TEST_ERC20_2: { [chainId in ChainId]: Token } = {
    [ChainId.MAINNET]: DAI_ON(1),
    [ChainId.ROPSTEN]: DAI_ON(ChainId.ROPSTEN),
    [ChainId.RINKEBY]: DAI_ON(ChainId.RINKEBY),
    [ChainId.GÖRLI]: DAI_ON(ChainId.GÖRLI),
    [ChainId.KOVAN]: DAI_ON(ChainId.KOVAN),
    [ChainId.OPTIMISM]: DAI_ON(ChainId.OPTIMISM),
    [ChainId.OPTIMISTIC_KOVAN]: DAI_ON(ChainId.OPTIMISTIC_KOVAN),
    [ChainId.ARBITRUM_ONE]: DAI_ON(ChainId.ARBITRUM_ONE),
    [ChainId.ARBITRUM_RINKEBY]: DAI_ON(ChainId.ARBITRUM_RINKEBY),
    [ChainId.POLYGON]: DAI_ON(ChainId.POLYGON),
    [ChainId.POLYGON_MUMBAI]: DAI_ON(ChainId.POLYGON_MUMBAI),
  };

  // TODO: Find valid pools/tokens on optimistic kovan and polygon mumbai. We skip those tests for now.
  for (const chain of _.filter(
    SUPPORTED_CHAINS,
    (c) =>
      c != ChainId.OPTIMISTIC_KOVAN &&
      c != ChainId.POLYGON_MUMBAI &&
      c != ChainId.ARBITRUM_RINKEBY &&
      c != ChainId.OPTIMISM /// @dev infura has been having issues with optimism lately
  )) {
    const chainProvider = ID_TO_PROVIDER(chain);
    if (!chainProvider) {
      it.skip(`${ID_TO_NETWORK_NAME(chain)} - no provider available`, () => undefined)
      continue
    }

    describe(ID_TO_NETWORK_NAME(chain), () => {
      let alphaRouter: AlphaRouter;
      beforeAll(async () => {
        const provider = new JsonRpcProvider(chainProvider, chain);
        const multicall2Provider = new UniswapMulticallProvider(chain, provider);
        alphaRouter = new AlphaRouter({ chainId: chain, provider, multicall2Provider });
      });

      for (const tradeType of [TradeType.EXACT_INPUT, TradeType.EXACT_OUTPUT]) {
        const erc1 = TEST_ERC20_1[chain];
        const erc2 = TEST_ERC20_2[chain];

        describe(`${TradeType[tradeType]}`, () => {
          // Help with test flakiness by retrying.
          // jest.retryTimes(1);

          const wrappedNative = WNATIVE_ON(chain);
          it(`${wrappedNative.symbol} -> erc20`, async () => {
            const tokenIn = wrappedNative;
            const tokenOut = erc1;
            const amount =
              tradeType == TradeType.EXACT_INPUT
                ? parseAmount('10', tokenIn)
                : parseAmount('10', tokenOut);

            const swap = await alphaRouter.route(
              amount,
              getQuoteToken(tokenIn, tokenOut, tradeType),
              tradeType,
              undefined,
              {
                // @ts-ignore[TS7053] - complaining about switch being non exhaustive
                ...DEFAULT_ROUTING_CONFIG_BY_CHAIN[chain],
                protocols: [Protocol.V3, Protocol.V2],
              }
            );
            expect(swap).toBeDefined();
            expect(swap).not.toBeNull();

            // Scope limited for non mainnet network tests to validating the swap
          });

          it(`erc20 -> erc20`, async () => {
            const tokenIn = erc1;
            const tokenOut = erc2;
            const amount =
              tradeType == TradeType.EXACT_INPUT
                ? parseAmount('1', tokenIn)
                : parseAmount('1', tokenOut);

            const swap = await alphaRouter.route(
              amount,
              getQuoteToken(tokenIn, tokenOut, tradeType),
              tradeType,
              undefined,
              {
                // @ts-ignore[TS7053] - complaining about switch being non exhaustive
                ...DEFAULT_ROUTING_CONFIG_BY_CHAIN[chain],
                protocols: [Protocol.V3, Protocol.V2],
              }
            );
            expect(swap).toBeDefined();
            expect(swap).not.toBeNull();
          });

          it(`${NATIVE_CURRENCY[chain]} -> erc20`, async () => {
            const tokenIn = nativeOnChain(chain);
            const tokenOut = erc2;
            const amount =
              tradeType == TradeType.EXACT_INPUT
                ? parseAmount('100', tokenIn)
                : parseAmount('100', tokenOut);

            const swap = await alphaRouter.route(
              amount,
              getQuoteToken(tokenIn, tokenOut, tradeType),
              tradeType,
              undefined,
              {
                // @ts-ignore[TS7053] - complaining about switch being non exhaustive
                ...DEFAULT_ROUTING_CONFIG_BY_CHAIN[chain],
                protocols: [Protocol.V3, Protocol.V2],
              }
            );
            expect(swap).toBeDefined();
            expect(swap).not.toBeNull();
          });

          it(`has quoteGasAdjusted values`, async () => {
            const tokenIn = erc1;
            const tokenOut = erc2;
            const amount =
              tradeType == TradeType.EXACT_INPUT
                ? parseAmount('1', tokenIn)
                : parseAmount('1', tokenOut);

            const swap = await alphaRouter.route(
              amount,
              getQuoteToken(tokenIn, tokenOut, tradeType),
              tradeType,
              undefined,
              {
                // @ts-ignore[TS7053] - complaining about switch being non exhaustive
                ...DEFAULT_ROUTING_CONFIG_BY_CHAIN[chain],
                protocols: [Protocol.V3, Protocol.V2],
              }
            );
            expect(swap).toBeDefined();
            expect(swap).not.toBeNull();

            const { quote, quoteGasAdjusted } = swap!;

            if (tradeType == TradeType.EXACT_INPUT) {
              // === .lessThanOrEqualTo
              expect(!quoteGasAdjusted.greaterThan(quote)).toBe(true);
            } else {
              // === .greaterThanOrEqualTo
              expect(!quoteGasAdjusted.lessThan(quote)).toBe(true);
            }
          });
        });
      }
    })
  }
});
