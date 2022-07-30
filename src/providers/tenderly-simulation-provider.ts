import { Token } from '@uniswap/sdk-core';
import { FeeAmount, Pool } from '@uniswap/v3-sdk';
import axios from 'axios'
import { BigNumber } from 'ethers/lib/ethers';
import _ from 'lodash';

import { SwapRoute, usdGasTokensByChain } from '../routers'
import { ChainId, CurrencyAmount, log, WRAPPED_NATIVE_CURRENCY } from '../util'
import { APPROVE_TOKEN_FOR_TRANSFER, V3_ROUTER2_ADDRESS } from '../util/callData'

import { IV3PoolProvider } from './v3/pool-provider';

export const TENDERLY_BATCH_SIMULATE_API = (
  tenderlyBaseUrl: string,
  tenderlyUser: string,
  tenderlyProject: string
) => `${tenderlyBaseUrl}/api/v1/account/${tenderlyUser}/project/${tenderlyProject}/simulate-batch`

/**
 * Provider for dry running transactions on tenderly.
 *
 * @export
 * @interface ISimulator
 */
export interface ISimulator {
  /**
   * Returns the gas fee that was paid to land the transaction in the simulation.
   * @returns number or Error
   */
  simulateTransaction: (
    tokenIn: Token,
    fromAddress: string,
    route: SwapRoute,
    poolProvider: IV3PoolProvider
  ) => Promise<SwapRoute>
}
export class TenderlyProvider implements ISimulator {
  private tenderlyBaseUrl: string
  private tenderlyUser: string
  private tenderlyProject: string
  private tenderlyAccessKey: string

  constructor(tenderlyBaseUrl: string, tenderlyUser: string, tenderlyProject: string, tenderlyAccessKey: string) {
    this.tenderlyBaseUrl = tenderlyBaseUrl
    this.tenderlyUser = tenderlyUser
    this.tenderlyProject = tenderlyProject
    this.tenderlyAccessKey = tenderlyAccessKey
  }

  public async simulateTransaction(
    tokenIn: Token,
    fromAddress: string,
    route: SwapRoute,
    poolProvider: IV3PoolProvider,
  ): Promise<SwapRoute> {
    const { calldata } = route.methodParameters!
    if(!route.methodParameters) {
      throw new Error("No calldata provided to simulate transaction")
    }
    log.info(
      {
        calldata: route.methodParameters.calldata,
        fromAddress: fromAddress,
        chainId: tokenIn.chainId,
        tokenInAddress: tokenIn.address,
      },
      'Simulating transaction via Tenderly'
    )

    const approve = {
      network_id: tokenIn.chainId,
      input: APPROVE_TOKEN_FOR_TRANSFER,
      to: tokenIn.address,
      value: "0",
      from: fromAddress,
      gasPrice: "0",
      gas: 30000000,
    }

    const swap = {
      network_id: tokenIn.chainId,
      input: calldata,
      to: V3_ROUTER2_ADDRESS,
      value: "0",
      from: fromAddress,
      gasPrice: "0",
      gas: 30000000,
      type: 1,
      estimate_gas: true,
    }

    const body = {"simulations": [approve, swap]}
    const opts = {
      headers: {
        'X-Access-Key': this.tenderlyAccessKey,
      },
    }
    const url = TENDERLY_BATCH_SIMULATE_API(this.tenderlyBaseUrl, this.tenderlyUser, this.tenderlyProject)
    const resp = await axios.post(url, body, opts)

    // Validate tenderly response body
    if(resp.data && resp.data.simulation_results.length == 2 && resp.data.simulation_results[1].transaction && !resp.data.simulation_results[1].transaction.error) {
      log.info({approve:resp.data.simulation_results[0],swap:resp.data.simulation_results[1]}, 'Simulated Transaction Via Tenderly')
      const l1FeeInWei = resp.data.simulation_results[1].transaction.gas_used as BigNumber
       // wrap fee to native currency
       const nativeCurrency = WRAPPED_NATIVE_CURRENCY[tokenIn.chainId as ChainId];
       const costNativeCurrency = CurrencyAmount.fromRawAmount(
         nativeCurrency,
         l1FeeInWei.toString()
       );

       const usdPool: Pool = await this.getHighestLiquidityUSDPool(
        tokenIn.chainId,
        poolProvider
      );
 
       // convert fee into usd
       const nativeTokenPrice =
         usdPool.token0.address == nativeCurrency.address
           ? usdPool.token0Price
           : usdPool.token1Price;

           const gasCostL1USD: CurrencyAmount =
           nativeTokenPrice.quote(costNativeCurrency);
   
         let gasCostL1QuoteToken = costNativeCurrency;
         // if the inputted token is not in the native currency, quote a native/quote token pool to get the gas cost in terms of the quote token
         if (!tokenIn.equals(nativeCurrency)) {
           const nativePool: Pool | null =
             await this.getHighestLiquidityNativePool(
               tokenIn.chainId,
               tokenIn,
               poolProvider
             );
           if (!nativePool) {
             log.info(
               'Could not find a pool to convert the cost into the quote token'
             );
             gasCostL1QuoteToken = CurrencyAmount.fromRawAmount(tokenIn, 0);
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
         route.estimatedGasUsed = resp.data.simulation_results[1].transaction.gas_used as BigNumber
         route = {...route, estimatedGasUsed:l1FeeInWei, estimatedGasUsedUSD: gasCostL1USD, estimatedGasUsedQuoteToken: gasCostL1QuoteToken}
         return route
    } else {
      const errMsg = `Failed to Simulate Via Tenderly!`
      log.info({resp:resp},errMsg)
      throw new Error(errMsg)
    }
    return route
  }
  private async getHighestLiquidityUSDPool(
    chainId: ChainId,
    poolProvider: IV3PoolProvider
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
        return _.map<Token, [Token, Token, FeeAmount]>(
          usdTokens,
          (usdToken) => [wrappedCurrency, usdToken, feeAmount]
        );
      })
      .value();

    const poolAccessor = await poolProvider.getPools(usdPools);

    const pools = _([
      FeeAmount.HIGH,
      FeeAmount.MEDIUM,
      FeeAmount.LOW,
      FeeAmount.LOWEST,
    ])
      .flatMap((feeAmount) => {
        const pools = [];

        for (const usdToken of usdTokens) {
          const pool = poolAccessor.getPool(
            wrappedCurrency,
            usdToken,
            feeAmount
          );
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

    const maxPool = _.maxBy(pools, (pool) => pool.liquidity) as Pool;

    return maxPool;
  }
  private async getHighestLiquidityNativePool(
    chainId: ChainId,
    token: Token,
    poolProvider: IV3PoolProvider
  ): Promise<Pool | null> {
    const nativeCurrency = WRAPPED_NATIVE_CURRENCY[chainId]!;

    const nativePools = _([FeeAmount.HIGH, FeeAmount.MEDIUM, FeeAmount.LOW])
      .map<[Token, Token, FeeAmount]>((feeAmount) => {
        return [nativeCurrency, token, feeAmount];
      })
      .value();

    const poolAccessor = await poolProvider.getPools(nativePools);

    const pools = _([FeeAmount.HIGH, FeeAmount.MEDIUM, FeeAmount.LOW])
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

    const maxPool = _.maxBy(pools, (pool) => pool.liquidity) as Pool;

    return maxPool;
  }
}
