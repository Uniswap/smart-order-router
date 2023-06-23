import { ethers, utils } from "ethers";
import * as Models from "../api/generated";
import NodeCache from 'node-cache';
import { Currency, CurrencyAmount, Token } from '@uniswap/sdk-core';
import DEFAULT_TOKEN_LIST from '@uniswap/default-token-list';
import { 
  CachingTokenListProvider, 
  CachingTokenProviderWithFallback, 
  CachingV3PoolProvider, 
  ITokenProvider, 
  IV3PoolProvider, 
  NodeJSCache, 
  SimulationStatus, 
  TokenProvider, 
  UniswapMulticallProvider, 
  V3PoolProvider
} from "../providers";
import { AlphaRouter, AlphaRouterConfig, SwapOptions, SwapRoute, SwapType } from "../routers/index";
import { NATIVE_NAMES_BY_ID, SUPPORTED_CHAINS, nativeOnChain } from "../util/chains";
import { ChainId } from '@uniswap/sdk-core';
import { Percent, TradeType } from '@uniswap/sdk-core';
import { DEFAULT_ROUTING_CONFIG_BY_CHAIN } from "../routers/alpha-router/config";
import { Protocol } from "@uniswap/router-sdk";
import { PermitSingle } from "@uniswap/permit2-sdk";
import { UNIVERSAL_ROUTER_ADDRESS } from "@uniswap/universal-router-sdk";
import JSBI from "jsbi";
import { routeAmountsToString } from "../util";
import { Pool } from '@uniswap/v3-sdk'

/*
  The return codes where modelled after the GRPC return codes
  which can be found here https://grpc.github.io/grpc/core/md_doc_statuscodes.html
*/
export enum ReturnCode {
  OK = 0,
  CANCELLED = 1,
  UNKNOWN = 2,
  INVALID_ARGUMENT = 3,
  DEADLINE_EXCEEDED = 4,
  NOT_FOUND = 5,
  ALREADY_EXISTS = 6,
  PERMISSION_DENIED = 7,
  RESOURCE_EXHAUSTED = 8,
  FAILED_PRECONDITION = 9,
  ABORTED = 10,
  OUT_OF_RANGE = 11,
  UNIMPLEMENTED = 12,
  INTERNAL = 13,
  UNAVAILABLE = 14,
  DATA_LOSS = 15,
  UNAUTHENTICATED = 16,
}

export type Response = {
  statusCode: ReturnCode
  detail?: string | Models.Quote
}

export type ChainRoutingDependencies = {
  router: AlphaRouter,
  provider: ethers.providers.JsonRpcProvider
  v3PoolProvider: IV3PoolProvider
  tokenProvider: ITokenProvider
}

/**
 * @description Service that deals with hidden transaction business logic
 */
export class QuoteService {

  private static routerByChain: {
    [id in ChainId]?: ChainRoutingDependencies
  } = {}

  static async init(): Promise<void> {

    SUPPORTED_CHAINS.map(async (chainId) => {
      const url = process.env[`${chainId}_PROVIDER_URL`]
      const provider = new ethers.providers.JsonRpcProvider(
        {
          url: url as string,
          timeout: 5000,
        },
        chainId
      )

      const tokenCache = new NodeJSCache<Token>(
        new NodeCache({ stdTTL: 3600, useClones: false })
      );
      
      const multicall2Provider = new UniswapMulticallProvider(chainId, provider);
      const tokenProviderOnChain = new TokenProvider(chainId, multicall2Provider);

      const tokenListProvider = await CachingTokenListProvider.fromTokenList(
        chainId,
        DEFAULT_TOKEN_LIST,
        tokenCache
      );

      const tokenProvider = new CachingTokenProviderWithFallback(
        chainId,
        tokenCache,
        tokenListProvider,
        tokenProviderOnChain
      );
      
      const noCacheV3PoolProvider = new V3PoolProvider(chainId, multicall2Provider)
      const v3PoolProvider = new CachingV3PoolProvider(
        chainId,
        noCacheV3PoolProvider,
        new NodeJSCache(new NodeCache({ stdTTL: 360, useClones: false }))
      );
      
      const router = new AlphaRouter({
        provider,
        chainId,
        multicall2Provider,
        tokenProvider
      });

      this.routerByChain[chainId] = {
        router,
        tokenProvider,
        provider,
        v3PoolProvider
      }
    })
  }

  static async getQuote(
    {
      tokenInAddress,
      tokenOutAddress,
      amount: amountRaw,
      chain,
      type,
      recipient,
      slippageTolerance,
      deadline,
      minSplits,
      simulateFromAddress,
      permitSignature,
      permitNonce,
      permitExpiration,
      permitAmount,
      permitSigDeadline,
      enableUniversalRouter,
    }: Models.GetQuoteRequest,
    quoteId: string
  ): Promise<Response> {
    const chainId = QuoteService.chainToChainId(chain);
    const {router, tokenProvider, provider, v3PoolProvider } = this.routerByChain[chainId] || {};
    if (!router || !tokenProvider || !provider || !v3PoolProvider) {
      return {
        statusCode: ReturnCode.INTERNAL,
        detail: `Could not find dependencies for chain ${chainId}`,
      }
    }

    // if the tokenIn str is 'ETH' or 'MATIC' or in NATIVE_NAMES_BY_ID
    const currencyIn: Currency = NATIVE_NAMES_BY_ID[chainId]!.includes(tokenInAddress)
      ? nativeOnChain(chainId)
      : (await tokenProvider.getTokens([tokenInAddress])).getTokenByAddress(tokenInAddress)!;

    const currencyOut: Currency = NATIVE_NAMES_BY_ID[chainId]!.includes(tokenOutAddress)
      ? nativeOnChain(chainId)
      : (await tokenProvider.getTokens([tokenOutAddress])).getTokenByAddress(tokenOutAddress)!;

      if (!currencyIn) {
        return {
          statusCode: ReturnCode.INVALID_ARGUMENT,
          detail: `Could not find token with address "${tokenInAddress}"`,
        }
      }
     if (!currencyOut) {
        return {
          statusCode: ReturnCode.INVALID_ARGUMENT,
          detail: `Could not find token with address "${tokenOutAddress}"`,
        }
      }
  
      if (currencyIn.equals(currencyOut)) {
        return {
          statusCode: ReturnCode.INVALID_ARGUMENT,
          detail: `tokenIn and tokenOut must be different`,
        }
      }

      const routingConfig: AlphaRouterConfig = {
        ...DEFAULT_ROUTING_CONFIG_BY_CHAIN(chainId),
        ...(minSplits ? { minSplits } : {}),
        protocols: [Protocol.V3],
      }
  
      let swapParams: SwapOptions | undefined = undefined
  
      // e.g. Inputs of form "1.25%" with 2dp max. Convert to fractional representation => 1.25 => 125 / 10000
      if (slippageTolerance && deadline && recipient) {
        const slippageTolerancePercent = this.parseSlippageTolerance(slippageTolerance)
  
        // TODO: Remove once universal router is no longer behind a feature flag.
        if (enableUniversalRouter) {
          swapParams = {
            type: SwapType.UNIVERSAL_ROUTER,
            deadlineOrPreviousBlockhash: this.parseDeadline(deadline),
            recipient: recipient,
            slippageTolerance: slippageTolerancePercent,
          }
        } else {
          swapParams = {
            type: SwapType.SWAP_ROUTER_02,
            deadline: this.parseDeadline(deadline),
            recipient: recipient,
            slippageTolerance: slippageTolerancePercent,
          }
        }
  
        if (
          enableUniversalRouter &&
          permitSignature &&
          permitNonce &&
          permitExpiration &&
          permitAmount &&
          permitSigDeadline
        ) {
          const permit: PermitSingle = {
            details: {
              token: currencyIn.wrapped.address,
              amount: permitAmount,
              expiration: permitExpiration,
              nonce: permitNonce,
            },
            // TODO(felix): remove this when we start using our own contracts
            spender: UNIVERSAL_ROUTER_ADDRESS(chainId),
            sigDeadline: permitSigDeadline,
          }
  
          swapParams.inputTokenPermit = {
            ...permit,
            signature: permitSignature,
          }
        } else if (
          !enableUniversalRouter &&
          permitSignature &&
          ((permitNonce && permitExpiration) || (permitAmount && permitSigDeadline))
        ) {
          const { v, r, s } = utils.splitSignature(permitSignature)
  
          swapParams.inputTokenPermit = {
            v: v as 0 | 1 | 27 | 28,
            r,
            s,
            ...(permitNonce && permitExpiration
              ? { nonce: permitNonce!, expiry: permitExpiration! }
              : { amount: permitAmount!, deadline: permitSigDeadline! }),
          }
        }
  
        if (simulateFromAddress) {
          swapParams.simulate = { fromAddress: simulateFromAddress }
        }
      }

      let swapRoute: SwapRoute | null
      let amount: CurrencyAmount<Currency>

      const exactIn = type === Models.TradeType.ExactIn;
      if (exactIn) {
          amount = CurrencyAmount.fromRawAmount(currencyIn, JSBI.BigInt(amountRaw))
          swapRoute = await router.route(amount, currencyOut, TradeType.EXACT_INPUT, swapParams, routingConfig)
      } else {
        amount = CurrencyAmount.fromRawAmount(currencyOut, JSBI.BigInt(amountRaw))
        swapRoute = await router.route(amount, currencyIn, TradeType.EXACT_OUTPUT, swapParams, routingConfig)
      }

      if (!swapRoute) {  
        return {
          statusCode: ReturnCode.NOT_FOUND,
          detail: 'No route found',
        }
      }

      const {
        quote,
        quoteGasAdjusted,
        route,
        estimatedGasUsed,
        estimatedGasUsedQuoteToken,
        estimatedGasUsedUSD,
        gasPriceWei,
        methodParameters,
        blockNumber,
        simulationStatus,
      } = swapRoute
  
      const routeResponse: Array<Models.V3PoolInRoute[]> = []

      for (const subRoute of route) {
        const { amount, quote, tokenPath } = subRoute
  
        const pools = subRoute.protocol == Protocol.V2 ? subRoute.route.pairs : subRoute.route.pools
        const curRoute: Models.V3PoolInRoute[] = []
        for (let i = 0; i < pools.length; i++) {
          const nextPool = pools[i]
          const tokenIn = tokenPath[i]
          const tokenOut = tokenPath[i + 1]

          if (!tokenIn || !tokenOut) {
            return {
              statusCode: ReturnCode.INTERNAL,
              detail: 'Found invalid token in route',
            }
          }
  
          let edgeAmountIn: string | undefined = undefined
          if (i == 0) {
            edgeAmountIn = exactIn ? amount.quotient.toString() : quote.quotient.toString()
          }
  
          let edgeAmountOut: string | undefined = undefined
          if (i == pools.length - 1) {
            edgeAmountOut = exactIn ? quote.quotient.toString() : amount.quotient.toString()
          }
  
          if (nextPool instanceof Pool) {
            curRoute.push({
              address: v3PoolProvider.getPoolAddress(nextPool.token0, nextPool.token1, nextPool.fee).poolAddress,
              tokenIn: {
                chainId: tokenIn.chainId,
                decimals: tokenIn.decimals.toString(),
                address: tokenIn.address,
                symbol: tokenIn.symbol!,
              },
              tokenOut: {
                chainId: tokenOut.chainId,
                decimals: tokenOut.decimals.toString(),
                address: tokenOut.address,
                symbol: tokenOut.symbol!,
              },
              fee: nextPool.fee.toString(),
              liquidity: nextPool.liquidity.toString(),
              sqrtRatioX96: nextPool.sqrtRatioX96.toString(),
              tickCurrent: nextPool.tickCurrent.toString(),
              amountIn: edgeAmountIn,
              amountOut: edgeAmountOut,
            })
          } else {
            return {
              statusCode: ReturnCode.INTERNAL,
              detail: 'Found a non-V3 pool in the route',
            }
          }
        }
  
        routeResponse.push(curRoute)
      }

    const routeString = routeAmountsToString(route)

    const result: Models.Quote = {
      methodParameters,
      blockNumber: blockNumber.toString(),
      amount: amount.quotient.toString(),
      amountDecimals: amount.toExact(),
      quote: quote.quotient.toString(),
      quoteDecimals: quote.toExact(),
      quoteGasAdjusted: quoteGasAdjusted.quotient.toString(),
      quoteGasAdjustedDecimals: quoteGasAdjusted.toExact(),
      gasUseEstimateQuote: estimatedGasUsedQuoteToken.quotient.toString(),
      gasUseEstimateQuoteDecimals: estimatedGasUsedQuoteToken.toExact(),
      gasUseEstimate: estimatedGasUsed.toString(),
      gasUseEstimateUSD: estimatedGasUsedUSD.toExact(),
      simulationStatus: this.simulationStatusToString(simulationStatus),
      simulationError: simulationStatus == SimulationStatus.Failed,
      gasPriceWei: gasPriceWei.toString(),
      route: routeResponse,
      routeString,
      quoteId,
    }

    return {
      statusCode: ReturnCode.OK,
      detail: result
    }
  }

  static chainToChainId = (chain: Models.Blockchain): ChainId => {
    switch (chain) {
      case Models.Blockchain.Polygon:
        return ChainId.POLYGON;
      case Models.Blockchain.PolygonMumbai:
        return ChainId.POLYGON_MUMBAI;
      default:
        throw new Error(`Chain Name: ${chain} not supported`);
    }
  };

  static parseSlippageTolerance(slippageTolerance: string): Percent {
    const slippagePer10k = Math.round(parseFloat(slippageTolerance) * 100)
    return new Percent(slippagePer10k, 10_000)
  }
  
  static parseDeadline(deadline: string): number {
    return Math.floor(Date.now() / 1000) + parseInt(deadline)
  }

  static simulationStatusToString(simulationStatus: SimulationStatus | undefined) {
    switch (simulationStatus) {
      case undefined:
        return 'UNATTEMPTED'
      case SimulationStatus.Succeeded:
        return 'SUCCESS'
      case SimulationStatus.Failed:
        return 'FAILED'
      case SimulationStatus.InsufficientBalance:
        return 'INSUFFICIENT_BALANCE'
      case SimulationStatus.NotSupported:
        return 'NOT_SUPPORTED'
      case SimulationStatus.NotApproved:
        return 'NOT_APPROVED'
      default:
        return ''
    }
  }
}
