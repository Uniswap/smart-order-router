import { V3RouteWithValidQuote } from '../../entities/route-with-valid-quote';
import { BuildOnChainGasModelFactoryType, IGasModel } from '../gas-model';

import { BaseProvider } from '@ethersproject/providers';
import { TickBasedHeuristicGasModelFactory } from '../tick-based-heuristic-gas-model';

/**
 * Computes a gas estimate for a V3 swap using heuristics.
 * Considers number of hops in the route, number of ticks crossed
 * and the typical base cost for a swap.
 *
 * We get the number of ticks crossed in a swap from the QuoterV2
 * contract.
 *
 * We compute gas estimates off-chain because
 *  1/ Calling eth_estimateGas for a swaps requires the caller to have
 *     the full balance token being swapped, and approvals.
 *  2/ Tracking gas used using a wrapper contract is not accurate with Multicall
 *     due to EIP-2929. We would have to make a request for every swap we wanted to estimate.
 *  3/ For V2 we simulate all our swaps off-chain so have no way to track gas used.
 *
 * @export
 * @class V3HeuristicGasModelFactory
 */
export class V3HeuristicGasModelFactory extends TickBasedHeuristicGasModelFactory<V3RouteWithValidQuote> {
  constructor(provider: BaseProvider) {
    super(provider);
  }

  public override async buildGasModel({
    chainId,
    gasPriceWei,
    pools,
    amountToken,
    quoteToken,
    v2poolProvider,
    l2GasDataProvider,
    providerConfig,
  }: BuildOnChainGasModelFactoryType): Promise<
    IGasModel<V3RouteWithValidQuote>
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
