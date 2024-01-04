import { BigNumber } from '@ethersproject/bignumber';
import { ArbitrumGasDataProvider } from '../../../../src/providers/v3/gas-data-provider';
import { BaseProvider } from '@ethersproject/providers';
import sinon from 'sinon';

class MockProvider extends BaseProvider {
  _isProvider: boolean = true
}

describe('arbitrum gas data provider', () => {

  let mockProvider: sinon.SinonStubbedInstance<MockProvider>;
  let arbGasDataProvider: ArbitrumGasDataProvider;

  beforeAll(() => {
    mockProvider = sinon.createStubInstance(MockProvider)
    mockProvider._isProvider = true
    mockProvider.call.resolves("0x00000000000000000000000000000000000000000000000000003eb61132144000000000000000000000000000000000000000000000000000000072ac022fb0000000000000000000000000000000000000000000000000000001d1a94a20000000000000000000000000000000000000000000000000000000000005f5e10000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000005f5e100");
    arbGasDataProvider = new ArbitrumGasDataProvider(42161, mockProvider)
  });

  test('get correct gas data', async () => {
    await expect(arbGasDataProvider.getGasData()).resolves.toMatchObject({
      perArbGasTotal: BigNumber.from('0x05f5e100'),
      perL1CalldataFee: BigNumber.from('0x072ac022fb'),
      perL2TxFee: BigNumber.from('0x3eb611321440'),
    });
  });
});
