import { BaseProvider } from '@ethersproject/providers';
import { V4RouteWithValidQuote } from '../../entities';
import {
  BuildOnChainGasModelFactoryType,
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
}
