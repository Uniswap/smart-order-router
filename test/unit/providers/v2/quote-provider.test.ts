import { CurrencyAmount, V2QuoteProvider, V2Route } from '../../../../src';
import { ProviderConfig } from '../../../../src/providers/provider';

describe('QuoteProvider', () => {
    const currencyAmounts: CurrencyAmount[] = []
    const v2Routes: V2Route[] = []

    const quoteProvider = new V2QuoteProvider()

    describe('fee-on-transfer flag enabled', async () => {
        const providerConfig: ProviderConfig = { enableFeeOnTransferFeeFetching: true }

        it('should return correct quote for exact in', async () => {

            const {  routesWithQuotes } = await quoteProvider.getQuotesManyExactIn(currencyAmounts, v2Routes, providerConfig)
            routesWithQuotes
        })

    })
})
