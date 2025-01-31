import {
  amendMixedRoutesMaxHops
} from '../../../../../src/routers/alpha-router/functions/amend-mixed-routes-max-hops';
import {
  DAI_USDT_V4_LOW,
  ETH_USDT_V4_LOW, USDC_MOCK_LOW,
  USDC_WETH_LOW, WETH9_USDT_V4_LOW
} from '../../../../test-util/mock-data';

describe('amend mixed routes max hops', () => {
  it('v3 wrapped native pool and v4 native pool', () => {
    const maxHops = amendMixedRoutesMaxHops([USDC_WETH_LOW, ETH_USDT_V4_LOW], 1);
    expect(maxHops).toEqual(2);
  });

  it('v3 wrapped native pool and v4 wrapped pool', () => {
    const maxHops = amendMixedRoutesMaxHops([USDC_WETH_LOW, WETH9_USDT_V4_LOW], 1);
    expect(maxHops).toEqual(1);
  });

  it('v3 normal pool and v4 normal pool', () => {
    const maxHops = amendMixedRoutesMaxHops([USDC_MOCK_LOW, DAI_USDT_V4_LOW], 1);
    expect(maxHops).toEqual(1);
  });
})
