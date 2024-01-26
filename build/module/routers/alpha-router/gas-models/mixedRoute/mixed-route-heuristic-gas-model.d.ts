import { MixedRouteWithValidQuote } from '../../entities/route-with-valid-quote';
import { BuildOnChainGasModelFactoryType, IGasModel, IOnChainGasModelFactory } from '../gas-model';
/**
 * Computes a gas estimate for a mixed route swap using heuristics.
 * Considers number of hops in the route, number of ticks crossed
 * and the typical base cost for a swap.
 *
 * We get the number of ticks crossed in a swap from the MixedRouteQuoterV1
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
 * @class MixedRouteHeuristicGasModelFactory
 */
export declare class MixedRouteHeuristicGasModelFactory extends IOnChainGasModelFactory {
    constructor();
    buildGasModel({ chainId, gasPriceWei, pools, quoteToken, v2poolProvider: V2poolProvider, providerConfig, }: BuildOnChainGasModelFactoryType): Promise<IGasModel<MixedRouteWithValidQuote>>;
    private estimateGas;
}
