import { V3RouteWithValidQuote } from '../../entities/route-with-valid-quote';
import { BuildOnChainGasModelFactoryType, IGasModel, IOnChainGasModelFactory } from '../gas-model';
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
export declare class V3HeuristicGasModelFactory extends IOnChainGasModelFactory {
    constructor();
    buildGasModel({ chainId, gasPriceWei, pools, amountToken, quoteToken, l2GasDataProvider, providerConfig, }: BuildOnChainGasModelFactoryType): Promise<IGasModel<V3RouteWithValidQuote>>;
    private estimateGas;
    /**
     * To avoid having a call to optimism's L1 security fee contract for every route and amount combination,
     * we replicate the gas cost accounting here.
     */
    private calculateOptimismToL1SecurityFee;
    private calculateArbitrumToL1SecurityFee;
}
