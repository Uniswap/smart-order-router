import { BigNumber } from '@ethersproject/bignumber';
import { V2RouteWithValidQuote } from '../../entities/route-with-valid-quote';
import { BuildV2GasModelFactoryType, IGasModel, IV2GasModelFactory } from '../gas-model';
export declare const BASE_SWAP_COST: BigNumber;
export declare const COST_PER_EXTRA_HOP: BigNumber;
/**
 * Computes a gas estimate for a V2 swap using heuristics.
 * Considers number of hops in the route and the typical base cost for a swap.
 *
 * We compute gas estimates off-chain because
 *  1/ Calling eth_estimateGas for a swaps requires the caller to have
 *     the full balance token being swapped, and approvals.
 *  2/ Tracking gas used using a wrapper contract is not accurate with Multicall
 *     due to EIP-2929. We would have to make a request for every swap we wanted to estimate.
 *  3/ For V2 we simulate all our swaps off-chain so have no way to track gas used.
 *
 * Note, certain tokens e.g. rebasing/fee-on-transfer, may incur higher gas costs than
 * what we estimate here. This is because they run extra logic on token transfer.
 *
 * @export
 * @class V2HeuristicGasModelFactory
 */
export declare class V2HeuristicGasModelFactory extends IV2GasModelFactory {
    constructor();
    buildGasModel({ chainId, gasPriceWei, poolProvider, token, providerConfig, }: BuildV2GasModelFactoryType): Promise<IGasModel<V2RouteWithValidQuote>>;
    private estimateGas;
    private getEthPool;
    private getHighestLiquidityUSDPool;
}
