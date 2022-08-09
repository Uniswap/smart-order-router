/* eslint-disable @typescript-eslint/no-non-null-assertion */
import { JsonRpcProvider } from '@ethersproject/providers';
import axios from 'axios';
import { BigNumber } from 'ethers/lib/ethers';

import { SwapRoute } from '../routers';
import { Erc20__factory } from '../types/other/factories/Erc20__factory';
import { SwapRouter02__factory } from '../types/other/factories/SwapRouter02__factory';
import { ChainId, CurrencyAmount, log } from '../util';
import {
  APPROVE_TOKEN_FOR_TRANSFER,
  SWAPROUTER02_ADDRESS,
} from '../util/callData';
import { calculateGasUsed, initSwapRouteFromExisting } from '../util/gasCalc';

import { IV2PoolProvider } from './v2/pool-provider';
import { ArbitrumGasData, OptimismGasData } from './v3/gas-data-provider';
import { IV3PoolProvider } from './v3/pool-provider';

type simulationResult = {
  transaction: { hash: string; gas_used: number; error_message: string };
  simulation: { state_overrides: Record<string, unknown> };
};

export type tenderlyResponse = {
  config: {
    url: string;
    method: string;
    data: string;
  };
  simulation_results: [simulationResult, simulationResult];
};

const TENDERLY_BATCH_SIMULATE_API = (
  tenderlyBaseUrl: string,
  tenderlyUser: string,
  tenderlyProject: string
) =>
  `${tenderlyBaseUrl}/api/v1/account/${tenderlyUser}/project/${tenderlyProject}/simulate-batch`;

// We multiply tenderly gas estimate by this estimate to overestimate gas fee
const ESTIMATE_MULTIPLIER = 1.25;

/**
 * Provider for dry running transactions.
 *
 * @export
 * @interface ISimulator
 */
export interface ISimulator {
  v2PoolProvider: IV2PoolProvider;
  v3PoolProvider: IV3PoolProvider;
  /**
   * Returns a new Swaproute with updated gas estimates
   * @returns number or Error
   */
  simulateTransaction: (
    fromAddress: string,
    route: SwapRoute,
    l2GasData?: OptimismGasData | ArbitrumGasData
  ) => Promise<SwapRoute>;
}

export class FallbackTenderlySimulator implements ISimulator {
  private provider: JsonRpcProvider;
  private tenderlySimulator: TenderlySimulator;
  v3PoolProvider: IV3PoolProvider;
  v2PoolProvider: IV2PoolProvider;

  constructor(
    tenderlyBaseUrl: string,
    tenderlyUser: string,
    tenderlyProject: string,
    tenderlyAccessKey: string,
    provider: JsonRpcProvider,
    v2PoolProvider: IV2PoolProvider,
    v3PoolProvider: IV3PoolProvider
  ) {
    this.tenderlySimulator = new TenderlySimulator(
      tenderlyBaseUrl,
      tenderlyUser,
      tenderlyProject,
      tenderlyAccessKey,
      v2PoolProvider,
      v3PoolProvider
    );
    this.provider = provider;
    this.v2PoolProvider = v2PoolProvider;
    this.v3PoolProvider = v3PoolProvider;
  }

  private async ethEstimateGas(
    fromAddress: string,
    inputAmount: CurrencyAmount,
    calldata: string
  ): Promise<{ approved: boolean; estimatedGasUsed: BigNumber }> {
    const currencyIn = inputAmount.currency;
    // For erc20s, we must check if the token allowance is sufficient
    if (!currencyIn.isNative) {
      const tokenContract = Erc20__factory.connect(
        currencyIn.address,
        this.provider
      );
      const allowance = await tokenContract.allowance(
        fromAddress,
        SWAPROUTER02_ADDRESS
      );
      // Check that token allowance is more than amountIn
      if (
        allowance.lt(BigNumber.from(inputAmount.multiply(10 ** 18).toFixed(0)))
      )
        return { approved: false, estimatedGasUsed: BigNumber.from(0) };
    }
    const router = SwapRouter02__factory.connect(
      SWAPROUTER02_ADDRESS,
      this.provider
    );
    try {
      const estimatedGasUsed: BigNumber = await router.estimateGas[
        'multicall(bytes[])'
      ]([calldata], {
        from: fromAddress,
        value: BigNumber.from(inputAmount.multiply(10 ** 18).toFixed(0)),
      });
      return { approved: true, estimatedGasUsed: estimatedGasUsed };
    } catch (err) {
      const msg = 'Error calling eth_estimateGas!';
      log.info({ err: err }, msg);
      throw new Error(msg);
    }
  }

  public async simulateTransaction(
    fromAddress: string,
    swapRoute: SwapRoute,
    l2GasData?: ArbitrumGasData | OptimismGasData
  ): Promise<SwapRoute> {
    const currencyIn = swapRoute.trade.inputAmount.currency;
    const tokenIn = currencyIn.wrapped;
    const chainId: ChainId = tokenIn.chainId;
    let approved = false;
    let estimatedGasUsed: BigNumber;
    // eslint-disable-next-line prefer-const
    ({ approved, estimatedGasUsed } = await this.ethEstimateGas(
      fromAddress,
      swapRoute.trade.inputAmount,
      swapRoute.methodParameters!.calldata
    ));

    if (!approved) {
      try {
        return await this.tenderlySimulator.simulateTransaction(
          fromAddress,
          swapRoute,
          l2GasData
        );
      } catch (err) {
        log.info({ err: err }, 'Failed to simulate via Tenderly!');
        // set error flag to true
        return { ...swapRoute, simulationError: true };
      }
    }
    const {
      estimatedGasUsedUSD,
      estimatedGasUsedQuoteToken,
      quoteGasAdjusted,
    } = await calculateGasUsed(
      chainId,
      swapRoute,
      estimatedGasUsed,
      this.v3PoolProvider,
      l2GasData
    );
    return initSwapRouteFromExisting(
      swapRoute,
      this.v2PoolProvider,
      this.v3PoolProvider,
      quoteGasAdjusted,
      estimatedGasUsed,
      estimatedGasUsedQuoteToken,
      estimatedGasUsedUSD
    );
  }
}
export class TenderlySimulator implements ISimulator {
  private tenderlyBaseUrl: string;
  private tenderlyUser: string;
  private tenderlyProject: string;
  private tenderlyAccessKey: string;
  v2PoolProvider: IV2PoolProvider;
  v3PoolProvider: IV3PoolProvider;

  constructor(
    tenderlyBaseUrl: string,
    tenderlyUser: string,
    tenderlyProject: string,
    tenderlyAccessKey: string,
    v2PoolProvider: IV2PoolProvider,
    v3PoolProvider: IV3PoolProvider
  ) {
    this.tenderlyBaseUrl = tenderlyBaseUrl;
    this.tenderlyUser = tenderlyUser;
    this.tenderlyProject = tenderlyProject;
    this.tenderlyAccessKey = tenderlyAccessKey;
    this.v2PoolProvider = v2PoolProvider;
    this.v3PoolProvider = v3PoolProvider;
  }

  public async simulateTransaction(
    fromAddress: string,
    route: SwapRoute,
    l2GasData?: ArbitrumGasData | OptimismGasData
  ): Promise<SwapRoute> {
    const currencyIn = route.trade.inputAmount.currency;
    const tokenIn = currencyIn.wrapped;
    const chainId = tokenIn.chainId;
    if ([ChainId.CELO, ChainId.CELO_ALFAJORES].includes(chainId)) {
      const msg = 'Celo not supported by Tenderly!';
      log.info(msg);
      throw new Error(msg);
    }

    if (!route.methodParameters) {
      throw new Error('No calldata provided to simulate transaction');
    }
    const { calldata } = route.methodParameters;
    log.info(
      {
        calldata: route.methodParameters.calldata,
        fromAddress: fromAddress,
        chainId: chainId,
        tokenInAddress: tokenIn.address,
      },
      'Simulating transaction via Tenderly'
    );

    const approve = {
      network_id: tokenIn.chainId,
      input: APPROVE_TOKEN_FOR_TRANSFER,
      to: tokenIn.address,
      value: '0',
      from: fromAddress,
      gasPrice: '0',
      gas: 30000000,
    };

    const swap = {
      network_id: chainId,
      input: calldata,
      to: SWAPROUTER02_ADDRESS,
      value: currencyIn.isNative
        ? BigNumber.from(route.methodParameters.value).toString()
        : '0',
      from: fromAddress,
      gasPrice: '0',
      gas: 30000000,
      type: 1,
    };

    const body = { simulations: [approve, swap] };
    const opts = {
      headers: {
        'X-Access-Key': this.tenderlyAccessKey,
      },
    };
    const url = TENDERLY_BATCH_SIMULATE_API(
      this.tenderlyBaseUrl,
      this.tenderlyUser,
      this.tenderlyProject
    );
    let resp: tenderlyResponse;
    try {
      resp = (await axios.post<tenderlyResponse>(url, body, opts)).data;
    } catch (err) {
      log.info({ err: err }, `Failed to Simulate Via Tenderly!`);
      throw err;
    }

    // Validate tenderly response body
    if (
      !(
        resp &&
        resp.simulation_results.length == 2 &&
        resp.simulation_results[1].transaction &&
        !resp.simulation_results[1].transaction.error_message
      )
    ) {
      const err = resp.simulation_results[1].transaction.error_message;
      log.info({ err: err }, `Failed to Simulate Via Tenderly!`);
      throw new Error(err);
    }

    log.info(
      { approve: resp.simulation_results[0], swap: resp.simulation_results[1] },
      'Simulated Approval + Swap via Tenderly'
    );

    // Parse the gas used in the simulation response object, and then pad it so that we overestimate.
    const estimatedGasUsed = BigNumber.from(
      (
        resp.simulation_results[1].transaction.gas_used * ESTIMATE_MULTIPLIER
      ).toFixed(0)
    );

    const {
      estimatedGasUsedUSD,
      estimatedGasUsedQuoteToken,
      quoteGasAdjusted,
    } = await calculateGasUsed(
      chainId,
      route,
      estimatedGasUsed,
      this.v3PoolProvider,
      l2GasData
    );

    return initSwapRouteFromExisting(
      route,
      this.v2PoolProvider,
      this.v3PoolProvider,
      quoteGasAdjusted,
      estimatedGasUsed,
      estimatedGasUsedQuoteToken,
      estimatedGasUsedUSD
    );
  }
}
