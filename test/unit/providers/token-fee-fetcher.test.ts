import { ID_TO_PROVIDER } from '../../../src';
import { JsonRpcProvider } from '@ethersproject/providers';
import { ChainId, WETH9 } from '@uniswap/sdk-core';
import {
  ITokenFeeFetcher,
  OnChainTokenFeeFetcher
} from '../../../src/providers/token-fee-fetcher';
import { BITBOY, BULLET } from '../../test-util/mock-data';
import dotenv from 'dotenv';

dotenv.config();

describe('TokenFeeFetcher', () => {
  let tokenFeeFetcher: ITokenFeeFetcher;

  beforeAll(async () => {
    const chain = ChainId.MAINNET;
    const chainProvider = ID_TO_PROVIDER(chain);
    const provider = new JsonRpcProvider(chainProvider, chain);

    tokenFeeFetcher = new OnChainTokenFeeFetcher(chain, provider);
  });

  it('Fetch WETH and BITBOY, should only return BITBOY', async () => {
    const tokenFeeMap = await tokenFeeFetcher.fetchFees([WETH9[ChainId.MAINNET]!.address, BITBOY.address])
    expect(tokenFeeMap).not.toContain(WETH9[ChainId.MAINNET]!.address)
    expect(tokenFeeMap[BITBOY.address]).toBeDefined()
    expect(tokenFeeMap[BITBOY.address]?.buyFeeBps).toEqual(BITBOY.buyFeeBps)
    expect(tokenFeeMap[BITBOY.address]?.sellFeeBps).toEqual(BITBOY.sellFeeBps)
  });

  it('Fetch BULLET and BITBOY, should return BOTH', async () => {
    const tokenFeeMap = await tokenFeeFetcher.fetchFees([BULLET.address, BITBOY.address])
    expect(tokenFeeMap[BULLET.address]).toBeDefined()
    expect(tokenFeeMap[BULLET.address]?.buyFeeBps).toEqual(BULLET.buyFeeBps)
    expect(tokenFeeMap[BULLET.address]?.sellFeeBps).toEqual(BULLET.sellFeeBps)
    expect(tokenFeeMap[BITBOY.address]).toBeDefined()
    expect(tokenFeeMap[BITBOY.address]?.buyFeeBps).toEqual(BITBOY.buyFeeBps)
    expect(tokenFeeMap[BITBOY.address]?.sellFeeBps).toEqual(BITBOY.sellFeeBps)
  });
});
