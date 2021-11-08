import { BigNumber } from '@ethersproject/bignumber';
import { Token } from '@uniswap/sdk-core';
import {
  DAI_MAINNET,
  DAI_RINKEBY_1,
  DAI_RINKEBY_2,
  USDC_MAINNET,
  USDT_MAINNET,
} from '../../../providers/token-provider';
import { V2PoolAccessor } from '../../../providers/v2/pool-provider';
import { V3PoolAccessor } from '../../../providers/v3/pool-provider';
import { CurrencyAmount } from '../../../util/amounts';
import { ChainId } from '../../../util/chains';
import {
  RouteWithValidQuote,
  V2RouteWithValidQuote,
  V3RouteWithValidQuote,
} from '../entities/route-with-valid-quote';

export const usdGasTokensByChain: { [chainId in ChainId]?: Token[] } = {
  [ChainId.MAINNET]: [DAI_MAINNET, USDC_MAINNET, USDT_MAINNET],
  [ChainId.RINKEBY]: [DAI_RINKEBY_1, DAI_RINKEBY_2],
};

export type IGasModel<TRouteWithValidQuote extends RouteWithValidQuote> = {
  estimateGasCost(routeWithValidQuote: TRouteWithValidQuote): {
    gasEstimate: BigNumber;
    gasCostInToken: CurrencyAmount;
    gasCostInUSD: CurrencyAmount;
  };
};

export abstract class IV3GasModelFactory {
  public abstract buildGasModel(
    chainId: number,
    gasPriceWei: BigNumber,
    poolProvider: V3PoolAccessor,
    inTermsOfToken: Token
  ): IGasModel<V3RouteWithValidQuote>;
}

export abstract class IV2GasModelFactory {
  public abstract buildGasModel(
    chainId: number,
    gasPriceWei: BigNumber,
    poolProvider: V2PoolAccessor,
    inTermsOfToken: Token
  ): IGasModel<V2RouteWithValidQuote>;
}
