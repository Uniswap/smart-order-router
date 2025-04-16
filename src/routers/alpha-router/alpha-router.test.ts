import { ChainId } from '@uniswap/sdk-core';
import { AlphaRouter } from './alpha-router';

describe('Alpha Router', () => {
  it('should be a placeholder test', () => {
    const chainId = ChainId.WORLDCHAIN;
    const alphaRouter = new AlphaRouter({
      chainId,
      provider: hardhat.providers[0]!,
      multicall2Provider,
      v2PoolProvider,
      v3PoolProvider,
      v4PoolProvider,
      simulator,
    });
  });
});
