import { Fraction } from '@uniswap/sdk-core';
import { CurrencyAmount } from '../../../util/amounts';
export function calculateRatioAmountIn(optimalRatio, inputTokenPrice, inputBalance, outputBalance) {
    // formula: amountToSwap = (inputBalance - (optimalRatio * outputBalance)) / ((optimalRatio * inputTokenPrice) + 1))
    const amountToSwapRaw = new Fraction(inputBalance.quotient)
        .subtract(optimalRatio.multiply(outputBalance.quotient))
        .divide(optimalRatio.multiply(inputTokenPrice).add(1));
    if (amountToSwapRaw.lessThan(0)) {
        // should never happen since we do checks before calling in
        throw new Error('routeToRatio: insufficient input token amount');
    }
    return CurrencyAmount.fromRawAmount(inputBalance.currency, amountToSwapRaw.quotient);
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY2FsY3VsYXRlLXJhdGlvLWFtb3VudC1pbi5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbIi4uLy4uLy4uLy4uLy4uL3NyYy9yb3V0ZXJzL2FscGhhLXJvdXRlci9mdW5jdGlvbnMvY2FsY3VsYXRlLXJhdGlvLWFtb3VudC1pbi50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQSxPQUFPLEVBQUUsUUFBUSxFQUFFLE1BQU0sbUJBQW1CLENBQUM7QUFFN0MsT0FBTyxFQUFFLGNBQWMsRUFBRSxNQUFNLHVCQUF1QixDQUFDO0FBRXZELE1BQU0sVUFBVSxzQkFBc0IsQ0FDcEMsWUFBc0IsRUFDdEIsZUFBeUIsRUFDekIsWUFBNEIsRUFDNUIsYUFBNkI7SUFFN0Isb0hBQW9IO0lBQ3BILE1BQU0sZUFBZSxHQUFHLElBQUksUUFBUSxDQUFDLFlBQVksQ0FBQyxRQUFRLENBQUM7U0FDeEQsUUFBUSxDQUFDLFlBQVksQ0FBQyxRQUFRLENBQUMsYUFBYSxDQUFDLFFBQVEsQ0FBQyxDQUFDO1NBQ3ZELE1BQU0sQ0FBQyxZQUFZLENBQUMsUUFBUSxDQUFDLGVBQWUsQ0FBQyxDQUFDLEdBQUcsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDO0lBRXpELElBQUksZUFBZSxDQUFDLFFBQVEsQ0FBQyxDQUFDLENBQUMsRUFBRTtRQUMvQiwyREFBMkQ7UUFDM0QsTUFBTSxJQUFJLEtBQUssQ0FBQywrQ0FBK0MsQ0FBQyxDQUFDO0tBQ2xFO0lBRUQsT0FBTyxjQUFjLENBQUMsYUFBYSxDQUNqQyxZQUFZLENBQUMsUUFBUSxFQUNyQixlQUFlLENBQUMsUUFBUSxDQUN6QixDQUFDO0FBQ0osQ0FBQyJ9