import { ID_TO_PROVIDER } from '../../../src';
import { JsonRpcProvider } from '@ethersproject/providers';
import { ChainId, Token, WETH9 } from '@uniswap/sdk-core';
import {
  OnChainTokenFeeFetcher
} from '../../../src/providers/token-fee-fetcher';
import { BITBOY, BOYS, BULLET, DFNDR } from '../../test-util/mock-data';
import dotenv from 'dotenv';
const each = require("jest-each").default;

dotenv.config();

describe('TokenFeeFetcher', () => {
  each([
    [ChainId.MAINNET, WETH9[ChainId.MAINNET]!, BITBOY, false, true],
    [ChainId.MAINNET, WETH9[ChainId.MAINNET]!, DFNDR, true, false],
    [ChainId.BASE, WETH9[ChainId.BASE]!, BOYS, false, false],
  ]).it('Fetch non-FOT and FOT, should only return FOT', async (chain: ChainId, inputToken: Token, outputToken: Token, feeTakenOnTransfer?: boolean, externalTransferFailed?: boolean) => {
    const chainProvider = ID_TO_PROVIDER(chain);
    const provider = new JsonRpcProvider(chainProvider, chain);

    const tokenFeeFetcher = new OnChainTokenFeeFetcher(chain, provider);
    const tokenFeeMap = await tokenFeeFetcher.fetchFees([inputToken.address, outputToken.address])

    expect(tokenFeeMap).not.toContain(inputToken.address)
    expect(tokenFeeMap[outputToken.address]).toBeDefined()
    expect(tokenFeeMap[outputToken.address]?.buyFeeBps).toEqual(outputToken.buyFeeBps)
    expect(tokenFeeMap[outputToken.address]?.sellFeeBps).toEqual(outputToken.sellFeeBps)
    expect(tokenFeeMap[outputToken.address]?.feeTakenOnTransfer).toEqual(feeTakenOnTransfer)
    expect(tokenFeeMap[outputToken.address]?.externalTransferFailed).toEqual(externalTransferFailed)
  });

  each([
    [ChainId.MAINNET, BULLET, BITBOY],
  ]).it('Fetch FOT and FOT, should return BOTH', async (chain: ChainId, inputToken: Token, outputToken: Token) => {
    const chainProvider = ID_TO_PROVIDER(chain);
    const provider = new JsonRpcProvider(chainProvider, chain);

    const tokenFeeFetcher = new OnChainTokenFeeFetcher(chain, provider);
    const tokenFeeMap = await tokenFeeFetcher.fetchFees([inputToken.address, outputToken.address])

    expect(tokenFeeMap[inputToken.address]).toBeDefined()
    expect(tokenFeeMap[inputToken.address]?.buyFeeBps).toEqual(inputToken.buyFeeBps)
    expect(tokenFeeMap[inputToken.address]?.sellFeeBps).toEqual(inputToken.sellFeeBps)
    expect(tokenFeeMap[outputToken.address]).toBeDefined()
    expect(tokenFeeMap[outputToken.address]?.buyFeeBps).toEqual(outputToken.buyFeeBps)
    expect(tokenFeeMap[outputToken.address]?.sellFeeBps).toEqual(outputToken.sellFeeBps)
  });
});
