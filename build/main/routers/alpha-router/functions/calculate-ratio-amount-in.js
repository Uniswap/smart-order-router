"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.calculateRatioAmountIn = void 0;
const sdk_core_1 = require("@uniswap/sdk-core");
const amounts_1 = require("../../../util/amounts");
function calculateRatioAmountIn(optimalRatio, inputTokenPrice, inputBalance, outputBalance) {
    // formula: amountToSwap = (inputBalance - (optimalRatio * outputBalance)) / ((optimalRatio * inputTokenPrice) + 1))
    const amountToSwapRaw = new sdk_core_1.Fraction(inputBalance.quotient)
        .subtract(optimalRatio.multiply(outputBalance.quotient))
        .divide(optimalRatio.multiply(inputTokenPrice).add(1));
    if (amountToSwapRaw.lessThan(0)) {
        // should never happen since we do checks before calling in
        throw new Error('routeToRatio: insufficient input token amount');
    }
    return amounts_1.CurrencyAmount.fromRawAmount(inputBalance.currency, amountToSwapRaw.quotient);
}
exports.calculateRatioAmountIn = calculateRatioAmountIn;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY2FsY3VsYXRlLXJhdGlvLWFtb3VudC1pbi5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbIi4uLy4uLy4uLy4uLy4uL3NyYy9yb3V0ZXJzL2FscGhhLXJvdXRlci9mdW5jdGlvbnMvY2FsY3VsYXRlLXJhdGlvLWFtb3VudC1pbi50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiOzs7QUFBQSxnREFBNkM7QUFFN0MsbURBQXVEO0FBRXZELFNBQWdCLHNCQUFzQixDQUNwQyxZQUFzQixFQUN0QixlQUF5QixFQUN6QixZQUE0QixFQUM1QixhQUE2QjtJQUU3QixvSEFBb0g7SUFDcEgsTUFBTSxlQUFlLEdBQUcsSUFBSSxtQkFBUSxDQUFDLFlBQVksQ0FBQyxRQUFRLENBQUM7U0FDeEQsUUFBUSxDQUFDLFlBQVksQ0FBQyxRQUFRLENBQUMsYUFBYSxDQUFDLFFBQVEsQ0FBQyxDQUFDO1NBQ3ZELE1BQU0sQ0FBQyxZQUFZLENBQUMsUUFBUSxDQUFDLGVBQWUsQ0FBQyxDQUFDLEdBQUcsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDO0lBRXpELElBQUksZUFBZSxDQUFDLFFBQVEsQ0FBQyxDQUFDLENBQUMsRUFBRTtRQUMvQiwyREFBMkQ7UUFDM0QsTUFBTSxJQUFJLEtBQUssQ0FBQywrQ0FBK0MsQ0FBQyxDQUFDO0tBQ2xFO0lBRUQsT0FBTyx3QkFBYyxDQUFDLGFBQWEsQ0FDakMsWUFBWSxDQUFDLFFBQVEsRUFDckIsZUFBZSxDQUFDLFFBQVEsQ0FDekIsQ0FBQztBQUNKLENBQUM7QUFwQkQsd0RBb0JDIn0=