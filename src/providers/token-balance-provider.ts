import { JsonRpcProvider } from '@ethersproject/providers';
import { Erc20__factory } from '../types/other/factories/Erc20__factory';
import { ChainId, CurrencyAmount } from '../util';

export class TokenBalanceProvider {
  provider: JsonRpcProvider;
  chainId: ChainId;
  constructor(provider, chainId) {
    this.provider = provider;
    this.chainId = chainId;
  }
  async getTokenBalance(token, address) {
    const tokenContract = Erc20__factory.connect(token.address, this.provider);
    const balance = await tokenContract.balanceOf(address);
    return CurrencyAmount.fromRawAmount(token, balance.toString());
  }
}
