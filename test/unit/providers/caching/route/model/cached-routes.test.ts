import { BigNumber } from '@ethersproject/bignumber';
import { Protocol } from '@uniswap/router-sdk';
import { TradeType } from '@uniswap/sdk-core';
import { Pair } from '@uniswap/v2-sdk';
import { Pool } from '@uniswap/v3-sdk';
import sinon from 'sinon';
import { ChainId, DAI_MAINNET, USDC_MAINNET, V3Route, V3RouteWithValidQuote } from '../../../../../../build/main';
import {
  CachedRoutes,
  CurrencyAmount,
  DAI_MAINNET as DAI,
  IGasModel,
  USDC_MAINNET as USDC,
  V2PoolProvider,
  V2RouteWithValidQuote,
  V3PoolProvider
} from '../../../../../../src';
import {
  buildMockV2PoolAccessor,
  buildMockV3PoolAccessor,
  DAI_USDT,
  DAI_USDT_LOW,
  USDC_DAI,
  USDC_DAI_LOW,
  USDC_DAI_MEDIUM,
  USDC_WETH,
  USDC_WETH_LOW,
  WBTC_WETH,
  WETH9_USDT_LOW,
  WETH_USDT
} from '../../../../../test-util/mock-data';

describe('CachedRoutes', () => {
  let mockV3GasModel: sinon.SinonStubbedInstance<
    IGasModel<V3RouteWithValidQuote>
  >;
  let mockV3PoolProvider: sinon.SinonStubbedInstance<V3PoolProvider>;
  let mockV2PoolProvider: sinon.SinonStubbedInstance<V2PoolProvider>;
  let mockV2GasModel: sinon.SinonStubbedInstance<
    IGasModel<V2RouteWithValidQuote>
  >;
  let v3RouteWithValidQuote: V3RouteWithValidQuote;
  const blockNumber: number = 1;

  beforeEach(() => {
    mockV3GasModel = {
      estimateGasCost: sinon.stub(),
    };
    mockV3GasModel.estimateGasCost.callsFake((r) => {
      return {
        gasEstimate: BigNumber.from(10000),
        gasCostInToken: CurrencyAmount.fromRawAmount(r.quoteToken, 0),
        gasCostInUSD: CurrencyAmount.fromRawAmount(USDC, 0),
      };
    });

    mockV3PoolProvider = sinon.createStubInstance(V3PoolProvider);
    const v3MockPools = [
      USDC_DAI_LOW,
      USDC_DAI_MEDIUM,
      USDC_WETH_LOW,
      WETH9_USDT_LOW,
      DAI_USDT_LOW,
    ];
    mockV3PoolProvider.getPools.resolves(buildMockV3PoolAccessor(v3MockPools));
    mockV3PoolProvider.getPoolAddress.callsFake((tA, tB, fee) => ({
      poolAddress: Pool.getAddress(tA, tB, fee),
      token0: tA,
      token1: tB,
    }));

    const v2MockPools = [DAI_USDT, USDC_WETH, WETH_USDT, USDC_DAI, WBTC_WETH];
    mockV2PoolProvider = sinon.createStubInstance(V2PoolProvider);
    mockV2PoolProvider.getPools.resolves(buildMockV2PoolAccessor(v2MockPools));
    mockV2PoolProvider.getPoolAddress.callsFake((tA, tB) => ({
      poolAddress: Pair.getAddress(tA, tB),
      token0: tA,
      token1: tB,
    }));

    mockV2GasModel = {
      estimateGasCost: sinon.stub(),
    };
    mockV2GasModel.estimateGasCost.callsFake((r: V2RouteWithValidQuote) => {
      return {
        gasEstimate: BigNumber.from(10000),
        gasCostInToken: CurrencyAmount.fromRawAmount(r.quoteToken, 0),
        gasCostInUSD: CurrencyAmount.fromRawAmount(USDC, 0),
      };
    });

    const route = new V3Route([USDC_DAI_MEDIUM], USDC_MAINNET, DAI_MAINNET);
    // TODO: V3RouteWithValidQuote is too overloaded, do we really need all those arguments? Feels like a leaky abstraction.
    v3RouteWithValidQuote = new V3RouteWithValidQuote({
      amount: CurrencyAmount.fromRawAmount(USDC, 100),
      rawQuote: BigNumber.from(100),
      sqrtPriceX96AfterList: [BigNumber.from(1)],
      initializedTicksCrossedList: [1],
      quoterGasEstimate: BigNumber.from(100000),
      percent: 100,
      route,
      gasModel: mockV3GasModel,
      quoteToken: DAI,
      tradeType: TradeType.EXACT_INPUT,
      v3PoolProvider: mockV3PoolProvider,
    });

  });

  describe('#fromRoutesWithValidQuotes', () => {
    it('creates the instance', () => {
      const cachedRoutes = CachedRoutes.fromRoutesWithValidQuotes(
        [v3RouteWithValidQuote],
        ChainId.MAINNET,
        USDC,
        DAI,
        [Protocol.V2, Protocol.V3, Protocol.MIXED],
        blockNumber,
        TradeType.EXACT_INPUT
      );

      expect(cachedRoutes).toBeInstanceOf(CachedRoutes);
    });

    it('returns undefined when routes are empty', () => {
      const cachedRoutes = CachedRoutes.fromRoutesWithValidQuotes(
        [],
        ChainId.MAINNET,
        USDC,
        DAI,
        [Protocol.V2, Protocol.V3, Protocol.MIXED],
        blockNumber,
        TradeType.EXACT_INPUT
      );

      expect(cachedRoutes).toBeUndefined();
    });
  });

  describe('instance functions', () => {
    let cachedRoutes: CachedRoutes;

    beforeEach(() => {
      cachedRoutes = CachedRoutes.fromRoutesWithValidQuotes(
        [v3RouteWithValidQuote],
        ChainId.MAINNET,
        USDC,
        DAI,
        [Protocol.V2, Protocol.V3, Protocol.MIXED],
        blockNumber,
        TradeType.EXACT_INPUT
      )!;
    });

    describe('.blocksToLive', () => {
      it('defaults to 0', () => {
        expect(cachedRoutes.blocksToLive).toEqual(0);
      });

      it('can be set', () => {
        cachedRoutes.blocksToLive = 10;
        expect(cachedRoutes.blocksToLive).toEqual(10);
      });
    });

    describe('.notExpired', () => {
      describe('with default blocksToLive', () => {
        it('returns true when blockNumber is still the same as the one in the cached routes', () => {
          expect(cachedRoutes.notExpired(blockNumber)).toBeTruthy();
        });

        it('returns false when blockNumber has advanced from the one in the cached routes', () => {
          expect(cachedRoutes.notExpired(blockNumber + 1)).toBeFalsy();
        });
      });

      describe('after blocksToLive is updated', () => {
        beforeEach(() => {
          cachedRoutes.blocksToLive = 5;
        });

        it('returns true when blockNumber is still the same as the one in the cached routes', () => {
          expect(cachedRoutes.notExpired(blockNumber)).toBeTruthy();
        });

        it('returns true when blockNumber has advanced from the one in the cached routes less than BTL', () => {
          expect(cachedRoutes.notExpired(blockNumber + 1)).toBeTruthy();
        });

        it('returns true when blockNumber has advanced as many as blocksToLive number of blocks', () => {
          expect(cachedRoutes.notExpired(blockNumber + cachedRoutes.blocksToLive)).toBeTruthy();
        });

        it('returns false when blockNumber has advanced one more than BTL', () => {
          expect(cachedRoutes.notExpired(blockNumber + cachedRoutes.blocksToLive + 1)).toBeFalsy();
        });
      });
    });
  });
});