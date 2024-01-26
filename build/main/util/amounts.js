"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.unparseFeeAmount = exports.parseFeeAmount = exports.parseAmount = exports.MAX_UINT160 = exports.CurrencyAmount = void 0;
const units_1 = require("@ethersproject/units");
const sdk_core_1 = require("@uniswap/sdk-core");
const v3_sdk_1 = require("@uniswap/v3-sdk");
const jsbi_1 = __importDefault(require("jsbi"));
class CurrencyAmount extends sdk_core_1.CurrencyAmount {
}
exports.CurrencyAmount = CurrencyAmount;
exports.MAX_UINT160 = '0xffffffffffffffffffffffffffffffffffffffff';
// Try to parse a user entered amount for a given token
function parseAmount(value, currency) {
    const typedValueParsed = (0, units_1.parseUnits)(value, currency.decimals).toString();
    return CurrencyAmount.fromRawAmount(currency, jsbi_1.default.BigInt(typedValueParsed));
}
exports.parseAmount = parseAmount;
function parseFeeAmount(feeAmountStr) {
    switch (feeAmountStr) {
        case '10000':
            return v3_sdk_1.FeeAmount.HIGH;
        case '3000':
            return v3_sdk_1.FeeAmount.MEDIUM;
        case '1000':
            return v3_sdk_1.FeeAmount.STABLE;
        case '500':
            return v3_sdk_1.FeeAmount.LOW;
        case '100':
            return v3_sdk_1.FeeAmount.LOWEST;
        default:
            throw new Error(`Fee amount ${feeAmountStr} not supported.`);
    }
}
exports.parseFeeAmount = parseFeeAmount;
function unparseFeeAmount(feeAmount) {
    switch (feeAmount) {
        case v3_sdk_1.FeeAmount.HIGH:
            return '10000';
        case v3_sdk_1.FeeAmount.MEDIUM:
            return '3000';
        case v3_sdk_1.FeeAmount.STABLE:
            return '1000';
        case v3_sdk_1.FeeAmount.LOW:
            return '500';
        case v3_sdk_1.FeeAmount.LOWEST:
            return '100';
        default:
            throw new Error(`Fee amount ${feeAmount} not supported.`);
    }
}
exports.unparseFeeAmount = unparseFeeAmount;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiYW1vdW50cy5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbIi4uLy4uLy4uL3NyYy91dGlsL2Ftb3VudHMudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7Ozs7O0FBQUEsZ0RBQWtEO0FBQ2xELGdEQUcyQjtBQUMzQiw0Q0FBNEM7QUFDNUMsZ0RBQXdCO0FBRXhCLE1BQWEsY0FBZSxTQUFRLHlCQUEyQjtDQUFHO0FBQWxFLHdDQUFrRTtBQUVyRCxRQUFBLFdBQVcsR0FBRyw0Q0FBNEMsQ0FBQztBQUV4RSx1REFBdUQ7QUFDdkQsU0FBZ0IsV0FBVyxDQUFDLEtBQWEsRUFBRSxRQUFrQjtJQUMzRCxNQUFNLGdCQUFnQixHQUFHLElBQUEsa0JBQVUsRUFBQyxLQUFLLEVBQUUsUUFBUSxDQUFDLFFBQVEsQ0FBQyxDQUFDLFFBQVEsRUFBRSxDQUFDO0lBQ3pFLE9BQU8sY0FBYyxDQUFDLGFBQWEsQ0FBQyxRQUFRLEVBQUUsY0FBSSxDQUFDLE1BQU0sQ0FBQyxnQkFBZ0IsQ0FBQyxDQUFDLENBQUM7QUFDL0UsQ0FBQztBQUhELGtDQUdDO0FBRUQsU0FBZ0IsY0FBYyxDQUFDLFlBQW9CO0lBQ2pELFFBQVEsWUFBWSxFQUFFO1FBQ3BCLEtBQUssT0FBTztZQUNWLE9BQU8sa0JBQVMsQ0FBQyxJQUFJLENBQUM7UUFDeEIsS0FBSyxNQUFNO1lBQ1QsT0FBTyxrQkFBUyxDQUFDLE1BQU0sQ0FBQztRQUMxQixLQUFLLE1BQU07WUFDVCxPQUFPLGtCQUFTLENBQUMsTUFBTSxDQUFDO1FBQzFCLEtBQUssS0FBSztZQUNSLE9BQU8sa0JBQVMsQ0FBQyxHQUFHLENBQUM7UUFDdkIsS0FBSyxLQUFLO1lBQ1IsT0FBTyxrQkFBUyxDQUFDLE1BQU0sQ0FBQztRQUMxQjtZQUNFLE1BQU0sSUFBSSxLQUFLLENBQUMsY0FBYyxZQUFZLGlCQUFpQixDQUFDLENBQUM7S0FDaEU7QUFDSCxDQUFDO0FBZkQsd0NBZUM7QUFFRCxTQUFnQixnQkFBZ0IsQ0FBQyxTQUFvQjtJQUNuRCxRQUFRLFNBQVMsRUFBRTtRQUNqQixLQUFLLGtCQUFTLENBQUMsSUFBSTtZQUNqQixPQUFPLE9BQU8sQ0FBQztRQUNqQixLQUFLLGtCQUFTLENBQUMsTUFBTTtZQUNuQixPQUFPLE1BQU0sQ0FBQztRQUNoQixLQUFLLGtCQUFTLENBQUMsTUFBTTtZQUNuQixPQUFPLE1BQU0sQ0FBQztRQUNoQixLQUFLLGtCQUFTLENBQUMsR0FBRztZQUNoQixPQUFPLEtBQUssQ0FBQztRQUNmLEtBQUssa0JBQVMsQ0FBQyxNQUFNO1lBQ25CLE9BQU8sS0FBSyxDQUFDO1FBQ2Y7WUFDRSxNQUFNLElBQUksS0FBSyxDQUFDLGNBQWMsU0FBUyxpQkFBaUIsQ0FBQyxDQUFDO0tBQzdEO0FBQ0gsQ0FBQztBQWZELDRDQWVDIn0=