import { CurrencyAmount, V2QuoteProvider, V2Route, WETH9 } from '../../../../src';
import { ProviderConfig } from '../../../../src/providers/provider';
import { BLAST, BLAST_WITHOUT_TAX, BULLET, BULLET_WITHOUT_TAX } from '../../../test-util/mock-data';
import JSBI from 'jsbi';
import { ChainId, Fraction } from '@uniswap/sdk-core';
import { computeAllV2Routes } from '../../../../src/routers/alpha-router/functions/compute-all-routes';
import { Pair } from '@uniswap/v2-sdk';

const tokenIn = BULLET_WITHOUT_TAX
const tokenOut = BLAST_WITHOUT_TAX

const inputBulletOriginalAmount = JSBI.BigInt(10)
const inputBulletCurrencyAmount = CurrencyAmount.fromRawAmount(tokenIn, JSBI.exponentiate(inputBulletOriginalAmount, JSBI.BigInt(tokenIn.decimals)))
const wethOriginalAmount = JSBI.BigInt(10)
const wethCurrencyAmount = CurrencyAmount.fromRawAmount(WETH9[ChainId.MAINNET], JSBI.exponentiate(wethOriginalAmount, JSBI.BigInt(WETH9[ChainId.MAINNET].decimals)))
const blastOriginalAmount = JSBI.BigInt(10)
const blastCurrencyAmount = CurrencyAmount.fromRawAmount(BLAST, JSBI.exponentiate(blastOriginalAmount, JSBI.BigInt(BLAST.decimals)))

// split input amount by 10%, 40%, 50%
const inputBulletCurrencyAmounts: Array<CurrencyAmount> = [
    inputBulletCurrencyAmount.multiply(new Fraction(10, 100)),
    inputBulletCurrencyAmount.multiply(new Fraction(40, 100)),
    inputBulletCurrencyAmount.multiply(new Fraction(50, 100)),
]

const amountFactorForReserves = JSBI.BigInt(100)
const bulletReserve = CurrencyAmount.fromRawAmount(BULLET, inputBulletCurrencyAmount.multiply(amountFactorForReserves).quotient)
const WETHReserve = CurrencyAmount.fromRawAmount(WETH9[ChainId.MAINNET], wethCurrencyAmount.multiply(amountFactorForReserves).quotient)
const bulletWETHPool = new Pair(bulletReserve, WETHReserve)
const blastReserve = CurrencyAmount.fromRawAmount(BLAST, blastCurrencyAmount.multiply(amountFactorForReserves).quotient)
const WETHBlastPool = new Pair(WETHReserve, blastReserve)

const pools: Pair[] = [bulletWETHPool, WETHBlastPool]
const v2Routes: Array<V2Route> = computeAllV2Routes(tokenIn, tokenOut, pools, 3)

const quoteProvider = new V2QuoteProvider()

describe('QuoteProvider', () => {

    describe('fee-on-transfer flag enabled',  () => {
        const providerConfig: ProviderConfig = { enableFeeOnTransferFeeFetching: true }

        it('should return correct quote for exact in', async () => {
            const {  routesWithQuotes } = await quoteProvider.getQuotesManyExactIn(inputBulletCurrencyAmounts, v2Routes, providerConfig)
            console.log(JSON.stringify(routesWithQuotes))
        })

    })
})
