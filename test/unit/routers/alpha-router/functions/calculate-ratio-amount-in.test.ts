import { Fraction, Token } from '@uniswap/sdk-core';
import { parseAmount } from '../../../../../src';
import { calculateRatioAmountIn } from '../../../../../src/routers/alpha-router/functions/calculate-ratio-amount-in';

const ADDRESS_ZERO = `0x${'0'.repeat(40)}`;
const ADDRESS_ONE = `0x${'0'.repeat(39)}1`;

describe('calculate ratio amount in', () => {
  let token0: Token;
  let token1: Token;

  beforeEach(() => {
    token0 = new Token(1, ADDRESS_ZERO, 18, 'TEST1', 'Test Token 1');
    token1 = new Token(1, ADDRESS_ONE, 18, 'TEST2', 'Test Token 2');
  });

  describe('when there is excess of token0', () => {
    it('returns correct amountIn with simple inputs', () => {
      const optimalRatio = new Fraction(1, 2);
      const price = new Fraction(1, 2);
      const currencyInAmount = parseAmount('20', token0);
      const currencyOutAmount = parseAmount('5', token1);

      const amountIn = calculateRatioAmountIn(
        optimalRatio,
        price,
        currencyInAmount,
        currencyOutAmount
      );

      expect(amountIn.quotient.toString()).toEqual('14' + '0'.repeat(18));
    });

    it('returns correct amountIn when token1 has more decimal places', () => {
      const optimalRatio = new Fraction(1, 2);
      const price = new Fraction(1, 2);
      const token1SixDecimals = new Token(
        1,
        ADDRESS_ZERO,
        6,
        'TEST1',
        'Test Token 1'
      );
      const currencyInAmount = parseAmount('20', token0);
      const currencyOutAmount = parseAmount('5', token1SixDecimals);

      const amountIn = calculateRatioAmountIn(
        optimalRatio,
        price,
        currencyInAmount,
        currencyOutAmount
      );

      expect(amountIn.quotient.toString()).toEqual('15999999999998000000');
    });

    it('returns correct amountIn when token0 has more decimal places', () => {
      const optimalRatio = new Fraction(1, `1${'0'.repeat(18)}`);
      const price = new Fraction(1, 2);
      const token0SixDecimals = new Token(
        1,
        ADDRESS_ZERO,
        6,
        'TEST1',
        'Test Token 1'
      );
      const currencyInAmount = parseAmount('20', token0SixDecimals);
      const currencyOutAmount = parseAmount('5', token1);

      const amountIn = calculateRatioAmountIn(
        optimalRatio,
        price,
        currencyInAmount,
        currencyOutAmount
      );

      expect(amountIn.quotient.toString()).toEqual('19999994');
    });

    it('returns correct amountIn with with very high price', () => {
      const optimalRatio = new Fraction(1, 2);
      const price = new Fraction(1_000_000, 1);
      const currencyInAmount = parseAmount('20', token0);
      const currencyOutAmount = parseAmount('5', token1);

      const amountIn = calculateRatioAmountIn(
        optimalRatio,
        price,
        currencyInAmount,
        currencyOutAmount
      );

      expect(amountIn.quotient.toString()).toEqual('34999930000139');
    });

    it('returns correct amountIn with with very low price', () => {
      const optimalRatio = new Fraction(1, 2);
      const price = new Fraction(1, 1_000_000);
      const currencyInAmount = parseAmount('20', token0);
      const currencyOutAmount = parseAmount('5', token1);

      const amountIn = calculateRatioAmountIn(
        optimalRatio,
        price,
        currencyInAmount,
        currencyOutAmount
      );

      expect(amountIn.quotient.toString()).toEqual('17499991250004374997');
    });
  });

  describe('when there is excess of token1', () => {
    it('returns correct amountIn with simple inputs', () => {
      const optimalRatio = new Fraction(1, 2);
      const price = new Fraction(1, 2);
      const currencyInAmount = parseAmount('5', token0);
      const currencyOutAmount = parseAmount('20', token1);

      const amountIn = calculateRatioAmountIn(
        optimalRatio,
        price,
        currencyInAmount,
        currencyOutAmount
      );

      expect(amountIn.quotient.toString()).toEqual('-4' + '0'.repeat(18));
    });

    it('returns correct amountIn when token1 has more decimal places', () => {
      const optimalRatio = new Fraction(`1${'0'.repeat(18)}`, 1);
      const price = new Fraction(1, 2);
      const token1SixDecimals = new Token(
        1,
        ADDRESS_ZERO,
        6,
        'TEST1',
        'Test Token 1'
      );
      const currencyInAmount = parseAmount('5', token0);
      const currencyOutAmount = parseAmount('20', token1SixDecimals);

      const amountIn = calculateRatioAmountIn(
        optimalRatio,
        price,
        currencyInAmount,
        currencyOutAmount
      );

      expect(amountIn.quotient.toString()).toEqual('-39999989');
    });

    it('returns correct amountIn when token0 has more decimal places', () => {
      const optimalRatio = new Fraction(1, 2);
      const price = new Fraction(1, 2);
      const token0SixDecimals = new Token(
        1,
        ADDRESS_ZERO,
        6,
        'TEST1',
        'Test Token 1'
      );
      const currencyInAmount = parseAmount('5', token0SixDecimals);
      const currencyOutAmount = parseAmount('20', token1);

      const amountIn = calculateRatioAmountIn(
        optimalRatio,
        price,
        currencyInAmount,
        currencyOutAmount
      );

      expect(amountIn.quotient.toString()).toEqual('-7999999999996000000');
    });

    it('returns correct amountIn with with very high price', () => {
      const optimalRatio = new Fraction(1, 2);
      const price = new Fraction(1_000_000, 1);
      const currencyInAmount = parseAmount('5', token0);
      const currencyOutAmount = parseAmount('20', token1);

      const amountIn = calculateRatioAmountIn(
        optimalRatio,
        price,
        currencyInAmount,
        currencyOutAmount
      );

      expect(amountIn.quotient.toString()).toEqual('-9999980000039');
    });

    it('returns correct amountIn with with very low price', () => {
      const optimalRatio = new Fraction(1, 2);
      const price = new Fraction(1, 1_000_000);
      const currencyInAmount = parseAmount('5', token0);
      const currencyOutAmount = parseAmount('20', token1);

      const amountIn = calculateRatioAmountIn(
        optimalRatio,
        price,
        currencyInAmount,
        currencyOutAmount
      );

      expect(amountIn.quotient.toString()).toEqual('-4999997500001249999');
    });
  });
});
