import { Token, Price, Fraction } from '@uniswap/sdk-core'
import { Position, priceToClosestTick, TickMath } from '@uniswap/v3-sdk'
import { providers } from 'ethers'
import { AlphaRouter, CurrencyAmount, USDC_MAINNET, WRAPPED_NATIVE_CURRENCY } from '../../../../src'
import { USDC_WETH_MEDIUM } from '../../test-util/mock-data'
import sinon from 'sinon'

describe('The optimal ratio given by the AlphaRouter', () => {
    let mockProvider: sinon.SinonStubbedInstance<providers.BaseProvider>

    it('should be 2,910.75 USDC to 1 WETH for a symmetrical position when the current price is 2,910.75 USDC', () => {
        // Symetrical - current price is half way between lower and upper prices.
        // These prices are aligned with the tick spacing for the pool (60 bps).
        // The midpoint price between 2,858.36 and 2,963.13 is 2,910.745.
        // USDC has six decimals.
        const priceMid = 2_910_745_000
        const priceLower = new Price<Token, Token>(WRAPPED_NATIVE_CURRENCY[1]!, USDC_MAINNET, 1_000_000_000_000_000_000, 2_858_360_000)
        const priceCurrent = new Price<Token, Token>(WRAPPED_NATIVE_CURRENCY[1]!, USDC_MAINNET, 1_000_000_000_000_000_000, priceMid)
        const priceUpper = new Price<Token, Token>(WRAPPED_NATIVE_CURRENCY[1]!, USDC_MAINNET, 1_000_000_000_000_000_000, 2_963_130_000)

        // console.log(`Prices (lower, current, upper): (${priceLower.toFixed(0)}, ${priceCurrent.toFixed(0)}, ${priceUpper.toFixed(0)})`)

        // Ticks based on these prices. Invert lower and upper because of the token order in the pool.
        const tickLower = priceToClosestTick(priceUpper)
        const tickCurrent = priceToClosestTick(priceCurrent)
        const tickUpper = priceToClosestTick(priceLower)

        // (196380, 196544, 196740)
        // console.log(`Ticks (lower, current, upper): (${tickLower}, ${tickCurrent}, ${tickUpper})`)

        const position = new Position({
            pool: USDC_WETH_MEDIUM, // Token 0 is USDC
            tickLower: tickLower,
            tickUpper: tickUpper,
            liquidity: 1 // calculateOptimalRatio() doesn't use the liquidity on the position
        })

        const sqrtRatioX96 = TickMath.getSqrtRatioAtTick(tickCurrent)

        // We want the ratio of token zero (USDC) for token one (WETH)
        const zeroForOne = true

        const alphaRouter = new AlphaRouter({ chainId: 1, provider: mockProvider })

        // Call private method on AlphaRouter.
        const optimalRatio: Fraction = alphaRouter['calculateOptimalRatio'](position, sqrtRatioX96, zeroForOne)

        // 0.000_000_002_975_975_407
        // console.log(`optimalRatio: ${optimalRatio.toFixed(18)}`)

        const oneWeth = CurrencyAmount.fromRawAmount(WRAPPED_NATIVE_CURRENCY[1]!, 1_000_000_000_000_000_000)
        const optimalUsdcForOneWeth = optimalRatio.multiply(oneWeth)

        // 2_975_975_407
        // console.log(`Optimal amount of USDC for a symmetrical position with 1 WETH: ${optimalUsdcForOneWeth.toFixed(0)}`)

        // Out by USDC 65, or 2.2%.
        expect(optimalUsdcForOneWeth.toFixed(0)).toEqual(new Fraction(priceMid).toFixed(0))
    })
})
