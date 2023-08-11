import sinon from 'sinon';
import {
  USDC_MAINNET,
  V3PoolProvider,
  WRAPPED_NATIVE_CURRENCY,
} from '../../../../../src';
import {
  getHighestLiquidityV3NativePool,
  getHighestLiquidityV3USDPool,
} from '../../../../../src/util/gas-factory-helpers';
import {
  buildMockV3PoolAccessor,
  USDC_DAI_LOW,
  USDC_WETH_HIGH_LIQ_HIGH,
  USDC_WETH_LOW_LIQ_LOW,
  USDC_WETH_MED_LIQ_MEDIUM,
} from '../../../../test-util/mock-data';

const mockUSDCNativePools = [
  USDC_WETH_LOW_LIQ_LOW,
  USDC_WETH_MED_LIQ_MEDIUM,
  USDC_WETH_HIGH_LIQ_HIGH,
];

describe('getHighestLiquidity pool tests', () => {
  let mockPoolProvider: sinon.SinonStubbedInstance<V3PoolProvider>;

  beforeEach(() => {
    mockPoolProvider = sinon.createStubInstance(V3PoolProvider);
    mockPoolProvider.getPools.resolves(
      buildMockV3PoolAccessor(mockUSDCNativePools)
    );
  });

  describe('getHighestLiquidityV3NativePool', () => {
    it('should return the highest native liquidity pool', async () => {
      const nativeAmountPool = await getHighestLiquidityV3NativePool(
        USDC_MAINNET,
        mockPoolProvider as unknown as V3PoolProvider
      );
      expect(nativeAmountPool).toStrictEqual(USDC_WETH_HIGH_LIQ_HIGH);
    });

    it('should return null if there are no native pools with the specified token', async () => {
      const mockPoolProvider = sinon.createStubInstance(V3PoolProvider);
      mockPoolProvider.getPools.resolves(
        buildMockV3PoolAccessor([USDC_DAI_LOW])
      );
      const nativeAmountPool = await getHighestLiquidityV3NativePool(
        USDC_MAINNET,
        mockPoolProvider as unknown as V3PoolProvider
      );
      expect(nativeAmountPool).toBeNull();
    });
  });

  describe('getHighestLiquidityV3USDPool', () => {
    it('should return the highest usd liquidity pool', async () => {
      const usdPool = await getHighestLiquidityV3USDPool(
        1,
        mockPoolProvider as unknown as V3PoolProvider
      );
      expect(usdPool).toStrictEqual(USDC_WETH_HIGH_LIQ_HIGH);
    });

    it('should throw error if there are no usd native pools', async () => {
      const mockPoolProvider = sinon.createStubInstance(V3PoolProvider);
      mockPoolProvider.getPools.resolves(
        buildMockV3PoolAccessor([USDC_DAI_LOW])
      );
      await expect(
        getHighestLiquidityV3USDPool(
          1,
          mockPoolProvider as unknown as V3PoolProvider
        )
      ).rejects.toThrowError(
        `Could not find a USD/${WRAPPED_NATIVE_CURRENCY[1].symbol} pool for computing gas costs.`
      );
    });
  });
});
