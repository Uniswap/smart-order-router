import { ChainId, CurrencyAmount, Fraction, Token } from '@uniswap/sdk-core';
import { Pair } from '@uniswap/v2-sdk';
import { BigNumber } from 'ethers';
import JSBI from 'jsbi';
import { V2QuoteProvider, V2Route, WETH9 } from '../../../../src';
import { ProviderConfig } from '../../../../src/providers/provider';
import { computeAllV2Routes } from '../../../../src/routers/alpha-router/functions/compute-all-routes';
import {
  BLAST,
  BLAST_WITHOUT_TAX,
  BULLET,
  BULLET_WITHOUT_TAX,
  STETH,
} from '../../../test-util/mock-data';

const tokenIn = BULLET_WITHOUT_TAX;
const tokenOut = BLAST_WITHOUT_TAX;

const inputBulletOriginalAmount = JSBI.BigInt(10);
const inputBulletCurrencyAmount = CurrencyAmount.fromRawAmount(
  tokenIn,
  JSBI.exponentiate(inputBulletOriginalAmount, JSBI.BigInt(tokenIn.decimals))
);
const wethOriginalAmount = JSBI.BigInt(10);
const wethCurrencyAmount = CurrencyAmount.fromRawAmount(
  WETH9[ChainId.MAINNET],
  JSBI.exponentiate(
    wethOriginalAmount,
    JSBI.BigInt(WETH9[ChainId.MAINNET].decimals)
  )
);
const stEthOriginalAmount = JSBI.BigInt(10);
const stEthCurrencyAmount = CurrencyAmount.fromRawAmount(
  STETH,
  JSBI.exponentiate(stEthOriginalAmount, JSBI.BigInt(STETH.decimals))
);
const blastOriginalAmount = JSBI.BigInt(10);
const blastCurrencyAmount = CurrencyAmount.fromRawAmount(
  BLAST,
  JSBI.exponentiate(blastOriginalAmount, JSBI.BigInt(BLAST.decimals))
);

// split input amount by 10%, 20%, 30%, 40%
const inputBulletCurrencyAmounts: Array<CurrencyAmount<Token>> = [
  inputBulletCurrencyAmount.multiply(new Fraction(10, 100)),
  inputBulletCurrencyAmount.multiply(new Fraction(20, 100)),
  inputBulletCurrencyAmount.multiply(new Fraction(30, 100)),
  inputBulletCurrencyAmount.multiply(new Fraction(40, 100)),
];

const amountFactorForReserves = JSBI.BigInt(100);
const bulletReserve = CurrencyAmount.fromRawAmount(
  BULLET,
  inputBulletCurrencyAmount.multiply(amountFactorForReserves).quotient
);
const WETHReserve = CurrencyAmount.fromRawAmount(
  WETH9[ChainId.MAINNET],
  wethCurrencyAmount.multiply(amountFactorForReserves).quotient
);
const bulletWETHPool = new Pair(bulletReserve, WETHReserve);
const blastReserve = CurrencyAmount.fromRawAmount(
  BLAST,
  blastCurrencyAmount.multiply(amountFactorForReserves).quotient
);
const WETHBlastPool = new Pair(WETHReserve, blastReserve);
const stETHReserve = CurrencyAmount.fromRawAmount(
  STETH,
  stEthCurrencyAmount.multiply(amountFactorForReserves).quotient
);
const bulletSTETHPool = new Pair(bulletReserve, stETHReserve);
const stETHBlastPool = new Pair(stETHReserve, blastReserve);

const poolsWithTax: Pair[] = [
  bulletWETHPool,
  WETHBlastPool,
  bulletSTETHPool,
  stETHBlastPool,
];

const quoteProvider = new V2QuoteProvider();

describe('QuoteProvider', () => {
  const enableFeeOnTransferFeeFetching = [true, false, undefined];

  enableFeeOnTransferFeeFetching.forEach((enableFeeOnTransferFeeFetching) => {
    describe(`fee-on-transfer flag enableFeeOnTransferFeeFetching = ${enableFeeOnTransferFeeFetching}`, () => {
      const v2Routes: Array<V2Route> = computeAllV2Routes(
        tokenIn,
        tokenOut,
        poolsWithTax,
        7
      );
      const providerConfig: ProviderConfig = {
        enableFeeOnTransferFeeFetching: enableFeeOnTransferFeeFetching,
      };

      // we are leaving exact out, since fot can't quote exact out
      it('should return correct quote for exact in', async () => {
        const { routesWithQuotes } = await quoteProvider.getQuotesManyExactIn(
          inputBulletCurrencyAmounts,
          v2Routes,
          providerConfig
        );
        expect(routesWithQuotes.length).toEqual(2);

        routesWithQuotes.forEach(([route, quote]) => {
          expect(quote.length).toEqual(inputBulletCurrencyAmounts.length);
          expect(route.path.length).toEqual(3);

          inputBulletCurrencyAmounts.map((inputAmount, index) => {
            let currentInputAmount = inputAmount;

            for (let i = 0; i < route.path.length - 1; i++) {
              const token = route.path[i]!;
              const nextToken = route.path[i + 1]!;
              const pair = route.pairs.find(
                (pair) =>
                  pair.involvesToken(token) && pair.involvesToken(nextToken)
              )!;

              if (
                pair.reserve0.currency.equals(BULLET) ||
                pair.reserve0.currency.equals(BLAST)
              ) {
                expect(pair.reserve0.currency.sellFeeBps).toBeDefined();
                expect(pair.reserve0.currency.buyFeeBps).toBeDefined();
              }

              if (
                pair.reserve1.currency.equals(BULLET) ||
                pair.reserve1.currency.equals(BLAST)
              ) {
                expect(pair.reserve1.currency.sellFeeBps).toBeDefined();
                expect(pair.reserve1.currency.buyFeeBps).toBeDefined();
              }

              const [outputAmount] = pair.getOutputAmount(currentInputAmount, enableFeeOnTransferFeeFetching);
              currentInputAmount = outputAmount;

              if (enableFeeOnTransferFeeFetching) {
                if (nextToken.equals(tokenOut)) {
                  expect(nextToken.sellFeeBps).toBeDefined();
                  expect(nextToken.buyFeeBps).toBeDefined();
                }
              } else {
                // when nextToken is tokenOut, we don't require them to exclude sellFeeBps or buyFeeBps
                // the reason is because routing-api filters them out based on the enableFeeOnTransferFeeFetching flag
                // however it's important if tokenIn is fot, we need to exclude sellFeeBps or buyFeeBps
                // below is the logic to exclude sellFeeBps or buyFeeBps
                if (!nextToken.equals(tokenOut)) {
                  expect(
                    nextToken.sellFeeBps === undefined ||
                    nextToken.sellFeeBps.eq(BigNumber.from(0))
                  ).toBeTruthy();
                  expect(
                    nextToken.buyFeeBps === undefined ||
                    nextToken.buyFeeBps.eq(BigNumber.from(0))
                  ).toBeTruthy();
                }
              }
            }

            // This is the raw input amount from tokenIn, no fot tax applied
            // this is important to assert, since interface expects no fot tax applied
            // for tokenIn, see https://www.notion.so/router-sdk-changes-for-fee-on-transfer-support-856392a72df64d628efb7b7a29ed9034?d=8d45715a31364360885eaa7e8bdd3370&pvs=4
            expect(inputAmount.toExact()).toEqual(
              quote[index]!.amount.toExact()
            );

            // With all the FOT bug fixes in, below quote with the final output amount assertion must match exactly
            expect(
              CurrencyAmount.fromRawAmount(
                tokenOut,
                quote[index]!.quote!.toString()
              ).quotient.toString()).toEqual(currentInputAmount.quotient.toString());

            expect(route.input.equals(tokenIn)).toBeTruthy();
            expect(route.output.equals(tokenOut)).toBeTruthy();
          });
        });
      });
    });
  });
});
