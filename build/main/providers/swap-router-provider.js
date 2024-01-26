"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SwapRouterProvider = void 0;
const SwapRouter02__factory_1 = require("../types/other/factories/SwapRouter02__factory");
const util_1 = require("../util");
class SwapRouterProvider {
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
            address: (0, util_1.SWAP_ROUTER_02_ADDRESSES)(this.chainId),
            contractInterface: SwapRouter02__factory_1.SwapRouter02__factory.createInterface(),
            functionName: 'getApprovalType',
            functionParams,
        });
        if (!((_a = tx.results[0]) === null || _a === void 0 ? void 0 : _a.success) || !((_b = tx.results[1]) === null || _b === void 0 ? void 0 : _b.success)) {
            util_1.log.info({ results: tx.results }, 'Failed to get approval type from swap router for token in or token out');
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
exports.SwapRouterProvider = SwapRouterProvider;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoic3dhcC1yb3V0ZXItcHJvdmlkZXIuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi8uLi8uLi9zcmMvcHJvdmlkZXJzL3N3YXAtcm91dGVyLXByb3ZpZGVyLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7OztBQUdBLDBGQUF1RjtBQUN2RixrQ0FBd0Q7QUE2QnhELE1BQWEsa0JBQWtCO0lBQzdCLFlBQ1ksa0JBQXNDLEVBQ3RDLE9BQWdCO1FBRGhCLHVCQUFrQixHQUFsQixrQkFBa0IsQ0FBb0I7UUFDdEMsWUFBTyxHQUFQLE9BQU8sQ0FBUztJQUN6QixDQUFDO0lBRUcsS0FBSyxDQUFDLGVBQWUsQ0FDMUIsYUFBdUMsRUFDdkMsY0FBd0M7O1FBRXhDLE1BQU0sY0FBYyxHQUF1QjtZQUN6QztnQkFDRSxhQUFhLENBQUMsUUFBUSxDQUFDLE9BQU8sQ0FBQyxPQUFPO2dCQUN0QyxhQUFhLENBQUMsUUFBUSxDQUFDLFFBQVEsRUFBRTthQUNsQztZQUNEO2dCQUNFLGNBQWMsQ0FBQyxRQUFRLENBQUMsT0FBTyxDQUFDLE9BQU87Z0JBQ3ZDLGNBQWMsQ0FBQyxRQUFRLENBQUMsUUFBUSxFQUFFO2FBQ25DO1NBQ0YsQ0FBQztRQUVGLE1BQU0sRUFBRSxHQUNOLE1BQU0sSUFBSSxDQUFDLGtCQUFrQixDQUFDLDRDQUE0QyxDQUd4RTtZQUNBLE9BQU8sRUFBRSxJQUFBLCtCQUF3QixFQUFDLElBQUksQ0FBQyxPQUFPLENBQUM7WUFDL0MsaUJBQWlCLEVBQUUsNkNBQXFCLENBQUMsZUFBZSxFQUFFO1lBQzFELFlBQVksRUFBRSxpQkFBaUI7WUFDL0IsY0FBYztTQUNmLENBQUMsQ0FBQztRQUVMLElBQUksQ0FBQyxDQUFBLE1BQUEsRUFBRSxDQUFDLE9BQU8sQ0FBQyxDQUFDLENBQUMsMENBQUUsT0FBTyxDQUFBLElBQUksQ0FBQyxDQUFBLE1BQUEsRUFBRSxDQUFDLE9BQU8sQ0FBQyxDQUFDLENBQUMsMENBQUUsT0FBTyxDQUFBLEVBQUU7WUFDdEQsVUFBRyxDQUFDLElBQUksQ0FDTixFQUFFLE9BQU8sRUFBRSxFQUFFLENBQUMsT0FBTyxFQUFFLEVBQ3ZCLHdFQUF3RSxDQUN6RSxDQUFDO1lBQ0YsTUFBTSxJQUFJLEtBQUssQ0FDYix3RUFBd0UsQ0FDekUsQ0FBQztTQUNIO1FBRUQsTUFBTSxFQUFFLE1BQU0sRUFBRSxlQUFlLEVBQUUsR0FBRyxFQUFFLENBQUMsT0FBUSxDQUFDLENBQUMsQ0FBQyxDQUFDO1FBQ25ELE1BQU0sRUFBRSxNQUFNLEVBQUUsZ0JBQWdCLEVBQUUsR0FBRyxFQUFFLENBQUMsT0FBUSxDQUFDLENBQUMsQ0FBQyxDQUFDO1FBRXBELE9BQU87WUFDTCxlQUFlLEVBQUUsZUFBZSxDQUFDLENBQUMsQ0FBQztZQUNuQyxnQkFBZ0IsRUFBRSxnQkFBZ0IsQ0FBQyxDQUFDLENBQUM7U0FDdEMsQ0FBQztJQUNKLENBQUM7Q0FDRjtBQWxERCxnREFrREMifQ==