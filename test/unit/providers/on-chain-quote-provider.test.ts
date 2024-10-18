import { ChainId, Token } from '@uniswap/sdk-core';
import {
  CurrencyAmount,
  ID_TO_PROVIDER,
  OnChainQuoteProvider, parseAmount,
  UniswapMulticallProvider, V4_SEPOLIA_TEST_A, V4_SEPOLIA_TEST_B,
  V4Route,
  MixedRoute
} from '../../../src';
import { JsonRpcProvider } from '@ethersproject/providers';
import { encodeRouteToPath, Pool } from '@uniswap/v4-sdk';
import { ADDRESS_ZERO } from '@uniswap/v3-sdk';
import dotenv from 'dotenv';
import JSBI from 'jsbi';
import { ProviderConfig } from '../../../src/providers/provider';

dotenv.config();

describe('on chain quote provider', () => {
  // skip for now, because SOR updated state view and quoter address
  describe.skip('v4 quote test', () => {
    const chain = ChainId.SEPOLIA;
    const chainProvider = ID_TO_PROVIDER(chain);
    const provider = new JsonRpcProvider(chainProvider, chain);
    const multicall2Provider = new UniswapMulticallProvider(
      chain,
      provider
    );
    const onChainQuoteProvider = new OnChainQuoteProvider(
      chain,
      provider,
      multicall2Provider,
    );
    const mockA = V4_SEPOLIA_TEST_A
    const mockB = V4_SEPOLIA_TEST_B
    const amountIns = [
      parseAmount("0.01", mockA)
    ]
    const v4Routes = [
      new V4Route(
  [new Pool(
          mockB,
          mockA,
          3000,
          60,
          ADDRESS_ZERO,
    79186511702831612165570076748,
    100000000000000000000,
    -11,
        )],
        mockA,
        mockB,
      )
    ]
    const mixedRoutes = [
      new MixedRoute(
        [new Pool(
          mockB,
          mockA,
          3000,
          60,
          ADDRESS_ZERO,
          79186511702831612165570076748,
          100000000000000000000,
          -11,
        )],
        mockA,
        mockB,
      )
    ]

    it('exact in quote and then exact out quote to match original exact in currency amount', async () => {
      const providerConfig: ProviderConfig = {
        blockNumber: 6724128,
      }

      const exactInQuotes = await onChainQuoteProvider.getQuotesManyExactIn(amountIns, v4Routes, providerConfig)
      // @ts-ignore
      const amountOuts = [CurrencyAmount.fromRawAmount(mockB, JSBI.BigInt(exactInQuotes.routesWithQuotes[0][1][0].quote))]
      const exactOutQuotes = await onChainQuoteProvider.getQuotesManyExactOut(amountOuts, v4Routes, providerConfig)
      // @ts-ignore
      const opQuoteAmount = CurrencyAmount.fromRawAmount(mockA, exactOutQuotes.routesWithQuotes[0][1][0].quote)
      // @ts-ignore
      expect(opQuoteAmount.equalTo(amountIns[0])).toBeTruthy()

      const mixedExactInQuotes = await onChainQuoteProvider.getQuotesManyExactIn(amountIns, mixedRoutes, providerConfig)
      // @ts-ignore
      const mixedAmountOuts = [CurrencyAmount.fromRawAmount(mockB, JSBI.BigInt(mixedExactInQuotes.routesWithQuotes[0][1][0].quote))]
      // @ts-ignore
      expect(mixedAmountOuts[0].equalTo(amountOuts[0])).toBeTruthy()
    })

    it('convert v4 route to path key', () => {
      const matic = new Token(
        chain,
        '0x5f1c75abbb24a6e27e44c9055f50f874dbe9d8da',
        18,
        'MATIC',
        'MATIC'
      )
      const opMaticPool = new Pool(
        mockA,
        matic,
        500,
        10,
        ADDRESS_ZERO,
        79307390518005047181445936088,
        10000000000000000000000,
        19,
      )
      const maticUsdcPool = new Pool(
        matic,
        mockB,
        500,
        10,
        ADDRESS_ZERO,
        79307390518005047181445936088,
        10000000000000000000000,
        19,
      )

      const v4Route = new V4Route(
        [
          opMaticPool,
          maticUsdcPool
        ],
        mockA,
        mockB,
      )

      const exactInPathKey = encodeRouteToPath(v4Route, false)
      expect(exactInPathKey.length).toEqual(2)
      expect(exactInPathKey[0]!.fee).toStrictEqual(opMaticPool.fee)
      expect(exactInPathKey[0]!.hooks).toStrictEqual(opMaticPool.hooks)
      expect(exactInPathKey[0]!.tickSpacing).toStrictEqual(opMaticPool.tickSpacing)
      expect(exactInPathKey[0]!.intermediateCurrency).toStrictEqual(matic.address)

      expect(exactInPathKey[1]!.fee).toStrictEqual(maticUsdcPool.fee)
      expect(exactInPathKey[1]!.hooks).toStrictEqual(maticUsdcPool.hooks)
      expect(exactInPathKey[1]!.tickSpacing).toStrictEqual(maticUsdcPool.tickSpacing)
      expect(exactInPathKey[1]!.intermediateCurrency).toStrictEqual(mockB.address)

      const exactOutPathKey = encodeRouteToPath(v4Route, true)
      expect(exactOutPathKey.length).toEqual(2)
      expect(exactOutPathKey[0]!.fee).toStrictEqual(opMaticPool.fee)
      expect(exactOutPathKey[0]!.hooks).toStrictEqual(opMaticPool.hooks)
      expect(exactOutPathKey[0]!.tickSpacing).toStrictEqual(opMaticPool.tickSpacing)
      expect(exactOutPathKey[0]!.intermediateCurrency).toStrictEqual(mockA.address)

      expect(exactOutPathKey[1]!.fee).toStrictEqual(maticUsdcPool.fee)
      expect(exactOutPathKey[1]!.hooks).toStrictEqual(maticUsdcPool.hooks)
      expect(exactOutPathKey[1]!.tickSpacing).toStrictEqual(maticUsdcPool.tickSpacing)
      expect(exactOutPathKey[1]!.intermediateCurrency).toStrictEqual(matic.address)
    })
  })
});
