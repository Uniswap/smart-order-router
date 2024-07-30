import { BigNumber } from '@ethersproject/bignumber';
import { Protocol } from '@uniswap/router-sdk';
import { ChainId, Percent, Token, TradeType } from '@uniswap/sdk-core';
import { FeeAmount, Pool } from '@uniswap/v3-sdk';
import brotli from 'brotli';
import JSBI from 'jsbi';
import _ from 'lodash';

import { IV2PoolProvider } from '../providers';
import { IPortionProvider } from '../providers/portion-provider';
import { ArbitrumGasData } from '../providers/v3/gas-data-provider';
import { IV3PoolProvider } from '../providers/v3/pool-provider';
import {
  GasModelProviderConfig,
  getQuoteThroughNativePool,
  MethodParameters,
  MixedRouteWithValidQuote,
  RouteWithValidQuote,
  SwapOptions,
  SwapOptionsUniversalRouter,
  SwapRoute,
  SwapType,
  usdGasTokensByChain,
  V2RouteWithValidQuote,
  V3RouteWithValidQuote,
} from '../routers';
import { CurrencyAmount, log, WRAPPED_NATIVE_CURRENCY } from '../util';

import { estimateL1Gas, estimateL1GasCost } from '@eth-optimism/sdk';
import { BaseProvider, TransactionRequest } from '@ethersproject/providers';
import { Pair } from '@uniswap/v2-sdk';
import { ProviderConfig } from '../providers/provider';
import { opStackChains } from './l2FeeChains';
import { buildSwapMethodParameters, buildTrade } from './methodParameters';

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

export function getArbitrumBytes(data: string): BigNumber {
  if (data == '') return BigNumber.from(0);
  const compressed = brotli.compress(
    Buffer.from(data.replace('0x', ''), 'hex'),
    {
      mode: 0,
      quality: 1,
      lgwin: 22,
    }
  );
  // TODO: This is a rough estimate of the compressed size
  // Brotli 0 should be used, but this brotli library doesn't support it
  // https://github.com/foliojs/brotli.js/issues/38
  // There are other brotli libraries that do support it, but require async
  // We workaround by using Brotli 1 with a 20% bump in size
  return BigNumber.from(compressed.length).mul(120).div(100);
}

export function calculateArbitrumToL1FeeFromCalldata(
  calldata: string,
  gasData: ArbitrumGasData,
  chainId: ChainId
): [BigNumber, BigNumber, BigNumber] {
  const { perL2TxFee, perL1CalldataFee, perArbGasTotal } = gasData;
  // calculates gas amounts based on bytes of calldata, use 0 as overhead.
  const l1GasUsed = getL2ToL1GasUsed(calldata, chainId);
  // multiply by the fee per calldata and add the flat l2 fee
  const l1Fee = l1GasUsed.mul(perL1CalldataFee).add(perL2TxFee);
  const gasUsedL1OnL2 = l1Fee.div(perArbGasTotal);
  return [l1GasUsed, l1Fee, gasUsedL1OnL2];
}

export async function calculateOptimismToL1FeeFromCalldata(
  calldata: string,
  chainId: ChainId,
  provider: BaseProvider
): Promise<[BigNumber, BigNumber]> {
  const tx: TransactionRequest = {
    data: calldata,
    chainId: chainId,
    type: 2, // sign the transaction as EIP-1559, otherwise it will fail at maxFeePerGas
  };
  const [l1GasUsed, l1GasCost] = await Promise.all([
    estimateL1Gas(provider, tx),
    estimateL1GasCost(provider, tx),
  ]);
  return [l1GasUsed, l1GasCost];
}

export function getL2ToL1GasUsed(data: string, chainId: ChainId): BigNumber {
  switch (chainId) {
    case ChainId.ARBITRUM_ONE:
    case ChainId.ARBITRUM_GOERLI: {
      // calculates bytes of compressed calldata
      const l1ByteUsed = getArbitrumBytes(data);
      return l1ByteUsed.mul(16);
    }
    default:
      return BigNumber.from(0);
  }
}

export async function calculateGasUsed(
  chainId: ChainId,
  route: SwapRoute,
  simulatedGasUsed: BigNumber,
  v2PoolProvider: IV2PoolProvider,
  v3PoolProvider: IV3PoolProvider,
  provider: BaseProvider,
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
  if (opStackChains.includes(chainId)) {
    l2toL1FeeInWei = (
      await calculateOptimismToL1FeeFromCalldata(
        route.methodParameters!.calldata,
        chainId,
        provider
      )
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
  estimatedGasUsedGasToken?: CurrencyAmount,
  providerConfig?: ProviderConfig
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
      swapOptions,
      providerConfig
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

export const calculateL1GasFeesHelper = async (
  route: RouteWithValidQuote[],
  chainId: ChainId,
  usdPool: Pair | Pool,
  quoteToken: Token,
  nativePool: Pair | Pool | null,
  provider: BaseProvider,
  l2GasData?: ArbitrumGasData
): Promise<{
  gasUsedL1: BigNumber;
  gasUsedL1OnL2: BigNumber;
  gasCostL1USD: CurrencyAmount;
  gasCostL1QuoteToken: CurrencyAmount;
}> => {
  const swapOptions: SwapOptionsUniversalRouter = {
    type: SwapType.UNIVERSAL_ROUTER,
    recipient: '0x0000000000000000000000000000000000000001',
    deadlineOrPreviousBlockhash: 100,
    slippageTolerance: new Percent(5, 10_000),
  };
  let mainnetGasUsed = BigNumber.from(0);
  let mainnetFeeInWei = BigNumber.from(0);
  let gasUsedL1OnL2 = BigNumber.from(0);
  if (opStackChains.includes(chainId)) {
    [mainnetGasUsed, mainnetFeeInWei] = await calculateOptimismToL1SecurityFee(
      route,
      swapOptions,
      chainId,
      provider
    );
  } else if (
    chainId == ChainId.ARBITRUM_ONE ||
    chainId == ChainId.ARBITRUM_GOERLI
  ) {
    [mainnetGasUsed, mainnetFeeInWei, gasUsedL1OnL2] =
      calculateArbitrumToL1SecurityFee(
        route,
        swapOptions,
        l2GasData as ArbitrumGasData,
        chainId
      );
  }

  // wrap fee to native currency
  const nativeCurrency = WRAPPED_NATIVE_CURRENCY[chainId];
  const costNativeCurrency = CurrencyAmount.fromRawAmount(
    nativeCurrency,
    mainnetFeeInWei.toString()
  );

  // convert fee into usd
  const gasCostL1USD: CurrencyAmount = getQuoteThroughNativePool(
    chainId,
    costNativeCurrency,
    usdPool
  );

  let gasCostL1QuoteToken = costNativeCurrency;
  // if the inputted token is not in the native currency, quote a native/quote token pool to get the gas cost in terms of the quote token
  if (!quoteToken.equals(nativeCurrency)) {
    if (!nativePool) {
      log.info(
        'Could not find a pool to convert the cost into the quote token'
      );
      gasCostL1QuoteToken = CurrencyAmount.fromRawAmount(quoteToken, 0);
    } else {
      const nativeTokenPrice =
        nativePool.token0.address == nativeCurrency.address
          ? nativePool.token0Price
          : nativePool.token1Price;
      gasCostL1QuoteToken = nativeTokenPrice.quote(costNativeCurrency);
    }
  }
  // gasUsedL1 is the gas units used calculated from the bytes of the calldata
  // gasCostL1USD and gasCostL1QuoteToken is the cost of gas in each of those tokens
  return {
    gasUsedL1: mainnetGasUsed,
    gasUsedL1OnL2,
    gasCostL1USD,
    gasCostL1QuoteToken,
  };

  /**
   * To avoid having a call to optimism's L1 security fee contract for every route and amount combination,
   * we replicate the gas cost accounting here.
   */
  async function calculateOptimismToL1SecurityFee(
    routes: RouteWithValidQuote[],
    swapConfig: SwapOptionsUniversalRouter,
    chainId: ChainId,
    provider: BaseProvider
  ): Promise<[BigNumber, BigNumber]> {
    const route: RouteWithValidQuote = routes[0]!;
    const amountToken =
      route.tradeType == TradeType.EXACT_INPUT
        ? route.amount.currency
        : route.quote.currency;
    const outputToken =
      route.tradeType == TradeType.EXACT_INPUT
        ? route.quote.currency
        : route.amount.currency;

    // build trade for swap calldata
    const trade = buildTrade(amountToken, outputToken, route.tradeType, routes);
    const data = buildSwapMethodParameters(
      trade,
      swapConfig,
      ChainId.OPTIMISM
    ).calldata;

    const [l1GasUsed, l1GasCost] = await calculateOptimismToL1FeeFromCalldata(
      data,
      chainId,
      provider
    );
    return [l1GasUsed, l1GasCost];
  }

  function calculateArbitrumToL1SecurityFee(
    routes: RouteWithValidQuote[],
    swapConfig: SwapOptionsUniversalRouter,
    gasData: ArbitrumGasData,
    chainId: ChainId
  ): [BigNumber, BigNumber, BigNumber] {
    const route: RouteWithValidQuote = routes[0]!;

    const amountToken =
      route.tradeType == TradeType.EXACT_INPUT
        ? route.amount.currency
        : route.quote.currency;
    const outputToken =
      route.tradeType == TradeType.EXACT_INPUT
        ? route.quote.currency
        : route.amount.currency;

    // build trade for swap calldata
    const trade = buildTrade(amountToken, outputToken, route.tradeType, routes);
    const data = buildSwapMethodParameters(
      trade,
      swapConfig,
      ChainId.ARBITRUM_ONE
    ).calldata;
    return calculateArbitrumToL1FeeFromCalldata(data, gasData, chainId);
  }
};
