import { BigNumber } from '@ethersproject/bignumber';
import { Token } from '@uniswap/sdk-core';
import { PoolAccessor } from '../../../providers/pool-provider';
import { ITokenListProvider } from '../../../providers/token-list-provider';
import { CurrencyAmount } from '../../../util/amounts';
import { RouteWithValidQuote } from '../entities/route-with-valid-quote';

export type GasModel = {
  estimateGasCost(routeWithValidQuote: RouteWithValidQuote): {
    gasEstimate: BigNumber;
    gasCostInToken: CurrencyAmount;
    gasCostInUSD: CurrencyAmount;
  };
};

export abstract class IGasModelFactory {
  public buildGasModel(
    chainId: number,
    gasPriceWei: BigNumber,
    tokenProvider: ITokenListProvider,
    poolProvider: PoolAccessor,
    inTermsOfToken: Token
  ) {
    return this._buildGasModel(
      chainId,
      gasPriceWei,
      tokenProvider,
      poolProvider,
      inTermsOfToken
    );
  }

  protected abstract _buildGasModel(
    chainId: number,
    gasPriceWei: BigNumber,
    tokenProvider: ITokenListProvider,
    poolProvider: PoolAccessor,
    token: Token
  ): GasModel;
}
