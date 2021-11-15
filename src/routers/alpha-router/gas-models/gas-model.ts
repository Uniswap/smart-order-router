import { BigNumber } from '@ethersproject/bignumber';
import { Token } from '@uniswap/sdk-core';
import {
  DAI_MAINNET,
  DAI_RINKEBY_1,
  DAI_RINKEBY_2,
  USDC_MAINNET,
  USDT_MAINNET,
} from '../../../providers/token-provider';
import { IV2PoolProvider } from '../../../providers/v2/pool-provider';
import { IV3PoolProvider } from '../../../providers/v3/pool-provider';
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
    poolProvider: IV3PoolProvider,
    inTermsOfToken: Token
  ): Promise<IGasModel<V3RouteWithValidQuote>>;
}

export abstract class IV2GasModelFactory {
  public abstract buildGasModel(
    chainId: number,
    gasPriceWei: BigNumber,
    poolProvider: IV2PoolProvider,
    token: Token
  ): Promise<IGasModel<V2RouteWithValidQuote>>;
}
