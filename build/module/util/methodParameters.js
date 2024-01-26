import { MixedRouteSDK, Protocol, SwapRouter as SwapRouter02, Trade, } from '@uniswap/router-sdk';
import { TradeType } from '@uniswap/sdk-core';
import { UNIVERSAL_ROUTER_ADDRESS, SwapRouter as UniversalRouter, } from '@uniswap/universal-router-sdk';
import { Route as V2RouteRaw } from '@uniswap/v2-sdk';
import { Route as V3RouteRaw } from '@uniswap/v3-sdk';
import _ from 'lodash';
import { CurrencyAmount, SWAP_ROUTER_02_ADDRESSES, SwapType, } from '..';
export function buildTrade(tokenInCurrency, tokenOutCurrency, tradeType, routeAmounts) {
    /// Removed partition because of new mixedRoutes
    const v3RouteAmounts = _.filter(routeAmounts, (routeAmount) => routeAmount.protocol === Protocol.V3);
    const v2RouteAmounts = _.filter(routeAmounts, (routeAmount) => routeAmount.protocol === Protocol.V2);
    const mixedRouteAmounts = _.filter(routeAmounts, (routeAmount) => routeAmount.protocol === Protocol.MIXED);
    const v3Routes = _.map(v3RouteAmounts, (routeAmount) => {
        const { route, amount, quote } = routeAmount;
        // The route, amount and quote are all in terms of wrapped tokens.
        // When constructing the Trade object the inputAmount/outputAmount must
        // use native currencies if specified by the user. This is so that the Trade knows to wrap/unwrap.
        if (tradeType == TradeType.EXACT_INPUT) {
            const amountCurrency = CurrencyAmount.fromFractionalAmount(tokenInCurrency, amount.numerator, amount.denominator);
            const quoteCurrency = CurrencyAmount.fromFractionalAmount(tokenOutCurrency, quote.numerator, quote.denominator);
            const routeRaw = new V3RouteRaw(route.pools, amountCurrency.currency, quoteCurrency.currency);
            return {
                routev3: routeRaw,
                inputAmount: amountCurrency,
                outputAmount: quoteCurrency,
            };
        }
        else {
            const quoteCurrency = CurrencyAmount.fromFractionalAmount(tokenInCurrency, quote.numerator, quote.denominator);
            const amountCurrency = CurrencyAmount.fromFractionalAmount(tokenOutCurrency, amount.numerator, amount.denominator);
            const routeCurrency = new V3RouteRaw(route.pools, quoteCurrency.currency, amountCurrency.currency);
            return {
                routev3: routeCurrency,
                inputAmount: quoteCurrency,
                outputAmount: amountCurrency,
            };
        }
    });
    const v2Routes = _.map(v2RouteAmounts, (routeAmount) => {
        const { route, amount, quote } = routeAmount;
        // The route, amount and quote are all in terms of wrapped tokens.
        // When constructing the Trade object the inputAmount/outputAmount must
        // use native currencies if specified by the user. This is so that the Trade knows to wrap/unwrap.
        if (tradeType == TradeType.EXACT_INPUT) {
            const amountCurrency = CurrencyAmount.fromFractionalAmount(tokenInCurrency, amount.numerator, amount.denominator);
            const quoteCurrency = CurrencyAmount.fromFractionalAmount(tokenOutCurrency, quote.numerator, quote.denominator);
            const routeV2SDK = new V2RouteRaw(route.pairs, amountCurrency.currency, quoteCurrency.currency);
            return {
                routev2: routeV2SDK,
                inputAmount: amountCurrency,
                outputAmount: quoteCurrency,
            };
        }
        else {
            const quoteCurrency = CurrencyAmount.fromFractionalAmount(tokenInCurrency, quote.numerator, quote.denominator);
            const amountCurrency = CurrencyAmount.fromFractionalAmount(tokenOutCurrency, amount.numerator, amount.denominator);
            const routeV2SDK = new V2RouteRaw(route.pairs, quoteCurrency.currency, amountCurrency.currency);
            return {
                routev2: routeV2SDK,
                inputAmount: quoteCurrency,
                outputAmount: amountCurrency,
            };
        }
    });
    const mixedRoutes = _.map(mixedRouteAmounts, (routeAmount) => {
        const { route, amount, quote } = routeAmount;
        if (tradeType != TradeType.EXACT_INPUT) {
            throw new Error('Mixed routes are only supported for exact input trades');
        }
        // The route, amount and quote are all in terms of wrapped tokens.
        // When constructing the Trade object the inputAmount/outputAmount must
        // use native currencies if specified by the user. This is so that the Trade knows to wrap/unwrap.
        const amountCurrency = CurrencyAmount.fromFractionalAmount(tokenInCurrency, amount.numerator, amount.denominator);
        const quoteCurrency = CurrencyAmount.fromFractionalAmount(tokenOutCurrency, quote.numerator, quote.denominator);
        const routeRaw = new MixedRouteSDK(route.pools, amountCurrency.currency, quoteCurrency.currency);
        return {
            mixedRoute: routeRaw,
            inputAmount: amountCurrency,
            outputAmount: quoteCurrency,
        };
    });
    const trade = new Trade({ v2Routes, v3Routes, mixedRoutes, tradeType });
    return trade;
}
export function buildSwapMethodParameters(trade, swapConfig, chainId) {
    if (swapConfig.type == SwapType.UNIVERSAL_ROUTER) {
        return {
            ...UniversalRouter.swapERC20CallParameters(trade, swapConfig),
            to: UNIVERSAL_ROUTER_ADDRESS(chainId),
        };
    }
    else if (swapConfig.type == SwapType.SWAP_ROUTER_02) {
        const { recipient, slippageTolerance, deadline, inputTokenPermit } = swapConfig;
        return {
            ...SwapRouter02.swapCallParameters(trade, {
                recipient,
                slippageTolerance,
                deadlineOrPreviousBlockhash: deadline,
                inputTokenPermit,
            }),
            to: SWAP_ROUTER_02_ADDRESSES(chainId),
        };
    }
    throw new Error(`Unsupported swap type ${swapConfig}`);
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibWV0aG9kUGFyYW1ldGVycy5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbIi4uLy4uLy4uL3NyYy91dGlsL21ldGhvZFBhcmFtZXRlcnMudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUEsT0FBTyxFQUNMLGFBQWEsRUFDYixRQUFRLEVBQ1IsVUFBVSxJQUFJLFlBQVksRUFDMUIsS0FBSyxHQUNOLE1BQU0scUJBQXFCLENBQUM7QUFDN0IsT0FBTyxFQUFxQixTQUFTLEVBQUUsTUFBTSxtQkFBbUIsQ0FBQztBQUNqRSxPQUFPLEVBQ0wsd0JBQXdCLEVBQ3hCLFVBQVUsSUFBSSxlQUFlLEdBQzlCLE1BQU0sK0JBQStCLENBQUM7QUFDdkMsT0FBTyxFQUFFLEtBQUssSUFBSSxVQUFVLEVBQUUsTUFBTSxpQkFBaUIsQ0FBQztBQUN0RCxPQUFPLEVBQUUsS0FBSyxJQUFJLFVBQVUsRUFBRSxNQUFNLGlCQUFpQixDQUFDO0FBQ3RELE9BQU8sQ0FBQyxNQUFNLFFBQVEsQ0FBQztBQUV2QixPQUFPLEVBQ0wsY0FBYyxFQUlkLHdCQUF3QixFQUV4QixRQUFRLEdBR1QsTUFBTSxJQUFJLENBQUM7QUFFWixNQUFNLFVBQVUsVUFBVSxDQUN4QixlQUF5QixFQUN6QixnQkFBMEIsRUFDMUIsU0FBcUIsRUFDckIsWUFBbUM7SUFFbkMsZ0RBQWdEO0lBQ2hELE1BQU0sY0FBYyxHQUFHLENBQUMsQ0FBQyxNQUFNLENBQzdCLFlBQVksRUFDWixDQUFDLFdBQVcsRUFBRSxFQUFFLENBQUMsV0FBVyxDQUFDLFFBQVEsS0FBSyxRQUFRLENBQUMsRUFBRSxDQUN0RCxDQUFDO0lBQ0YsTUFBTSxjQUFjLEdBQUcsQ0FBQyxDQUFDLE1BQU0sQ0FDN0IsWUFBWSxFQUNaLENBQUMsV0FBVyxFQUFFLEVBQUUsQ0FBQyxXQUFXLENBQUMsUUFBUSxLQUFLLFFBQVEsQ0FBQyxFQUFFLENBQ3RELENBQUM7SUFDRixNQUFNLGlCQUFpQixHQUFHLENBQUMsQ0FBQyxNQUFNLENBQ2hDLFlB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