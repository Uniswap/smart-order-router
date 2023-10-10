import { Currency, CurrencyAmount, Fraction, Percent, Token, TradeType } from '@uniswap/sdk-core';
import { parseAmount, SwapOptions, SwapType } from '../../../src';
import { PortionProvider } from '../../../src/providers/portion-provider';
import { FLAT_PORTION, GREENLIST_TOKEN_PAIRS } from '../../test-util/mock-data';

describe('portion provider', () => {
  const expectedRequestAmount = '1.01';
  const expectedQuote = '1605.56';
  const expectedGas = '2.35';
  const expectedPortion = FLAT_PORTION

  describe('getPortion test', () => {
    describe('exact in quote test', () => {
      const portionProvider = new PortionProvider();

      GREENLIST_TOKEN_PAIRS.forEach((pair) => {
        const token1: Currency | Token = pair[0].isNative ? (pair[0] as Currency) : pair[0].wrapped;
        const token2: Currency | Token = pair[1].isNative ? (pair[1] as Currency) : pair[1].wrapped;
        const tokenSymbol1 = token1.symbol!;
        const tokenSymbol2 = token2.symbol!;
        const tokenAddress1 = token1.wrapped.address;
        const tokenAddress2 = token2.wrapped.address;

        it(`token address ${tokenAddress1} to token address ${tokenAddress2} within the list, should have portion`, async () => {
          const amount = parseAmount(expectedRequestAmount, token1);
          await exactInGetPortionAndAssert(amount, token2);
        });

        it(`token symbol ${tokenSymbol1} to token symbol ${tokenSymbol2} within the list, should have portion`, async () => {
          const amount = parseAmount(expectedRequestAmount, token1);
          await exactInGetPortionAndAssert(amount, token2);
        });
      });

      async function exactInGetPortionAndAssert(
        amount: CurrencyAmount<Currency>,
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
        const portionAdjustedQuote = portionProvider.getPortionAdjustedQuote(
          TradeType.EXACT_INPUT,
          amount,
          quoteAmount,
          quoteGasAdjustedAmount,
          portionAmount
        );

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
        const quoteGasAdjustedAmount = quoteAmount.add(parseAmount(expectedGas, token1));
        const portionAdjustedQuote = portionProvider.getPortionAdjustedQuote(
          TradeType.EXACT_OUTPUT,
          amount,
          quoteAmount,
          quoteGasAdjustedAmount,
          portionAmount
        );

        // 1.01 * 10^8 * 12 / 10000 = 121200
        // (exact out requested amount) * (USDC decimal scale) * (portion bips) / 10000 = portion amount
        expect(portionAmount?.quotient.toString()).toBe(expectedPortionAmount.quotient.toString());

        const expectedPortionQuoteAmount = portionProvider.getPortionQuoteAmount(
          expectedPortionAmount,
          quoteAmount,
          amount
        );

        // 1605.56 * 10^18 + 121200 / (1.01 * 10^8 + 121200) * 1605.56 * 10^18 = 1.6074867e+21
        // (exact in quote amount) * (ETH decimal scale) + (portion amount) / (exact out requested amount + portion amount) * (exact in quote amount) * (ETH decimal scale) = portion adjusted quote amount
        const expectedQuoteGasAndPortionAdjusted = quoteGasAdjustedAmount.add(expectedPortionQuoteAmount);
        expect(portionAdjustedQuote?.quotient.toString()).toBe(expectedQuoteGasAndPortionAdjusted.quotient.toString());
      }
    });
  });
});
