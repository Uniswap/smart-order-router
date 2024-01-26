import { ChainId, TradeType } from '@uniswap/sdk-core';
import { PERMIT2_ADDRESS } from '@uniswap/universal-router-sdk';
import { BigNumber } from 'ethers/lib/ethers';
import { SwapType, } from '../routers';
import { Erc20__factory } from '../types/other/factories/Erc20__factory';
import { Permit2__factory } from '../types/other/factories/Permit2__factory';
import { log, SWAP_ROUTER_02_ADDRESSES } from '../util';
export var SimulationStatus;
(function (SimulationStatus) {
    SimulationStatus[SimulationStatus["NotSupported"] = 0] = "NotSupported";
    SimulationStatus[SimulationStatus["Failed"] = 1] = "Failed";
    SimulationStatus[SimulationStatus["Succeeded"] = 2] = "Succeeded";
    SimulationStatus[SimulationStatus["InsufficientBalance"] = 3] = "InsufficientBalance";
    SimulationStatus[SimulationStatus["NotApproved"] = 4] = "NotApproved";
})(SimulationStatus || (SimulationStatus = {}));
/**
 * Provider for dry running transactions.
 *
 * @export
 * @class Simulator
 */
export class Simulator {
    /**
     * Returns a new SwapRoute with simulated gas estimates
     * @returns SwapRoute
     */
    constructor(provider, portionProvider, chainId) {
        this.chainId = chainId;
        this.provider = provider;
        this.portionProvider = portionProvider;
    }
    async simulate(fromAddress, swapOptions, swapRoute, amount, quote, l2GasData, providerConfig) {
        const neededBalance = swapRoute.trade.tradeType == TradeType.EXACT_INPUT ? amount : quote;
        if ((neededBalance.currency.isNative && this.chainId == ChainId.MAINNET) ||
            (await this.userHasSufficientBalance(fromAddress, swapRoute.trade.tradeType, amount, quote))) {
            log.info('User has sufficient balance to simulate. Simulating transaction.');
            try {
                return this.simulateTransaction(fromAddress, swapOptions, swapRoute, l2GasData, providerConfig);
            }
            catch (e) {
                log.error({ e }, 'Error simulating transaction');
                return {
                    ...swapRoute,
                    simulationStatus: SimulationStatus.Failed,
                };
            }
        }
        else {
            log.error('User does not have sufficient balance to simulate.');
            return {
                ...swapRoute,
                simulationStatus: SimulationStatus.InsufficientBalance,
            };
        }
    }
    async userHasSufficientBalance(fromAddress, tradeType, amount, quote) {
        try {
            const neededBalance = tradeType == TradeType.EXACT_INPUT ? amount : quote;
            let balance;
            if (neededBalance.currency.isNative) {
                balance = await this.provider.getBalance(fromAddress);
            }
            else {
                const tokenContract = Erc20__factory.connect(neededBalance.currency.address, this.provider);
                balance = await tokenContract.balanceOf(fromAddress);
            }
            const hasBalance = balance.gte(BigNumber.from(neededBalance.quotient.toString()));
            log.info({
                fromAddress,
                balance: balance.toString(),
                neededBalance: neededBalance.quotient.toString(),
                neededAddress: neededBalance.wrapped.currency.address,
                hasBalance,
            }, 'Result of balance check for simulation');
            return hasBalance;
        }
        catch (e) {
            log.error(e, 'Error while checking user balance');
            return false;
        }
    }
    async checkTokenApproved(fromAddress, inputAmount, swapOptions, provider) {
        // Check token has approved Permit2 more than expected amount.
        const tokenContract = Erc20__factory.connect(inputAmount.currency.wrapped.address, provider);
        if (swapOptions.type == SwapType.UNIVERSAL_ROUTER) {
            const permit2Allowance = await tokenContract.allowance(fromAddress, PERMIT2_ADDRESS);
            // If a permit has been provided we don't need to check if UR has already been allowed.
            if (swapOptions.inputTokenPermit) {
                log.info({
                    permitAllowance: permit2Allowance.toString(),
                    inputAmount: inputAmount.quotient.toString(),
                }, 'Permit was provided for simulation on UR, checking that Permit2 has been approved.');
                return permit2Allowance.gte(BigNumber.from(inputAmount.quotient.toString()));
            }
            // Check UR has been approved from Permit2.
            const permit2Contract = Permit2__factory.connect(PERMIT2_ADDRESS, provider);
            const { amount: universalRouterAllowance, expiration: tokenExpiration } = await permit2Contract.allowance(fromAddress, inputAmount.currency.wrapped.address, SWAP_ROUTER_02_ADDRESSES(this.chainId));
            const nowTimestampS = Math.round(Date.now() / 1000);
            const inputAmountBN = BigNumber.from(inputAmount.quotient.toString());
            const permit2Approved = permit2Allowance.gte(inputAmountBN);
            const universalRouterApproved = universalRouterAllowance.gte(inputAmountBN);
            const expirationValid = tokenExpiration > nowTimestampS;
            log.info({
                permitAllowance: permit2Allowance.toString(),
                tokenAllowance: universalRouterAllowance.toString(),
                tokenExpirationS: tokenExpiration,
                nowTimestampS,
                inputAmount: inputAmount.quotient.toString(),
                permit2Approved,
                universalRouterApproved,
                expirationValid,
            }, `Simulating on UR, Permit2 approved: ${permit2Approved}, UR approved: ${universalRouterApproved}, Expiraton valid: ${expirationValid}.`);
            return permit2Approved && universalRouterApproved && expirationValid;
        }
        else if (swapOptions.type == SwapType.SWAP_ROUTER_02) {
            if (swapOptions.inputTokenPermit) {
                log.info({
                    inputAmount: inputAmount.quotient.toString(),
                }, 'Simulating on SwapRouter02 info - Permit was provided for simulation. Not checking allowances.');
                return true;
            }
            const allowance = await tokenContract.allowance(fromAddress, SWAP_ROUTER_02_ADDRESSES(this.chainId));
            const hasAllowance = allowance.gte(BigNumber.from(inputAmount.quotient.toString()));
            log.info({
                hasAllowance,
                allowance: allowance.toString(),
                inputAmount: inputAmount.quotient.toString(),
            }, `Simulating on SwapRouter02 - Has allowance: ${hasAllowance}`);
            // Return true if token allowance is greater than input amount
            return hasAllowance;
        }
        throw new Error(`Unsupported swap type ${swapOptions}`);
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoic2ltdWxhdGlvbi1wcm92aWRlci5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbIi4uLy4uLy4uL3NyYy9wcm92aWRlcnMvc2ltdWxhdGlvbi1wcm92aWRlci50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFDQSxPQUFPLEVBQUUsT0FBTyxFQUFFLFNBQVMsRUFBRSxNQUFNLG1CQUFtQixDQUFDO0FBQ3ZELE9BQU8sRUFBRSxlQUFlLEVBQUUsTUFBTSwrQkFBK0IsQ0FBQztBQUNoRSxPQUFPLEVBQUUsU0FBUyxFQUFFLE1BQU0sbUJBQW1CLENBQUM7QUFFOUMsT0FBTyxFQUlMLFFBQVEsR0FDVCxNQUFNLFlBQVksQ0FBQztBQUNwQixPQUFPLEVBQUUsY0FBYyxFQUFFLE1BQU0seUNBQXlDLENBQUM7QUFDekUsT0FBTyxFQUFFLGdCQUFnQixFQUFFLE1BQU0sMkNBQTJDLENBQUM7QUFDN0UsT0FBTyxFQUFrQixHQUFHLEVBQUUsd0JBQXdCLEVBQUUsTUFBTSxTQUFTLENBQUM7QUFleEUsTUFBTSxDQUFOLElBQVksZ0JBTVg7QUFORCxXQUFZLGdCQUFnQjtJQUMxQix1RUFBZ0IsQ0FBQTtJQUNoQiwyREFBVSxDQUFBO0lBQ1YsaUVBQWEsQ0FBQTtJQUNiLHFGQUF1QixDQUFBO0lBQ3ZCLHFFQUFlLENBQUE7QUFDakIsQ0FBQyxFQU5XLGdCQUFnQixLQUFoQixnQkFBZ0IsUUFNM0I7QUFFRDs7Ozs7R0FLRztBQUNILE1BQU0sT0FBZ0IsU0FBUztJQUk3Qjs7O09BR0c7SUFDSCxZQUNFLFFBQXlCLEVBQ3pCLGVBQWlDLEVBQ3ZCLE9BQWdCO1FBQWhCLFlBQU8sR0FBUCxPQUFPLENBQVM7UUFFMUIsSUFBSSxDQUFDLFFBQVEsR0FBRyxRQUFRLENBQUM7UUFDekIsSUFBSSxDQUFDLGVBQWUsR0FBRyxlQUFlLENBQUM7SUFDekMsQ0FBQztJQUVNLEtBQUssQ0FBQyxRQUFRLENBQ25CLFdBQW1CLEVBQ25CLFdBQXdCLEVBQ3hCLFNBQW9CLEVBQ3BCLE1BQXNC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