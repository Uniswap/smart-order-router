import { BigNumber } from '@ethersproject/bignumber';
import { BaseProvider } from '@ethersproject/providers';
import { ChainId } from '@uniswap/sdk-core';

import { CurrencyAmount, WRAPPED_NATIVE_CURRENCY } from '../../../../util';
import { V4RouteWithValidQuote } from '../../entities';
import {
  BuildOnChainGasModelFactoryType,
  GasModelProviderConfig,
  IGasModel,
  IOnChainGasModelFactory,
} from '../gas-model';
import { TickBasedHeuristicGasModelFactory } from '../tick-based-heuristic-gas-model';


export class V4HeuristicGasModelFactory
  extends TickBasedHeuristicGasModelFactory<V4RouteWithValidQuote>
  implements IOnChainGasModelFactory<V4RouteWithValidQuote>
{
  constructor(provider: BaseProvider) {
    super(provider);
  }

  public async buildGasModel({
    chainId,
    gasPriceWei,
    pools,
    amountToken,
    quoteToken,
    v2poolProvider,
    l2GasDataProvider,
    providerConfig,
  }: BuildOnChainGasModelFactoryType): Promise<
    IGasModel<V4RouteWithValidQuote>
  > {
    return await super.buildGasModelInternal({
      chainId,
      gasPriceWei,
      pools,
      amountToken,
      quoteToken,
      v2poolProvider,
      l2GasDataProvider,
      providerConfig,
    });
  }

  protected override estimateGas(
    routeWithValidQuote: V4RouteWithValidQuote,
    gasPriceWei: BigNumber,
    chainId: ChainId,
    providerConfig?: GasModelProviderConfig
  ) {
    const totalInitializedTicksCrossed = this.totalInitializedTicksCrossed(
      routeWithValidQuote.initializedTicksCrossedList
    );

    const baseGasUse = routeWithValidQuote.quoterGasEstimate
      // we still need the gas override for native wrap/unwrap, because quoter doesn't simulate on universal router level
      .add(providerConfig?.additionalGasOverhead ?? BigNumber.from(0));

    const baseGasCostWei = gasPriceWei.mul(baseGasUse);

    const wrappedCurrency = WRAPPED_NATIVE_CURRENCY[chainId]!;

    const totalGasCostNativeCurrency = CurrencyAmount.fromRawAmount(
      wrappedCurrency,
      baseGasCostWei.toString()
    );

    return {
      totalGasCostNativeCurrency,
      totalInitializedTicksCrossed,
      baseGasUse,
    };
  }
}
