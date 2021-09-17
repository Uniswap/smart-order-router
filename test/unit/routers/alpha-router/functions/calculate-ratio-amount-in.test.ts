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
      const optimalRatio = new Fraction(1, 1);
      const price = new Fraction(2, 1);
      const token0Amount = parseAmount('20', token0);
      const token1Amount = parseAmount('5', token1);

      const amountIn = calculateRatioAmountIn(
        optimalRatio,
        price,
        token0Amount,
        token1Amount
      );

      expect(amountIn.quotient.toString()).toEqual('5000000000000000000');
      expect(amountIn.currency).toEqual(token0Amount.currency);
    });

    it('returns correct amountIn when token0 has more decimal places', () => {
      const optimalRatio = new Fraction(1, 2);
      const price = new Fraction(1, 2);
      const token1SixDecimals = new Token(
        1,
        ADDRESS_ZERO,
        6,
        'TEST1',
        'Test Token 1'
      );
      const token0Amount = parseAmount('20', token0);
      const token1Amount = parseAmount('5000000000000', token1SixDecimals);

      const amountIn = calculateRatioAmountIn(
        optimalRatio,
        price,
        token0Amount,
        token1Amount
      );

      expect(amountIn.quotient.toString()).toEqual('14000000000000000000');
      expect(amountIn.currency).toEqual(token0Amount.currency);
    });

    it('returns correct amountIn when token1 has more decimal places', () => {
      const optimalRatio = new Fraction(1, 2);
      const price = new Fraction(2, 1);
      const token0SixDecimals = new Token(
        1,
        ADDRESS_ZERO,
        6,
        'TEST1',
        'Test Token 1'
      );
      const token0Amount = parseAmount('20000000000000', token0SixDecimals);
      const token1Amount = parseAmount('5', token1);

      const amountIn = calculateRatioAmountIn(
        optimalRatio,
        price,
        token0Amount,
        token1Amount
      );

      expect(amountIn.quotient.toString()).toEqual('8750000000000000000');
      expect(amountIn.currency).toEqual(token0Amount.currency);
    });

    it('returns correct amountIn with price greater than 1', () => {
      const optimalRatio = new Fraction(2, 1);
      const price = new Fraction(2, 1);
      const token0Amount = parseAmount('20', token0);
      const token1Amount = parseAmount('5', token1);

      const amountIn = calculateRatioAmountIn(
        optimalRatio,
        price,
        token0Amount,
        token1Amount
      );

      expect(amountIn.quotient.toString()).toEqual('2000000000000000000');
      expect(amountIn.currency).toEqual(token0Amount.currency);
    });

    it('returns correct amountIn when price is less than 1', () => {
      const optimalRatio = new Fraction(1, 2);
      const price = new Fraction(1, 2);
      const token0Amount = parseAmount('20', token0);
      const token1Amount = parseAmount('5', token1);

      const amountIn = calculateRatioAmountIn(
        optimalRatio,
        price,
        token0Amount,
        token1Amount
      );

      expect(amountIn.quotient.toString()).toEqual('14000000000000000000');
      expect(amountIn.currency).toEqual(token0Amount.currency);
    });
  });

  describe('when there is excess of token1', () => {
    it('returns correct amountIn with simple inputs', () => {
      const optimalRatio = new Fraction(1, 2);
      const price = new Fraction(1, 2);
      const token0Amount = parseAmount('5', token0);
      const token1Amount = parseAmount('20', token1);

      const amountIn = calculateRatioAmountIn(
        optimalRatio,
        price,
        token1Amount,
        token0Amount
      );

      expect(amountIn.quotient.toString()).toEqual('14000000000000000000');
      expect(amountIn.currency).toEqual(token1Amount.currency);
    });

    it('returns correct amountIn when token0 has more decimal places', () => {
      const optimalRatio = new Fraction(1, 2);
      const price = new Fraction(1, 2);
      const token1SixDecimals = new Token(
        1,
        ADDRESS_ZERO,
        6,
        'TEST1',
        'Test Token 1'
      );
      const token0Amount = parseAmount('5', token0);
      const token1Amount = parseAmount('20000000000000', token1SixDecimals);

      const amountIn = calculateRatioAmountIn(
        optimalRatio,
        price,
        token1Amount,
        token0Amount
      );

      expect(amountIn.quotient.toString()).toEqual('14000000000000000000');
      expect(amountIn.currency).toEqual(token1Amount.currency);
    });

    it('returns correct amountIn when token1 has more decimal places', () => {
      const optimalRatio = new Fraction(1, 2);
      const price = new Fraction(1, 2);
      const token0SixDecimals = new Token(
        1,
        ADDRESS_ZERO,
        6,
        'TEST1',
        'Test Token 1'
      );
      const token0Amount = parseAmount('5000000000000', token0SixDecimals);
      const token1Amount = parseAmount('20', token1);

      const amountIn = calculateRatioAmountIn(
        optimalRatio,
        price,
        token1Amount,
        token0Amount
      );

      expect(amountIn.quotient.toString()).toEqual('14000000000000000000');
      expect(amountIn.currency).toEqual(token1Amount.currency);
    });

    it('returns correct amountIn with price greater than 1', () => {
      const optimalRatio = new Fraction(1, 1);
      const price = new Fraction(2, 1);
      const token0Amount = parseAmount('5', token0);
      const token1Amount = parseAmount('20', token1);

      const amountIn = calculateRatioAmountIn(
        optimalRatio,
        price,
        token1Amount,
        token0Amount
      );

      expect(amountIn.quotient.toString()).toEqual('5000000000000000000');
      expect(amountIn.currency).toEqual(token1Amount.currency);
    });

    it('returns correct amountIn when price is less than 1', () => {
      const optimalRatio = new Fraction(1, 2);
      const price = new Fraction(1, 2);
      const token0Amount = parseAmount('5', token0);
      const token1Amount = parseAmount('20', token1);

      const amountIn = calculateRatioAmountIn(
        optimalRatio,
        price,
        token1Amount,
        token0Amount
      );

      expect(amountIn.quotient.toString()).toEqual('14000000000000000000');
      expect(amountIn.currency).toEqual(token1Amount.currency);
    });
  });
});
