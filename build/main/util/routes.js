"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.poolToString = exports.routeAmountToString = exports.routeAmountsToString = exports.routeToString = void 0;
const router_sdk_1 = require("@uniswap/router-sdk");
const sdk_core_1 = require("@uniswap/sdk-core");
const v2_sdk_1 = require("@uniswap/v2-sdk");
const v3_sdk_1 = require("@uniswap/v3-sdk");
const lodash_1 = __importDefault(require("lodash"));
const addresses_1 = require("./addresses");
const _1 = require(".");
const routeToString = (route) => {
    const routeStr = [];
    const tokens = route.protocol === router_sdk_1.Protocol.V3
        ? route.tokenPath
        : // MixedRoute and V2Route have path
            route.path;
    const tokenPath = lodash_1.default.map(tokens, (token) => `${token.symbol}`);
    const pools = route.protocol === router_sdk_1.Protocol.V3 || route.protocol === router_sdk_1.Protocol.MIXED
        ? route.pools
        : route.pairs;
    const poolFeePath = lodash_1.default.map(pools, (pool) => {
        return `${pool instanceof v3_sdk_1.Pool
            ? ` -- ${pool.fee / 10000}% [${v3_sdk_1.Pool.getAddress(pool.token0, pool.token1, pool.fee, undefined, addresses_1.V3_CORE_FACTORY_ADDRESSES[pool.chainId])}]`
            : ` -- [${v2_sdk_1.Pair.getAddress(pool.token0, pool.token1)}]`} --> `;
    });
    for (let i = 0; i < tokenPath.length; i++) {
        routeStr.push(tokenPath[i]);
        if (i < poolFeePath.length) {
            routeStr.push(poolFeePath[i]);
        }
    }
    return routeStr.join('');
};
exports.routeToString = routeToString;
const routeAmountsToString = (routeAmounts) => {
    const total = lodash_1.default.reduce(routeAmounts, (total, cur) => {
        return total.add(cur.amount);
    }, _1.CurrencyAmount.fromRawAmount(routeAmounts[0].amount.currency, 0));
    const routeStrings = lodash_1.default.map(routeAmounts, ({ protocol, route, amount }) => {
        const portion = amount.divide(total);
        const percent = new sdk_core_1.Percent(portion.numerator, portion.denominator);
        /// @dev special case for MIXED routes we want to show user friendly V2+V3 instead
        return `[${protocol == router_sdk_1.Protocol.MIXED ? 'V2 + V3' : protocol}] ${percent.toFixed(2)}% = ${(0, exports.routeToString)(route)}`;
    });
    return lodash_1.default.join(routeStrings, ', ');
};
exports.routeAmountsToString = routeAmountsToString;
const routeAmountToString = (routeAmount) => {
    const { route, amount } = routeAmount;
    return `${amount.toExact()} = ${(0, exports.routeToString)(route)}`;
};
exports.routeAmountToString = routeAmountToString;
const poolToString = (p) => {
    return `${p.token0.symbol}/${p.token1.symbol}${p instanceof v3_sdk_1.Pool ? `/${p.fee / 10000}%` : ``}`;
};
exports.poolToString = poolToString;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicm91dGVzLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiLi4vLi4vLi4vc3JjL3V0aWwvcm91dGVzLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7Ozs7OztBQUFBLG9EQUErQztBQUMvQyxnREFBNEM7QUFDNUMsNENBQXVDO0FBQ3ZDLDRDQUF1QztBQUN2QyxvREFBdUI7QUFLdkIsMkNBQXdEO0FBRXhELHdCQUFtQztBQUU1QixNQUFNLGFBQWEsR0FBRyxDQUMzQixLQUFxQyxFQUM3QixFQUFFO0lBQ1YsTUFBTSxRQUFRLEdBQUcsRUFBRSxDQUFDO0lBQ3BCLE1BQU0sTUFBTSxHQUNWLEtBQUssQ0FBQyxRQUFRLEtBQUsscUJBQVEsQ0FBQyxFQUFFO1FBQzVCLENBQUMsQ0FBQyxLQUFLLENBQUMsU0FBUztRQUNqQixDQUFDLENBQUMsbUNBQW1DO1lBQ25DLEtBQUssQ0FBQyxJQUFJLENBQUM7SUFDakIsTUFBTSxTQUFTLEdBQUcsZ0JBQUMsQ0FBQyxHQUFHLENBQUMsTUFBTSxFQUFFLENBQUMsS0FBSyxFQUFFLEVBQUUsQ0FBQyxHQUFHLEtBQUssQ0FBQyxNQUFNLEVBQUUsQ0FBQyxDQUFDO0lBQzlELE1BQU0sS0FBSyxHQUNULEtBQUssQ0FBQyxRQUFRLEtBQUsscUJBQVEsQ0FBQyxFQUFFLElBQUksS0FBSyxDQUFDLFFBQVEsS0FBSyxxQkFBUSxDQUFDLEtBQUs7UUFDakUsQ0FBQyxDQUFDLEtBQUssQ0FBQyxLQUFLO1FBQ2IsQ0FBQyxDQUFDLEtBQUssQ0FBQyxLQUFLLENBQUM7SUFDbEIsTUFBTSxXQUFXLEdBQUcsZ0JBQUMsQ0FBQyxHQUFHLENBQUMsS0FBSyxFQUFFLENBQUMsSUFBSSxFQUFFLEVBQUU7UUFDeEMsT0FBTyxHQUNMLElBQUksWUFBWSxhQUFJO1lBQ2xCLENBQUMsQ0FBQyxPQUFPLElBQUksQ0FBQyxHQUFHLEdBQUcsS0FBSyxNQUFNLGFBQUksQ0FBQyxVQUFVLENBQzFDLElBQUksQ0FBQyxNQUFNLEVBQ1gsSUFBSSxDQUFD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