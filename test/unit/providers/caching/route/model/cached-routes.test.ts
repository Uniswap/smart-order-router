import { Protocol } from '@uniswap/router-sdk';
import { TradeType } from '@uniswap/sdk-core';
import { ChainId, V3RouteWithValidQuote } from '../../../../../../build/main';
import { CachedRoutes, DAI_MAINNET as DAI, USDC_MAINNET as USDC } from '../../../../../../src';
import { getV3RouteWithValidQuoteStub } from '../test-util/mocked-dependencies';

describe('CachedRoutes', () => {
  let v3RouteWithValidQuote: V3RouteWithValidQuote;
  const blockNumber: number = 1;

  beforeEach(() => {
    v3RouteWithValidQuote = getV3RouteWithValidQuoteStub();
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
        TradeType.EXACT_INPUT,
        '1.1'
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
        TradeType.EXACT_INPUT,
        '1.1'
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
        TradeType.EXACT_INPUT,
        '1.1'
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
