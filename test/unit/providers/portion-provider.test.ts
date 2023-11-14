import { BigNumber } from '@ethersproject/bignumber';
import {
  Currency,
  CurrencyAmount,
  Fraction,
  Percent,
  Token,
  TradeType,
} from '@uniswap/sdk-core';
import { parseAmount, RouteWithValidQuote, SwapOptions, SwapType, V2RouteWithValidQuote, V3RouteWithValidQuote } from '../../../src';
import { PortionProvider } from '../../../src/providers/portion-provider';
import { FLAT_PORTION, GREENLIST_TOKEN_PAIRS } from '../../test-util/mock-data';
import {
  getMixedRouteWithValidQuoteStub,
  getV2RouteWithValidQuoteStub,
  getV3RouteWithValidQuoteStub
} from './caching/route/test-util/mocked-dependencies';

describe('portion provider', () => {
  const expectedRequestAmount = '1.01';
  const expectedQuote = '1605.56';
  const expectedGas = '2.35';
  const expectedPortion = FLAT_PORTION
  const portionProvider = new PortionProvider();

  describe('getPortion test', () => {
    describe('exact in quote test', () => {

      GREENLIST_TOKEN_PAIRS.forEach((pair) => {
        const token1: Currency | Token = pair[0].isNative ? (pair[0] as Currency) : pair[0].wrapped;
        const token2: Currency | Token = pair[1].isNative ? (pair[1] as Currency) : pair[1].wrapped;
        const tokenSymbol1 = token1.symbol!;
        const tokenSymbol2 = token2.symbol!;
        const tokenAddress1 = token1.wrapped.address;
        const tokenAddress2 = token2.wrapped.address;

        it(`token address ${tokenAddress1} to token address ${tokenAddress2} within the list, should have portion`, async () => {
          await exactInGetPortionAndAssert(token2);
        });

        it(`token symbol ${tokenSymbol1} to token symbol ${tokenSymbol2} within the list, should have portion`, async () => {
          await exactInGetPortionAndAssert(token2);
        });
      });

      async function exactInGetPortionAndAssert(
        token2: Currency | Token
      ) {
        const quoteAmount = parseAmount(expectedQuote, token2);
        const quoteGasAdjustedAmount = quoteAmount.subtract(parseAmount(expectedGas, token2));

        const swapConfig: SwapOptions = {
          type: SwapType.UNIVERSAL_ROUTER,
          slippageTolerance: new Percent(5),
          recipient: '0x123',
          fee: {
            fee: new Percent(expectedPortion.bips, 10_000),
            recipient: expectedPortion.recipient,
          }
        }
        const portionAmount = portionProvider.getPortionAmount(
          quoteAmount,
          TradeType.EXACT_INPUT,
          swapConfig
        );
        const portionAdjustedQuote = portionProvider.getQuoteGasAndPortionAdjusted(TradeType.EXACT_INPUT, quoteGasAdjustedAmount, portionAmount);

        // 1605.56 * 10^8 * 5 / 10000 = 80278000
        const expectedPortionAmount = quoteAmount.multiply(new Fraction(expectedPortion.bips, 10_000));
        expect(portionAmount?.quotient.toString()).toBe(expectedPortionAmount.quotient.toString());

        // (1605.56 - 2.35) * 10^8 - 80278000 = 160240722000
        const expectedQuoteGasAndPortionAdjusted = quoteGasAdjustedAmount.subtract(expectedPortionAmount);
        expect(portionAdjustedQuote?.quotient.toString()).toBe(expectedQuoteGasAndPortionAdjusted.quotient.toString());

        // 160240722000 / 10^8 = 1602.40722000
        expect(portionAdjustedQuote?.toExact()).toBe(expectedQuoteGasAndPortionAdjusted.toExact());
      }
    });

    describe('exact out quote test', () => {
      const portionProvider = new PortionProvider();

      GREENLIST_TOKEN_PAIRS.forEach((pair) => {
        const token1: Currency | Token = pair[0].isNative ? (pair[0] as Currency) : pair[0].wrapped;
        const token2: Currency | Token = pair[1].isNative ? (pair[1] as Currency) : pair[1].wrapped;
        const tokenSymbol1 = token1.symbol!;
        const tokenSymbol2 = token2.symbol!;
        const tokenAddress1 = token1.wrapped.address;
        const tokenAddress2 = token2.wrapped.address;

        it(`token address ${tokenAddress1} to token address ${tokenAddress2} within the list, should have portion`, async () => {
          const amount = parseAmount(expectedRequestAmount, token2);
          await exactOutGetPortionAndAssert(amount, token1);
        });

        it(`token symbol ${tokenSymbol1} to token symbol ${tokenSymbol2} within the list, should have portion`, async () => {
          const amount = parseAmount(expectedRequestAmount, token2);
          await exactOutGetPortionAndAssert(amount, token1);
        });
      });

      async function exactOutGetPortionAndAssert(
        amount: CurrencyAmount<Currency>,
        token1: Currency | Token
      ) {
        const quoteAmount = parseAmount(expectedQuote, token1);
        const quoteGasAdjustedAmount = quoteAmount.add(parseAmount(expectedGas, token1));

        const expectedPortionAmount = amount.multiply(new Fraction(expectedPortion.bips, 10_000));
        const swapConfig: SwapOptions = {
          type: SwapType.UNIVERSAL_ROUTER,
          slippageTolerance: new Percent(5),
          recipient: '0x123',
          flatFee: {
            amount: expectedPortionAmount.quotient.toString(),
            recipient: expectedPortion.recipient,
          }
        }
        const portionAmount = portionProvider.getPortionAmount(amount, TradeType.EXACT_OUTPUT, swapConfig);
        expect(portionAmount).toBeDefined();

        // 1.01 * 10^8 * 12 / 10000 = 121200
        // (exact out requested amount) * (USDC decimal scale) * (portion bips) / 10000 = portion amount
        expect(portionAmount?.quotient.toString()).toBe(expectedPortionAmount.quotient.toString());

        const actualPortionQuoteAmount = portionProvider.getPortionQuoteAmount(
          TradeType.EXACT_OUTPUT,
          quoteAmount,
          amount.add(portionAmount!),
          expectedPortionAmount
        );
        expect(actualPortionQuoteAmount).toBeDefined();

        const expectedPortionQuoteAmount = portionAmount!.divide(portionAmount!.add(amount)).multiply(quoteAmount)
        expect(actualPortionQuoteAmount!.quotient.toString()).toBe(expectedPortionQuoteAmount.quotient.toString());

        const actualCorrectedQuoteAmount = portionProvider.getQuote(TradeType.EXACT_OUTPUT, quoteAmount, actualPortionQuoteAmount);
        const expectedCorrectedQuoteAmount = quoteAmount.subtract(actualPortionQuoteAmount!);
        expect(actualCorrectedQuoteAmount?.quotient.toString()).toBe(expectedCorrectedQuoteAmount.quotient.toString());

        const actualCorrectedQuoteGasAdjustedAmount = portionProvider.getQuoteGasAdjusted(TradeType.EXACT_OUTPUT, quoteGasAdjustedAmount, actualPortionQuoteAmount);
        const expectedCorrectedQuoteGasAdjustedAmount = quoteGasAdjustedAmount.subtract(actualPortionQuoteAmount!);
        expect(actualCorrectedQuoteGasAdjustedAmount?.quotient.toString()).toBe(expectedCorrectedQuoteGasAdjustedAmount.quotient.toString())

        const actualCorrectedQuoteGasAndPortionAdjustedAmount = portionProvider.getQuoteGasAndPortionAdjusted(TradeType.EXACT_OUTPUT, actualCorrectedQuoteGasAdjustedAmount, portionAmount);
        // 1605.56 * 10^18 + 121200 / (1.01 * 10^8 + 121200) * 1605.56 * 10^18 = 1.6074867e+21
        // (exact in quote gas adjusted amount) * (ETH decimal scale) + (portion amount) / (exact out requested amount + portion amount) * (exact in quote amount) * (ETH decimal scale)
        // = (quote gas and portion adjusted amount)
        expect(actualCorrectedQuoteGasAndPortionAdjustedAmount?.quotient.toString()).toBe(actualCorrectedQuoteGasAdjustedAmount.quotient.toString());
      }
    });
  });

  describe('getRouteWithQuotePortionAdjusted test', () => {
    it('exact in test', () => {
      const v2RouteWithQuote = getV2RouteWithValidQuoteStub({
        rawQuote: BigNumber.from(20),
        percent: 5
      });
      const v3RouteWithQuote = getV3RouteWithValidQuoteStub({
        rawQuote: BigNumber.from(50),
        percent: 35
      });
      const mixedRouteWithQuote = getMixedRouteWithValidQuoteStub({
        rawQuote: BigNumber.from(30),
        percent: 60
      });
      const routesWithValidQuotes: RouteWithValidQuote[] = [
        v2RouteWithQuote,
        v3RouteWithQuote,
        mixedRouteWithQuote
      ]
      const swapParams: SwapOptions = {
        type: SwapType.UNIVERSAL_ROUTER,
        deadlineOrPreviousBlockhash: undefined,
        recipient: '0x123',
        slippageTolerance: new Percent(5),
        fee: {
          fee: new Percent(FLAT_PORTION.bips, 10_000),
          recipient: FLAT_PORTION.recipient
        }
      }
      const oneHundredPercent = new Percent(1);

      const routesWithQuotePortionAdjusted = portionProvider.getRouteWithQuotePortionAdjusted(TradeType.EXACT_INPUT, routesWithValidQuotes, swapParams);

      routesWithQuotePortionAdjusted.forEach((routeWithQuotePortionAdjusted) => {
        if (routeWithQuotePortionAdjusted instanceof V2RouteWithValidQuote) {
          expect(routeWithQuotePortionAdjusted.quote.quotient.toString()).toEqual(oneHundredPercent.subtract(new Percent(FLAT_PORTION.bips, 10_000)).multiply(20).quotient.toString())
        }

        if (routeWithQuotePortionAdjusted instanceof V3RouteWithValidQuote) {
          expect(routeWithQuotePortionAdjusted.quote.toExact()).toEqual(oneHundredPercent.subtract(new Percent(FLAT_PORTION.bips, 10_000)).multiply(50).quotient.toString())
        }

        if (routeWithQuotePortionAdjusted instanceof V3RouteWithValidQuote) {
          expect(routeWithQuotePortionAdjusted.quote.toExact()).toEqual(oneHundredPercent.subtract(new Percent(FLAT_PORTION.bips, 10_000)).multiply(60).quotient.toString())
        }
      })
    });

    it('exact out test', () => {
      const v2RouteWithQuote = getV2RouteWithValidQuoteStub({
        rawQuote: BigNumber.from(20),
        percent: 5
      });
      const v3RouteWithQuote = getV3RouteWithValidQuoteStub({
        rawQuote: BigNumber.from(50),
        percent: 35
      });
      const mixedRouteWithQuote = getMixedRouteWithValidQuoteStub({
        rawQuote: BigNumber.from(30),
        percent: 60
      });
      const routesWithValidQuotes: RouteWithValidQuote[] = [
        v2RouteWithQuote,
        v3RouteWithQuote,
        mixedRouteWithQuote
      ]
      const swapParams: SwapOptions = {
        type: SwapType.UNIVERSAL_ROUTER,
        deadlineOrPreviousBlockhash: undefined,
        recipient: '0x123',
        slippageTolerance: new Percent(5),
        fee: {
          fee: new Percent(FLAT_PORTION.bips, 10_000),
          recipient: FLAT_PORTION.recipient
        }
      }

      const routesWithQuotePortionAdjusted = portionProvider.getRouteWithQuotePortionAdjusted(TradeType.EXACT_OUTPUT, routesWithValidQuotes, swapParams);

      routesWithQuotePortionAdjusted.forEach((routeWithQuotePortionAdjusted) => {
        if (routeWithQuotePortionAdjusted instanceof V2RouteWithValidQuote) {
          expect(routeWithQuotePortionAdjusted.quote.quotient.toString()).toEqual('20')
        }

        if (routeWithQuotePortionAdjusted instanceof V3RouteWithValidQuote) {
          expect(routeWithQuotePortionAdjusted.quote.quotient.toString()).toEqual('50')
        }

        if (routeWithQuotePortionAdjusted instanceof V3RouteWithValidQuote) {
          expect(routeWithQuotePortionAdjusted.quote.quotient.toString()).toEqual('30')
        }
      })
    });
  });
});
