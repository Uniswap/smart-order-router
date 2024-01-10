import { BigNumber } from '@ethersproject/bignumber';
import { Protocol } from '@uniswap/router-sdk';
import { ChainId, Token, TradeType } from '@uniswap/sdk-core';
import { Pair } from '@uniswap/v2-sdk/dist/entities';
import { FeeAmount, Pool } from '@uniswap/v3-sdk';
import JSBI from 'jsbi';
import _ from 'lodash';

import { IV2PoolProvider } from '../providers';
import { IPortionProvider } from '../providers/portion-provider';
import {
  ArbitrumGasData,
  OptimismGasData,
} from '../providers/v3/gas-data-provider';
import { IV3PoolProvider } from '../providers/v3/pool-provider';
import {
  GasModelProviderConfig,
  getQuoteThroughNativePool,
  MethodParameters,
  MixedRouteWithValidQuote,
  SwapOptions,
  SwapRoute,
  usdGasTokensByChain,
  V2RouteWithValidQuote,
  V3RouteWithValidQuote,
} from '../routers';
import { CurrencyAmount, log, WRAPPED_NATIVE_CURRENCY } from '../util';

import { buildTrade } from './methodParameters';

export async function getV2NativePool(
  token: Token,
  poolProvider: IV2PoolProvider,
  providerConfig?: GasModelProviderConfig
): Promise<Pair | null> {
  const chainId = token.chainId as ChainId;
  const weth = WRAPPED_NATIVE_CURRENCY[chainId]!;

  const poolAccessor = await poolProvider.getPools(
    [[weth, token]],
    providerConfig
  );
  const pool = poolAccessor.getPool(weth, token);

  if (!pool || pool.reserve0.equalTo(0) || pool.reserve1.equalTo(0)) {
    log.error(
      {
        weth,
        token,
        reserve0: pool?.reserve0.toExact(),
        reserve1: pool?.reserve1.toExact(),
      },
      `Could not find a valid WETH V2 pool with ${token.symbol} for computing gas costs.`
    );

    return null;
  }

  return pool;
}

export async function getHighestLiquidityV3NativePool(
  token: Token,
  poolProvider: IV3PoolProvider,
  providerConfig?: GasModelProviderConfig
): Promise<Pool | null> {
  const nativeCurrency = WRAPPED_NATIVE_CURRENCY[token.chainId as ChainId]!;

  const nativePools = _([
    FeeAmount.HIGH,
    FeeAmount.MEDIUM,
    FeeAmount.LOW,
    FeeAmount.LOWEST,
  ])
    .map<[Token, Token, FeeAmount]>((feeAmount) => {
      return [nativeCurrency, token, feeAmount];
    })
    .value();

  const poolAccessor = await poolProvider.getPools(nativePools, providerConfig);

  const pools = _([
    FeeAmount.HIGH,
    FeeAmount.MEDIUM,
    FeeAmount.LOW,
    FeeAmount.LOWEST,
  ])
    .map((feeAmount) => {
      return poolAccessor.getPool(nativeCurrency, token, feeAmount);
    })
    .compact()
    .value();

  if (pools.length == 0) {
    log.error(
      { pools },
      `Could not find a ${nativeCurrency.symbol} pool with ${token.symbol} for computing gas costs.`
    );

    return null;
  }

  const maxPool = pools.reduce((prev, current) => {
    return JSBI.greaterThan(prev.liquidity, current.liquidity) ? prev : current;
  });

  return maxPool;
}

export async function getHighestLiquidityV3USDPool(
  chainId: ChainId,
  poolProvider: IV3PoolProvider,
  providerConfig?: GasModelProviderConfig
): Promise<Pool> {
  const usdTokens = usdGasTokensByChain[chainId];
  const wrappedCurrency = WRAPPED_NATIVE_CURRENCY[chainId]!;

  if (!usdTokens) {
    throw new Error(
      `Could not find a USD token for computing gas costs on ${chainId}`
    );
  }

  const usdPools = _([
    FeeAmount.HIGH,
    FeeAmount.MEDIUM,
    FeeAmount.LOW,
    FeeAmount.LOWEST,
  ])
    .flatMap((feeAmount) => {
      return _.map<Token, [Token, Token, FeeAmount]>(usdTokens, (usdToken) => [
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

export function getGasCostInNativeCurrency(
  nativeCurrency: Token,
  gasCostInWei: BigNumber
) {
  // wrap fee to native currency
  const costNativeCurrency = CurrencyAmount.fromRawAmount(
    nativeCurrency,
    gasCostInWei.toString()
  );
  return costNativeCurrency;
}

export function calculateArbitrumToL1FeeFromCalldata(
  calldata: string,
  gasData: ArbitrumGasData
): [BigNumber, BigNumber] {
  const { perL2TxFee, perL1CalldataFee } = gasData;
  // calculates gas amounts based on bytes of calldata, use 0 as overhead.
  const l1GasUsed = getL2ToL1GasUsed(calldata, BigNumber.from(0));
  // multiply by the fee per calldata and add the flat l2 fee
  let l1Fee = l1GasUsed.mul(perL1CalldataFee);
  l1Fee = l1Fee.add(perL2TxFee);
  return [l1GasUsed, l1Fee];
}

export function calculateOptimismToL1FeeFromCalldata(
  calldata: string,
  gasData: OptimismGasData
): [BigNumber, BigNumber] {
  const { l1BaseFee, scalar, decimals, overhead } = gasData;

  const l1GasUsed = getL2ToL1GasUsed(calldata, overhead);
  // l1BaseFee is L1 Gas Price on etherscan
  const l1Fee = l1GasUsed.mul(l1BaseFee);
  const unscaled = l1Fee.mul(scalar);
  // scaled = unscaled / (10 ** decimals)
  const scaledConversion = BigNumber.from(10).pow(decimals);
  const scaled = unscaled.div(scaledConversion);
  return [l1GasUsed, scaled];
}

// based on the code from the optimism OVM_GasPriceOracle contract
export function getL2ToL1GasUsed(data: string, overhead: BigNumber): BigNumber {
  // data is hex encoded
  const dataArr: string[] = data.slice(2).match(/.{1,2}/g)!;
  const numBytes = dataArr.length;
  let count = 0;
  for (let i = 0; i < numBytes; i += 1) {
    const byte = parseInt(dataArr[i]!, 16);
    if (byte == 0) {
      count += 4;
    } else {
      count += 16;
    }
  }
  const unsigned = overhead.add(count);
  const signedConversion = 68 * 16;
  return unsigned.add(signedConversion);
}

export async function calculateGasUsed(
  chainId: ChainId,
  route: SwapRoute,
  simulatedGasUsed: BigNumber,
  v2PoolProvider: IV2PoolProvider,
  v3PoolProvider: IV3PoolProvider,
  l2GasData?: ArbitrumGasData | OptimismGasData,
  providerConfig?: GasModelProviderConfig
): Promise<{
  estimatedGasUsedUSD: CurrencyAmount;
  estimatedGasUsedQuoteToken: CurrencyAmount;
  estimatedGasUsedGasToken?: CurrencyAmount;
  quoteGasAdjusted: CurrencyAmount;
}> {
  const quoteToken = route.quote.currency.wrapped;
  const gasPriceWei = route.gasPriceWei;
  // calculate L2 to L1 security fee if relevant
  let l2toL1FeeInWei = BigNumber.from(0);
  // Arbitrum charges L2 gas for L1 calldata posting costs.
  // See https://github.com/Uniswap/smart-order-router/pull/464/files#r1441376802
  if (
    [
      ChainId.OPTIMISM,
      ChainId.OPTIMISM_GOERLI,
      ChainId.BASE,
      ChainId.BASE_GOERLI,
    ].includes(chainId)
  ) {
    l2toL1FeeInWei = calculateOptimismToL1FeeFromCalldata(
      route.methodParameters!.calldata,
      l2GasData as OptimismGasData
    )[1];
  }

  // add l2 to l1 fee and wrap fee to native currency
  const gasCostInWei = gasPriceWei.mul(simulatedGasUsed).add(l2toL1FeeInWei);
  const nativeCurrency = WRAPPED_NATIVE_CURRENCY[chainId];
  const costNativeCurrency = getGasCostInNativeCurrency(
    nativeCurrency,
    gasCostInWei
  );

  const usdPool: Pool = await getHighestLiquidityV3USDPool(
    chainId,
    v3PoolProvider,
    providerConfig
  );

  /** ------ MARK: USD logic  -------- */
  const gasCostUSD = getQuoteThroughNativePool(
    chainId,
    costNativeCurrency,
    usdPool
  );

  /** ------ MARK: Conditional logic run if gasToken is specified  -------- */
  let gasCostInTermsOfGasToken: CurrencyAmount | undefined = undefined;
  if (providerConfig?.gasToken) {
    if (providerConfig.gasToken.equals(nativeCurrency)) {
      gasCostInTermsOfGasToken = costNativeCurrency;
    } else {
      const nativeAndSpecifiedGasTokenPool =
        await getHighestLiquidityV3NativePool(
          providerConfig.gasToken,
          v3PoolProvider,
          providerConfig
        );
      if (nativeAndSpecifiedGasTokenPool) {
        gasCostInTermsOfGasToken = getQuoteThroughNativePool(
          chainId,
          costNativeCurrency,
          nativeAndSpecifiedGasTokenPool
        );
      } else {
        log.info(
          `Could not find a V3 pool for gas token ${providerConfig.gasToken.symbol}`
        );
      }
    }
  }

  /** ------ MARK: Main gas logic in terms of quote token -------- */
  let gasCostQuoteToken: CurrencyAmount | undefined = undefined;
  // shortcut if quote token is native currency
  if (quoteToken.equals(nativeCurrency)) {
    gasCostQuoteToken = costNativeCurrency;
  }
  // get fee in terms of quote token
  else {
    const nativePools = await Promise.all([
      getHighestLiquidityV3NativePool(
        quoteToken,
        v3PoolProvider,
        providerConfig
      ),
      getV2NativePool(quoteToken, v2PoolProvider, providerConfig),
    ]);
    const nativePool = nativePools.find((pool) => pool !== null);

    if (!nativePool) {
      log.info(
        'Could not find any V2 or V3 pools to convert the cost into the quote token'
      );
      gasCostQuoteToken = CurrencyAmount.fromRawAmount(quoteToken, 0);
    } else {
      gasCostQuoteToken = getQuoteThroughNativePool(
        chainId,
        costNativeCurrency,
        nativePool
      );
    }
  }

  // Adjust quote for gas fees
  let quoteGasAdjusted;
  if (route.trade.tradeType == TradeType.EXACT_OUTPUT) {
    // Exact output - need more of tokenIn to get the desired amount of tokenOut
    quoteGasAdjusted = route.quote.add(gasCostQuoteToken);
  } else {
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

export function initSwapRouteFromExisting(
  swapRoute: SwapRoute,
  v2PoolProvider: IV2PoolProvider,
  v3PoolProvider: IV3PoolProvider,
  portionProvider: IPortionProvider,
  quoteGasAdjusted: CurrencyAmount,
  estimatedGasUsed: BigNumber,
  estimatedGasUsedQuoteToken: CurrencyAmount,
  estimatedGasUsedUSD: CurrencyAmount,
  swapOptions: SwapOptions,
  estimatedGasUsedGasToken?: CurrencyAmount
): SwapRoute {
  const currencyIn = swapRoute.trade.inputAmount.currency;
  const currencyOut = swapRoute.trade.outputAmount.currency;
  const tradeType = swapRoute.trade.tradeType.valueOf()
    ? TradeType.EXACT_OUTPUT
    : TradeType.EXACT_INPUT;
  const routesWithValidQuote = swapRoute.route.map((route) => {
    switch (route.protocol) {
      case Protocol.V3:
        return new V3RouteWithValidQuote({
          amount: CurrencyAmount.fromFractionalAmount(
            route.amount.currency,
            route.amount.numerator,
            route.amount.denominator
          ),
          rawQuote: BigNumber.from(route.rawQuote),
          sqrtPriceX96AfterList: route.sqrtPriceX96AfterList.map((num) =>
            BigNumber.from(num)
          ),
          initializedTicksCrossedList: [...route.initializedTicksCrossedList],
          quoterGasEstimate: BigNumber.from(route.gasEstimate),
          percent: route.percent,
          route: route.route,
          gasModel: route.gasModel,
          quoteToken: new Token(
            currencyIn.chainId,
            route.quoteToken.address,
            route.quoteToken.decimals,
            route.quoteToken.symbol,
            route.quoteToken.name
          ),
          tradeType: tradeType,
          v3PoolProvider: v3PoolProvider,
        });
      case Protocol.V2:
        return new V2RouteWithValidQuote({
          amount: CurrencyAmount.fromFractionalAmount(
            route.amount.currency,
            route.amount.numerator,
            route.amount.denominator
          ),
          rawQuote: BigNumber.from(route.rawQuote),
          percent: route.percent,
          route: route.route,
          gasModel: route.gasModel,
          quoteToken: new Token(
            currencyIn.chainId,
            route.quoteToken.address,
            route.quoteToken.decimals,
            route.quoteToken.symbol,
            route.quoteToken.name
          ),
          tradeType: tradeType,
          v2PoolProvider: v2PoolProvider,
        });
      case Protocol.MIXED:
        return new MixedRouteWithValidQuote({
          amount: CurrencyAmount.fromFractionalAmount(
            route.amount.currency,
            route.amount.numerator,
            route.amount.denominator
          ),
          rawQuote: BigNumber.from(route.rawQuote),
          sqrtPriceX96AfterList: route.sqrtPriceX96AfterList.map((num) =>
            BigNumber.from(num)
          ),
          initializedTicksCrossedList: [...route.initializedTicksCrossedList],
          quoterGasEstimate: BigNumber.from(route.gasEstimate),
          percent: route.percent,
          route: route.route,
          mixedRouteGasModel: route.gasModel,
          v2PoolProvider,
          quoteToken: new Token(
            currencyIn.chainId,
            route.quoteToken.address,
            route.quoteToken.decimals,
            route.quoteToken.symbol,
            route.quoteToken.name
          ),
          tradeType: tradeType,
          v3PoolProvider: v3PoolProvider,
        });
    }
  });
  const trade = buildTrade<typeof tradeType>(
    currencyIn,
    currencyOut,
    tradeType,
    routesWithValidQuote
  );

  const quoteGasAndPortionAdjusted = swapRoute.portionAmount
    ? portionProvider.getQuoteGasAndPortionAdjusted(
        swapRoute.trade.tradeType,
        quoteGasAdjusted,
        swapRoute.portionAmount
      )
    : undefined;
  const routesWithValidQuotePortionAdjusted =
    portionProvider.getRouteWithQuotePortionAdjusted(
      swapRoute.trade.tradeType,
      routesWithValidQuote,
      swapOptions
    );

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
      ? ({
          calldata: swapRoute.methodParameters.calldata,
          value: swapRoute.methodParameters.value,
          to: swapRoute.methodParameters.to,
        } as MethodParameters)
      : undefined,
    simulationStatus: swapRoute.simulationStatus,
    portionAmount: swapRoute.portionAmount,
  };
}
