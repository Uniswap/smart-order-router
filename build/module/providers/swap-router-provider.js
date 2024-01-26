import { SwapRouter02__factory } from '../types/other/factories/SwapRouter02__factory';
import { log, SWAP_ROUTER_02_ADDRESSES } from '../util';
export class SwapRouterProvider {
    constructor(multicall2Provider, chainId) {
        this.multicall2Provider = multicall2Provider;
        this.chainId = chainId;
    }
    async getApprovalType(tokenInAmount, tokenOutAmount) {
        var _a, _b;
        const functionParams = [
            [
                tokenInAmount.currency.wrapped.address,
                tokenInAmount.quotient.toString(),
            ],
            [
                tokenOutAmount.currency.wrapped.address,
                tokenOutAmount.quotient.toString(),
            ],
        ];
        const tx = await this.multicall2Provider.callSameFunctionOnContractWithMultipleParams({
            address: SWAP_ROUTER_02_ADDRESSES(this.chainId),
            contractInterface: SwapRouter02__factory.createInterface(),
            functionName: 'getApprovalType',
            functionParams,
        });
        if (!((_a = tx.results[0]) === null || _a === void 0 ? void 0 : _a.success) || !((_b = tx.results[1]) === null || _b === void 0 ? void 0 : _b.success)) {
            log.info({ results: tx.results }, 'Failed to get approval type from swap router for token in or token out');
            throw new Error('Failed to get approval type from swap router for token in or token out');
        }
        const { result: approvalTokenIn } = tx.results[0];
        const { result: approvalTokenOut } = tx.results[1];
        return {
            approvalTokenIn: approvalTokenIn[0],
            approvalTokenOut: approvalTokenOut[0],
        };
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoic3dhcC1yb3V0ZXItcHJvdmlkZXIuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi8uLi8uLi9zcmMvcHJvdmlkZXJzL3N3YXAtcm91dGVyLXByb3ZpZGVyLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUdBLE9BQU8sRUFBRSxxQkFBcUIsRUFBRSxNQUFNLGdEQUFnRCxDQUFDO0FBQ3ZGLE9BQU8sRUFBRSxHQUFHLEVBQUUsd0JBQXdCLEVBQUUsTUFBTSxTQUFTLENBQUM7QUE2QnhELE1BQU0sT0FBTyxrQkFBa0I7SUFDN0IsWUFDWSxrQkFBc0MsRUFDdEMsT0FBZ0I7UUFEaEIsdUJBQWtCLEdBQWxCLGtCQUFrQixDQUFvQjtRQUN0QyxZQUFPLEdBQVAsT0FBTyxDQUFTO0lBQ3pCLENBQUM7SUFFRyxLQUFLLENBQUMsZUFBZSxDQUMxQixhQUF1QyxFQUN2QyxjQUF3Qzs7UUFFeEMsTUFBTSxjQUFjLEdBQXVCO1lBQ3pDO2dCQUNFLGFBQWEsQ0FBQyxRQUFRLENBQUMsT0FBTyxDQUFDLE9BQU87Z0JBQ3RDLGFBQWEsQ0FBQyxRQUFRLENBQUMsUUFBUSxFQUFFO2FBQ2xDO1lBQ0Q7Z0JBQ0UsY0FBYyxDQUFDLFFBQVEsQ0FBQyxPQUFPLENBQUMsT0FBTztnQkFDdkMsY0FBYyxDQUFDLFFBQVEsQ0FBQyxRQUFRLEVBQUU7YUFDbkM7U0FDRixDQUFDO1FBRUYsTUFBTSxFQUFFLEdBQ04sTUFBTSxJQUFJLENBQUMsa0JBQWtCLENBQUMsNENBQTRDLENBR3hFO1lBQ0EsT0FBTyxFQUFFLHdCQUF3QixDQUFDLElBQUksQ0FBQyxPQUFPLENBQUM7WUFDL0MsaUJBQWlCLEVBQUUscUJBQXFCLENBQUMsZUFBZSxFQUFFO1lBQzFELFlBQVksRUFBRSxpQkFBaUI7WUFDL0IsY0FBYztTQUNmLENBQUMsQ0FBQztRQUVMLElBQUksQ0FBQyxDQUFBLE1BQUEsRUFBRSxDQUFDLE9BQU8sQ0FBQyxDQUFDLENBQUMsMENBQUUsT0FBTyxDQUFBLElBQUksQ0FBQyxDQUFBLE1BQUEsRUFBRSxDQUFDLE9BQU8sQ0FBQyxDQUFDLENBQUMsMENBQUUsT0FBTyxDQUFBLEVBQUU7WUFDdEQsR0FBRyxDQUFDLElBQUksQ0FDTixFQUFFLE9BQU8sRUFBRSxFQUFFLENBQUMsT0FBTyxFQUFFLEVBQ3ZCLHdFQUF3RSxDQUN6RSxDQUFDO1lBQ0YsTUFBTSxJQUFJLEtBQUssQ0FDYix3RUFBd0UsQ0FDekUsQ0FBQztTQUNIO1FBRUQsTUFBTSxFQUFFLE1BQU0sRUFBRSxlQUFlLEVBQUUsR0FBRyxFQUFFLENBQUMsT0FBUSxDQUFDLENBQUMsQ0FBQyxDQUFDO1FBQ25ELE1BQU0sRUFBRSxNQUFNLEVBQUUsZ0JBQWdCLEVBQUUsR0FBRyxFQUFFLENBQUMsT0FBUSxDQUFDLENBQUMsQ0FBQyxDQUFDO1FBRXBELE9BQU87WUFDTCxlQUFlLEVBQUUsZUFBZSxDQUFDLENBQUMsQ0FBQztZQUNuQyxnQkFBZ0IsRUFBRSxnQkFBZ0IsQ0FBQyxDQUFDLENBQUM7U0FDdEMsQ0FBQztJQUNKLENBQUM7Q0FDRiJ9