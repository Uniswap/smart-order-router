import { ChainId, Token } from '@uniswap/sdk-core';
import {
  CurrencyAmount,
  ID_TO_PROVIDER,
  OnChainQuoteProvider, parseAmount,
  UniswapMulticallProvider, V4Route
} from '../../../src';
import { JsonRpcProvider } from '@ethersproject/providers';
import { Pool } from '@uniswap/v4-sdk';
import { ADDRESS_ZERO } from '@uniswap/v3-sdk';
import dotenv from 'dotenv';
import JSBI from 'jsbi';
import { ProviderConfig } from '../../../src/providers/provider';

dotenv.config();

describe('on chain quote provider', () => {
  describe('v4 quote test', () => {
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
    const op = new Token(
        chain,
        '0xc268035619873d85461525f5fdb792dd95982161',
        18,
        'OP',
        'Optimism'
      )
    const usdc = new Token(
      chain,
      '0xbe2a7f5acecdc293bf34445a0021f229dd2edd49',
      6,
      'USDC',
      'USD'
    )
    const amountIns = [
      parseAmount("0.01", op)
    ]
    const routes = [
      new V4Route(
  [new Pool(
          usdc,
          op,
          500,
          10,
          ADDRESS_ZERO,
    79307390518005047181445936088,
    10000000000000000000000,
    19,
        )],
        op,
        usdc,
      )
    ]

    it('exact in quote and then exact out quote to match original exact in currency amount', async () => {
      const providerConfig: ProviderConfig = {
        blockNumber: 6582517,
      }

      const exactInQuotes = await onChainQuoteProvider.getQuotesManyExactIn(amountIns, routes, providerConfig)
      // @ts-ignore
      const amountOuts = [CurrencyAmount.fromRawAmount(usdc, JSBI.BigInt(exactInQuotes.routesWithQuotes[0][1][0].quote))]
      const exactOutQuotes = await onChainQuoteProvider.getQuotesManyExactOut(amountOuts, routes, providerConfig)
      // @ts-ignore
      const opQuoteAmount = CurrencyAmount.fromRawAmount(op, exactOutQuotes.routesWithQuotes[0][1][0].quote)
      // @ts-ignore
      expect(opQuoteAmount.equalTo(amountIns[0])).toBeTruthy()
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
        op,
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
        usdc,
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
        op,
        usdc,
      )

      const exactInPathKey = onChainQuoteProvider.convertV4RouteToPathKey(v4Route, false)
      expect(exactInPathKey.length).toEqual(2)
      expect(exactInPathKey[0]!.fee).toStrictEqual(opMaticPool.fee)
      expect(exactInPathKey[0]!.hooks).toStrictEqual(opMaticPool.hooks)
      expect(exactInPathKey[0]!.tickSpacing).toStrictEqual(opMaticPool.tickSpacing)
      expect(exactInPathKey[0]!.intermediateCurrency).toStrictEqual(matic.address)

      expect(exactInPathKey[1]!.fee).toStrictEqual(maticUsdcPool.fee)
      expect(exactInPathKey[1]!.hooks).toStrictEqual(maticUsdcPool.hooks)
      expect(exactInPathKey[1]!.tickSpacing).toStrictEqual(maticUsdcPool.tickSpacing)
      expect(exactInPathKey[1]!.intermediateCurrency).toStrictEqual(usdc.address)

      const exactOutPathKey = onChainQuoteProvider.convertV4RouteToPathKey(v4Route, true)
      expect(exactOutPathKey.length).toEqual(2)
      expect(exactOutPathKey[0]!.fee).toStrictEqual(opMaticPool.fee)
      expect(exactOutPathKey[0]!.hooks).toStrictEqual(opMaticPool.hooks)
      expect(exactOutPathKey[0]!.tickSpacing).toStrictEqual(opMaticPool.tickSpacing)
      expect(exactOutPathKey[0]!.intermediateCurrency).toStrictEqual(op.address)

      expect(exactOutPathKey[1]!.fee).toStrictEqual(maticUsdcPool.fee)
      expect(exactOutPathKey[1]!.hooks).toStrictEqual(maticUsdcPool.hooks)
      expect(exactOutPathKey[1]!.tickSpacing).toStrictEqual(maticUsdcPool.tickSpacing)
      expect(exactOutPathKey[1]!.intermediateCurrency).toStrictEqual(matic.address)
    })
  })
});
