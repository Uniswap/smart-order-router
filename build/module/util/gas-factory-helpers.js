import { BigNumber } from '@ethersproject/bignumber';
import { Protocol } from '@uniswap/router-sdk';
import { ChainId, Token, TradeType } from '@uniswap/sdk-core';
import { FeeAmount } from '@uniswap/v3-sdk';
import brotli from 'brotli';
import JSBI from 'jsbi';
import _ from 'lodash';
import { getQuoteThroughNativePool, MixedRouteWithValidQuote, usdGasTokensByChain, V2RouteWithValidQuote, V3RouteWithValidQuote, } from '../routers';
import { CurrencyAmount, log, WRAPPED_NATIVE_CURRENCY } from '../util';
import { buildTrade } from './methodParameters';
export async function getV2NativePool(token, poolProvider, providerConfig) {
    const chainId = token.chainId;
    const weth = WRAPPED_NATIVE_CURRENCY[chainId];
    const poolAccessor = await poolProvider.getPools([[weth, token]], providerConfig);
    const pool = poolAccessor.getPool(weth, token);
    if (!pool || pool.reserve0.equalTo(0) || pool.reserve1.equalTo(0)) {
        log.error({
            weth,
            token,
            reserve0: pool === null || pool === void 0 ? void 0 : pool.reserve0.toExact(),
            reserve1: pool === null || pool === void 0 ? void 0 : pool.reserve1.toExact(),
        }, `Could not find a valid WETH V2 pool with ${token.symbol} for computing gas costs.`);
        return null;
    }
    return pool;
}
export async function getHighestLiquidityV3NativePool(token, poolProvider, providerConfig) {
    const nativeCurrency = WRAPPED_NATIVE_CURRENCY[token.chainId];
    const nativePools = _([
        FeeAmount.HIGH,
        FeeAmount.MEDIUM,
        FeeAmount.STABLE,
        FeeAmount.LOW,
        FeeAmount.LOWEST,
    ])
        .map((feeAmount) => {
        return [nativeCurrency, token, feeAmount];
    })
        .value();
    const poolAccessor = await poolProvider.getPools(nativePools, providerConfig);
    const pools = _([
        FeeAmount.HIGH,
        FeeAmount.MEDIUM,
        FeeAmount.STABLE,
        FeeAmount.LOW,
        FeeAmount.LOWEST,
    ])
        .map((feeAmount) => {
        return poolAccessor.getPool(nativeCurrency, token, feeAmount);
    })
        .compact()
        .value();
    if (pools.length == 0) {
        log.error({ pools }, `Could not find a ${nativeCurrency.symbol} pool with ${token.symbol} for computing gas costs.`);
        return null;
    }
    const maxPool = pools.reduce((prev, current) => {
        return JSBI.greaterThan(prev.liquidity, current.liquidity) ? prev : current;
    });
    return maxPool;
}
export async function getHighestLiquidityV3USDPool(chainId, poolProvider, providerConfig) {
    const usdTokens = usdGasTokensByChain[chainId];
    const wrappedCurrency = WRAPPED_NATIVE_CURRENCY[chainId];
    if (!usdTokens) {
        throw new Error(`Could not find a USD token for computing gas costs on ${chainId}`);
    }
    const usdPools = _([
        FeeAmount.HIGH,
        FeeAmount.MEDIUM,
        FeeAmount.STABLE,
        FeeAmount.LOW,
        FeeAmount.LOWEST,
    ])
        .flatMap((feeAmount) => {
        return _.map(usdTokens, (usdToken) => [
            wrappedCurrency,
            usdToken,
            feeAmount,
        ]);
    })
        .value();
    const poolAccessor = await poolProvider.getPools(usdPools, providerConfig);
    const pools = _([
        FeeAmount.HIGH,
        FeeAmount.MEDIUM,
        FeeAmount.STABLE,
        FeeAmount.LOW,
        FeeAmount.LOWEST,
    ])
        .flatMap((feeAmount) => {
        const pools = [];
        for (const usdToken of usdTokens) {
            const pool = poolAccessor.getPool(wrappedCurrency, usdToken, feeAmount);
            if (pool) {
                pools.push(pool);
            }
        }
        return pools;
    })
        .compact()
        .value();
    if (pools.length == 0) {
        const message = `Could not find a USD/${wrappedCurrency.symbol} pool for computing gas costs.`;
        log.error({ pools }, message);
        throw new Error(message);
    }
    const maxPool = pools.reduce((prev, current) => {
        return JSBI.greaterThan(prev.liquidity, current.liquidity) ? prev : current;
    });
    return maxPool;
}
export function getGasCostInNativeCurrency(nativeCurrency, gasCostInWei) {
    // wrap fee to native currency
    const costNativeCurrency = CurrencyAmount.fromRawAmount(nativeCurrency, gasCostInWei.toString());
    return costNativeCurrency;
}
export function getArbitrumBytes(data) {
    if (data == '')
        return BigNumber.from(0);
    const compressed = brotli.compress(Buffer.from(data.replace('0x', ''), 'hex'), {
        mode: 0,
        quality: 1,
        lgwin: 22,
    });
    // TODO: This is a rough estimate of the compressed size
    // Brotli 0 should be used, but this brotli library doesn't support it
    // https://github.com/foliojs/brotli.js/issues/38
    // There are other brotli libraries that do support it, but require async
    // We workaround by using Brotli 1 with a 20% bump in size
    return BigNumber.from(compressed.length).mul(120).div(100);
}
export function calculateArbitrumToL1FeeFromCalldata(calldata, gasData, chainId) {
    const { perL2TxFee, perL1CalldataFee, perArbGasTotal } = gasData;
    // calculates gas amounts based on bytes of calldata, use 0 as overhead.
    const l1GasUsed = getL2ToL1GasUsed(calldata, BigNumber.from(0), chainId);
    // multiply by the fee per calldata and add the flat l2 fee
    const l1Fee = l1GasUsed.mul(perL1CalldataFee).add(perL2TxFee);
    const gasUsedL1OnL2 = l1Fee.div(perArbGasTotal);
    return [l1GasUsed, l1Fee, gasUsedL1OnL2];
}
export function calculateOptimismToL1FeeFromCalldata(calldata, gasData, chainId) {
    const { l1BaseFee, scalar, decimals, overhead } = gasData;
    const l1GasUsed = getL2ToL1GasUsed(calldata, overhead, chainId);
    // l1BaseFee is L1 Gas Price on etherscan
    const l1Fee = l1GasUsed.mul(l1BaseFee);
    const unscaled = l1Fee.mul(scalar);
    // scaled = unscaled / (10 ** decimals)
    const scaledConversion = BigNumber.from(10).pow(decimals);
    const scaled = unscaled.div(scaledConversion);
    return [l1GasUsed, scaled];
}
export function getL2ToL1GasUsed(data, overhead, chainId) {
    switch (chainId) {
        case ChainId.ARBITRUM_ONE:
        case ChainId.ARBITRUM_GOERLI: {
            // calculates bytes of compressed calldata
            const l1ByteUsed = getArbitrumBytes(data);
            return l1ByteUsed.mul(16);
        }
        case ChainId.OPTIMISM:
        case ChainId.OPTIMISM_GOERLI:
        case ChainId.BASE:
        case ChainId.BASE_GOERLI: {
            // based on the code from the optimism OVM_GasPriceOracle contract
            // data is hex encoded
            const dataArr = data.slice(2).match(/.{1,2}/g);
            const numBytes = dataArr.length;
            let count = 0;
            for (let i = 0; i < numBytes; i += 1) {
                const byte = parseInt(dataArr[i], 16);
                if (byte == 0) {
                    count += 4;
                }
                else {
                    count += 16;
                }
            }
            const unsigned = overhead.add(count);
            const signedConversion = 68 * 16;
            return unsigned.add(signedConversion);
        }
        default:
            return BigNumber.from(0);
    }
}
export async function calculateGasUsed(chainId, route, simulatedGasUsed, v2PoolProvider, v3PoolProvider, l2GasData, providerConfig) {
    const quoteToken = route.quote.currency.wrapped;
    const gasPriceWei = route.gasPriceWei;
    // calculate L2 to L1 security fee if relevant
    let l2toL1FeeInWei = BigNumber.from(0);
    // Arbitrum charges L2 gas for L1 calldata posting costs.
    // See https://github.com/Uniswap/smart-order-router/pull/464/files#r1441376802
    if ([
        ChainId.OPTIMISM,
        ChainId.OPTIMISM_GOERLI,
        ChainId.BASE,
        ChainId.BASE_GOERLI,
    ].includes(chainId)) {
        l2toL1FeeInWei = calculateOptimismToL1FeeFromCalldata(route.methodParameters.calldata, l2GasData, chainId)[1];
    }
    // add l2 to l1 fee and wrap fee to native currency
    const gasCostInWei = gasPriceWei.mul(simulatedGasUsed).add(l2toL1FeeInWei);
    const nativeCurrency = WRAPPED_NATIVE_CURRENCY[chainId];
    const costNativeCurrency = getGasCostInNativeCurrency(nativeCurrency, gasCostInWei);
    const usdPool = await getHighestLiquidityV3USDPool(chainId, v3PoolProvider, providerConfig);
    /** ------ MARK: USD logic  -------- */
    const gasCostUSD = getQuoteThroughNativePool(chainId, costNativeCurrency, usdPool);
    /** ------ MARK: Conditional logic run if gasToken is specified  -------- */
    let gasCostInTermsOfGasToken = undefined;
    if (providerConfig === null || providerConfig === void 0 ? void 0 : providerConfig.gasToken) {
        if (providerConfig.gasToken.equals(nativeCurrency)) {
            gasCostInTermsOfGasToken = costNativeCurrency;
        }
        else {
            const nativeAndSpecifiedGasTokenPool = await getHighestLiquidityV3NativePool(providerConfig.gasToken, v3PoolProvider, providerConfig);
            if (nativeAndSpecifiedGasTokenPool) {
                gasCostInTermsOfGasToken = getQuoteThroughNativePool(chainId, costNativeCurrency, nativeAndSpecifiedGasTokenPool);
            }
            else {
                log.info(`Could not find a V3 pool for gas token ${providerConfig.gasToken.symbol}`);
            }
        }
    }
    /** ------ MARK: Main gas logic in terms of quote token -------- */
    let gasCostQuoteToken = undefined;
    // shortcut if quote token is native currency
    if (quoteToken.equals(nativeCurrency)) {
        gasCostQuoteToken = costNativeCurrency;
    }
    // get fee in terms of quote token
    else {
        const nativePools = await Promise.all([
            getHighestLiquidityV3NativePool(quoteToken, v3PoolProvider, providerConfig),
            getV2NativePool(quoteToken, v2PoolProvider, providerConfig),
        ]);
        const nativePool = nativePools.find((pool) => pool !== null);
        if (!nativePool) {
            log.info('Could not find any V2 or V3 pools to convert the cost into the quote token');
            gasCostQuoteToken = CurrencyAmount.fromRawAmount(quoteToken, 0);
        }
        else {
            gasCostQuoteToken = getQuoteThroughNativePool(chainId, costNativeCurrency, nativePool);
        }
    }
    // Adjust quote for gas fees
    let quoteGasAdjusted;
    if (route.trade.tradeType == TradeType.EXACT_OUTPUT) {
        // Exact output - need more of tokenIn to get the desired amount of tokenOut
        quoteGasAdjusted = route.quote.add(gasCostQuoteToken);
    }
    else {
        // Exact input - can get less of tokenOut due to fees
        quoteGasAdjusted = route.quote.subtract(gasCostQuoteToken);
    }
    return {
        estimatedGasUsedUSD: gasCostUSD,
        estimatedGasUsedQuoteToken: gasCostQuoteToken,
        estimatedGasUsedGasToken: gasCostInTermsOfGasToken,
        quoteGasAdjusted: quoteGasAdjusted,
    };
}
export function initSwapRouteFromExisting(swapRoute, v2PoolProvider, v3PoolProvider, portionProvider, quoteGasAdjusted, estimatedGasUsed, estimatedGasUsedQuoteToken, estimatedGasUsedUSD, swapOptions, estimatedGasUsedGasToken) {
    const currencyIn = swapRoute.trade.inputAmount.currency;
    const currencyOut = swapRoute.trade.outputAmount.currency;
    const tradeType = swapRoute.trade.tradeType.valueOf()
        ? TradeType.EXACT_OUTPUT
        : TradeType.EXACT_INPUT;
    const routesWithValidQuote = swapRoute.route.map((route) => {
        switch (route.protocol) {
            case Protocol.V3:
                return new V3RouteWithValidQuote({
                    amount: CurrencyAmount.fromFractionalAmount(route.amount.currency, route.amount.numerator, route.amount.denominator),
                    rawQuote: BigNumber.from(route.rawQuote),
                    sqrtPriceX96AfterList: route.sqrtPriceX96AfterList.map((num) => BigNumber.from(num)),
                    initializedTicksCrossedList: [...route.initializedTicksCrossedList],
                    quoterGasEstimate: BigNumber.from(route.gasEstimate),
                    percent: route.percent,
                    route: route.route,
                    gasModel: route.gasModel,
                    quoteToken: new Token(currencyIn.chainId, route.quoteToken.address, route.quoteToken.decimals, route.quoteToken.symbol, route.quoteToken.name),
                    tradeType: tradeType,
                    v3PoolProvider: v3PoolProvider,
                });
            case Protocol.V2:
                return new V2RouteWithValidQuote({
                    amount: CurrencyAmount.fromFractionalAmount(route.amount.currency, route.amount.numerator, route.amount.denominator),
                    rawQuote: BigNumber.from(route.rawQuote),
                    percent: route.percent,
                    route: route.route,
                    gasModel: route.gasModel,
                    quoteToken: new Token(currencyIn.chainId, route.quoteToken.address, route.quoteToken.decimals, route.quoteToken.symbol, route.quoteToken.name),
                    tradeType: tradeType,
                    v2PoolProvider: v2PoolProvider,
                });
            case Protocol.MIXED:
                return new MixedRouteWithValidQuote({
                    amount: CurrencyAmount.fromFractionalAmount(route.amount.currency, route.amount.numerator, route.amount.denominator),
                    rawQuote: BigNumber.from(route.rawQuote),
                    sqrtPriceX96AfterList: route.sqrtPriceX96AfterList.map((num) => BigNumber.from(num)),
                    initializedTicksCrossedList: [...route.initializedTicksCrossedList],
                    quoterGasEstimate: BigNumber.from(route.gasEstimate),
                    percent: route.percent,
                    route: route.route,
                    mixedRouteGasModel: route.gasModel,
                    v2PoolProvider,
                    quoteToken: new Token(currencyIn.chainId, route.quoteToken.address, route.quoteToken.decimals, route.quoteToken.symbol, route.quoteToken.name),
                    tradeType: tradeType,
                    v3PoolProvider: v3PoolProvider,
                });
        }
    });
    const trade = buildTrade(currencyIn, currencyOut, tradeType, routesWithValidQuote);
    const quoteGasAndPortionAdjusted = swapRoute.portionAmount
        ? portionProvider.getQuoteGasAndPortionAdjusted(swapRoute.trade.tradeType, quoteGasAdjusted, swapRoute.portionAmount)
        : undefined;
    const routesWithValidQuotePortionAdjusted = portionProvider.getRouteWithQuotePortionAdjusted(swapRoute.trade.tradeType, routesWithValidQuote, swapOptions);
    return {
        quote: swapRoute.quote,
        quoteGasAdjusted,
        quoteGasAndPortionAdjusted,
        estimatedGasUsed,
        estimatedGasUsedQuoteToken,
        estimatedGasUsedGasToken,
        estimatedGasUsedUSD,
        gasPriceWei: BigNumber.from(swapRoute.gasPriceWei),
        trade,
        route: routesWithValidQuotePortionAdjusted,
        blockNumber: BigNumber.from(swapRoute.blockNumber),
        methodParameters: swapRoute.methodParameters
            ? {
                calldata: swapRoute.methodParameters.calldata,
                value: swapRoute.methodParameters.value,
                to: swapRoute.methodParameters.to,
            }
            : undefined,
        simulationStatus: swapRoute.simulationStatus,
        portionAmount: swapRoute.portionAmount,
    };
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZ2FzLWZhY3RvcnktaGVscGVycy5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbIi4uLy4uLy4uL3NyYy91dGlsL2dhcy1mYWN0b3J5LWhlbHBlcnMudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUEsT0FBTyxFQUFFLFNBQVMsRUFBRSxNQUFNLDBCQUEwQixDQUFDO0FBQ3JELE9BQU8sRUFBRSxRQUFRLEVBQUUsTUFBTSxxQkFBcUIsQ0FBQztBQUMvQyxPQUFPLEVBQUUsT0FBTyxFQUFFLEtBQUssRUFBRSxTQUFTLEVBQUUsTUFBTSxtQkFBbUIsQ0FBQztBQUU5RCxPQUFPLEVBQUUsU0FBUyxFQUFRLE1BQU0saUJBQWlCLENBQUM7QUFDbEQsT0FBTyxNQUFNLE1BQU0sUUFBUSxDQUFDO0FBQzVCLE9BQU8sSUFBSSxNQUFNLE1BQU0sQ0FBQztBQUN4QixPQUFPLENBQUMsTUFBTSxRQUFRLENBQUM7QUFTdkIsT0FBTyxFQUVMLHlCQUF5QixFQUV6Qix3QkFBd0IsRUFHeEIsbUJBQW1CLEVBQ25CLHFCQUFxQixFQUNyQixxQkFBcUIsR0FDdEIsTUFBTSxZQUFZLENBQUM7QUFDcEIsT0FBTyxFQUFFLGNBQWMsRUFBRSxHQUFHLEVBQUUsdUJBQXVCLEVBQUUsTUFBTSxTQUFTLENBQUM7QUFFdkUsT0FBTyxFQUFFLFVBQVUsRUFBRSxNQUFNLG9CQUFvQixDQUFDO0FBRWhELE1BQU0sQ0FBQyxLQUFLLFVBQVUsZUFBZSxDQUNuQyxLQUFZLEVBQ1osWUFBNkIsRUFDN0IsY0FBdUM7SUFFdkMsTUFBTSxPQUFPLEdBQUcsS0FBSyxDQUFDLE9BQWtCLENBQUM7SUFDekMsTUFBTSxJQUFJLEdBQUcsdUJBQXVCLENBQUMsT0FBTyxDQUFFLENBQUM7SUFFL0MsTUFBTSxZQUFZLEdBQUcsTUFBTSxZQUFZLENBQUMsUUFBUSxDQUM5QyxDQUFDLENBQUMsSUFBSSxFQUFFLEtBQUssQ0FBQyxDQUFDLEVBQ2YsY0FBYyxDQUNmLENBQUM7SUFDRixNQUFNLElBQUksR0FB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