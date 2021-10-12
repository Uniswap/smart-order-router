import { BigNumber } from '@ethersproject/bignumber';
import { Token } from '@uniswap/sdk-core';
import { V3PoolAccessor } from '../../../providers/v3/pool-provider';
import { CurrencyAmount } from '../../../util/amounts';
import { V3RouteWithValidQuote } from '../entities/route-with-valid-quote';

export type GasModel = {
  estimateGasCost(routeWithValidQuote: V3RouteWithValidQuote): {
    gasEstimate: BigNumber;
    gasCostInToken: CurrencyAmount;
    gasCostInUSD: CurrencyAmount;
  };
};

export abstract class IGasModelFactory {
  public abstract buildGasModel(
    chainId: number,
    gasPriceWei: BigNumber,
    poolProvider: V3PoolAccessor,
    inTermsOfToken: Token
  ): GasModel;
}
