/* eslint-disable @typescript-eslint/no-non-null-assertion */
import { MaxUint256 } from '@ethersproject/constants';
import { JsonRpcProvider } from '@ethersproject/providers';
import { SwapOptions } from '@uniswap/narwhal-sdk';
import { TradeType } from '@uniswap/sdk-core';
import axios from 'axios';
import { BigNumber } from 'ethers/lib/ethers';

import { SwapRoute } from '../routers';
import { Erc20__factory } from '../types/other/factories/Erc20__factory';
import { Permit2__factory } from '../types/other/factories/Permit2__factory';
import {
  ChainId,
  CurrencyAmount,
  log,
  MAX_UINT160,
  SWAP_ROUTER_ADDRESS,
} from '../util';
import {
  calculateGasUsed,
  initSwapRouteFromExisting,
} from '../util/gas-factory-helpers';

import { IV2PoolProvider } from './v2/pool-provider';
import { ArbitrumGasData, OptimismGasData } from './v3/gas-data-provider';
import { IV3PoolProvider } from './v3/pool-provider';

const UNIVERSAL_ROUTER_ADDRESS = '0x5393904db506415D941726f3Cf0404Bb167537A0';
const PERMIT2_ADDRESS = '0x6fEe9BeC3B3fc8f9DA5740f0efc6BbE6966cd6A6';

type SimulationResult = {
  transaction: { hash: string; gas_used: number; error_message: string };
  simulation: { state_overrides: Record<string, unknown> };
};

export type TenderlyResponse = {
  config: {
    url: string;
    method: string;
    data: string;
  };
  simulation_results: [SimulationResult, SimulationResult, SimulationResult];
};

const TENDERLY_BATCH_SIMULATE_API = (
  tenderlyBaseUrl: string,
  tenderlyUser: string,
  tenderlyProject: string
) =>
  `${tenderlyBaseUrl}/api/v1/account/${tenderlyUser}/project/${tenderlyProject}/simulate-batch`;

// We multiply tenderly gas limit by this to overestimate gas limit
const ESTIMATE_MULTIPLIER = 1.25;

/**
 * Provider for dry running transactions.
 *
 * @export
 * @class Simulator
 */
export abstract class Simulator {
  protected provider: JsonRpcProvider;
  /**
   * Returns a new SwapRoute with updated gas estimates
   * All clients that extend this must set
   * simulationError = true in the returned SwapRoute
   * if simulation is not successful
   * @returns SwapRoute
   */
  constructor(provider: JsonRpcProvider) {
    this.provider = provider;
  }

  protected abstract simulateTransaction(
    fromAddress: string,
    swapOptions: SwapOptions,
    swapRoute: SwapRoute,
    l2GasData?: OptimismGasData | ArbitrumGasData
  ): Promise<SwapRoute>;

  public async simulate(
    fromAddress: string,
    swapOptions: SwapOptions,
    swapRoute: SwapRoute,
    amount: CurrencyAmount,
    quote: CurrencyAmount,
    l2GasData?: OptimismGasData | ArbitrumGasData
  ) {
    if (
      await this.userHasSufficientBalance(
        fromAddress,
        swapRoute.trade.tradeType,
        amount,
        quote
      )
    ) {
      log.info(
        'User has sufficient balance to simulate. Simulating transaction.'
      );
      return this.simulateTransaction(
        fromAddress,
        swapOptions,
        swapRoute,
        l2GasData
      );
    } else {
      log.error('User does not have sufficient balance to simulate.');
      return { ...swapRoute, simulationError: true };
    }
  }

  private async userHasSufficientBalance(
    fromAddress: string,
    tradeType: TradeType,
    amount: CurrencyAmount,
    quote: CurrencyAmount
  ): Promise<boolean> {
    try {
      const neededBalance = tradeType == TradeType.EXACT_INPUT ? amount : quote;
      let balance;
      if (neededBalance.currency.isNative) {
        balance = await this.provider.getBalance(fromAddress);
      } else {
        const tokenContract = Erc20__factory.connect(
          neededBalance.currency.address,
          this.provider
        );
        balance = await tokenContract.balanceOf(fromAddress);
      }

      log.info(
        {
          fromAddress,
          balance: balance.toString(),
          neededBalance: neededBalance.quotient.toString(),
          neededAddress: neededBalance.wrapped.currency.address,
        },
        'Result of balance check for simulation'
      );
      return balance.gte(BigNumber.from(neededBalance.quotient.toString()));
    } catch (e) {
      log.error(e, 'Error while checking user balance');
      return false;
    }
  }

  protected async checkTokenApproved(
    fromAddress: string,
    inputAmount: CurrencyAmount,
    swapOptions: SwapOptions,
    provider: JsonRpcProvider
  ): Promise<boolean> {
    // Check token has approved Permit2 more than expected amount.
    const tokenContract = Erc20__factory.connect(
      inputAmount.currency.wrapped.address,
      provider
    );

    const permit2Allowance = await tokenContract.allowance(
      fromAddress,
      PERMIT2_ADDRESS
    );

    // If a permit has been provided we don't need to check if UR has already been allowed.
    if (swapOptions.inputTokenPermit) {
      log.info(
        {
          permitAllowance: permit2Allowance.toString(),
          inputAmount: inputAmount.quotient.toString(),
        },
        'Permit was provided for simulation, checking that Permit2 has been approved.'
      );
      return permit2Allowance.gte(
        BigNumber.from(inputAmount.quotient.toString())
      );
    }

    // Check UR has been approved from Permit2.
    const permit2Contract = Permit2__factory.connect(PERMIT2_ADDRESS, provider);

    const { amount: tokenAllowance, expiration: tokenExpiration } =
      await permit2Contract.allowance(
        fromAddress,
        inputAmount.currency.wrapped.address,
        SWAP_ROUTER_ADDRESS
      );

    const nowTimestampS = Math.round(Date.now() / 1000);
    const inputAmountBN = BigNumber.from(inputAmount.quotient.toString());

    log.info(
      {
        permitAllowance: permit2Allowance.toString(),
        tokenAllowance: tokenAllowance.toString(),
        tokenExpirationS: tokenExpiration,
        nowTimestampS,
        inputAmount: inputAmount.quotient.toString(),
      },
      'Permit was not provided for simulation, Permit2 is approved, UR is approved from P2, and expiration hasnt expired.'
    );
    return (
      permit2Allowance.gte(inputAmountBN) &&
      tokenAllowance.gte(inputAmountBN) &&
      tokenExpiration > nowTimestampS
    );
  }
}

export class FallbackTenderlySimulator extends Simulator {
  private tenderlySimulator: TenderlySimulator;
  private v3PoolProvider: IV3PoolProvider;
  private v2PoolProvider: IV2PoolProvider;

  constructor(
    tenderlyBaseUrl: string,
    tenderlyUser: string,
    tenderlyProject: string,
    tenderlyAccessKey: string,
    provider: JsonRpcProvider,
    v2PoolProvider: IV2PoolProvider,
    v3PoolProvider: IV3PoolProvider,
    tenderlySimulator?: TenderlySimulator
  ) {
    super(provider);
    this.tenderlySimulator =
      tenderlySimulator ??
      new TenderlySimulator(
        tenderlyBaseUrl,
        tenderlyUser,
        tenderlyProject,
        tenderlyAccessKey,
        v2PoolProvider,
        v3PoolProvider,
        provider
      );
    this.v2PoolProvider = v2PoolProvider;
    this.v3PoolProvider = v3PoolProvider;
  }

  protected async simulateTransaction(
    fromAddress: string,
    swapOptions: SwapOptions,
    swapRoute: SwapRoute,
    l2GasData?: ArbitrumGasData | OptimismGasData
  ): Promise<SwapRoute> {
    // Make call to eth estimate gas if possible
    // For erc20s, we must check if the token allowance is sufficient
    const inputAmount = swapRoute.trade.inputAmount;
    if (
      inputAmount.currency.isNative ||
      (await this.checkTokenApproved(
        fromAddress,
        inputAmount,
        swapOptions,
        this.provider
      ))
    ) {
      try {
        const swapRouteWithGasEstimate = await this.ethEstimateGas(
          fromAddress,
          swapRoute,
          l2GasData
        );
        return swapRouteWithGasEstimate;
      } catch (err) {
        log.info({ err: err }, 'Error calling eth estimate gas!');
        return { ...swapRoute, simulationError: true };
      }
    }
    // simulate via tenderly
    try {
      return await this.tenderlySimulator.simulateTransaction(
        fromAddress,
        swapOptions,
        swapRoute,
        l2GasData
      );
    } catch (err) {
      log.info({ err: err }, 'Failed to simulate via Tenderly!');
      // set error flag to true
      return { ...swapRoute, simulationError: true };
    }
  }

  private async ethEstimateGas(
    fromAddress: string,
    route: SwapRoute,
    l2GasData?: ArbitrumGasData | OptimismGasData
  ): Promise<SwapRoute> {
    const currencyIn = route.trade.inputAmount.currency;

    const estimatedGasUsed: BigNumber = await this.provider.estimateGas({
      data: route.methodParameters!.calldata,
      to: UNIVERSAL_ROUTER_ADDRESS,
      from: fromAddress,
      value: BigNumber.from(
        currencyIn.isNative ? route.methodParameters!.value : '0'
      ),
    });

    const {
      estimatedGasUsedUSD,
      estimatedGasUsedQuoteToken,
      quoteGasAdjusted,
    } = await calculateGasUsed(
      route.quote.currency.chainId,
      route,
      estimatedGasUsed,
      this.v2PoolProvider,
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
export class TenderlySimulator extends Simulator {
  private tenderlyBaseUrl: string;
  private tenderlyUser: string;
  private tenderlyProject: string;
  private tenderlyAccessKey: string;
  private v2PoolProvider: IV2PoolProvider;
  private v3PoolProvider: IV3PoolProvider;

  constructor(
    tenderlyBaseUrl: string,
    tenderlyUser: string,
    tenderlyProject: string,
    tenderlyAccessKey: string,
    v2PoolProvider: IV2PoolProvider,
    v3PoolProvider: IV3PoolProvider,
    provider: JsonRpcProvider
  ) {
    super(provider);
    this.tenderlyBaseUrl = tenderlyBaseUrl;
    this.tenderlyUser = tenderlyUser;
    this.tenderlyProject = tenderlyProject;
    this.tenderlyAccessKey = tenderlyAccessKey;
    this.v2PoolProvider = v2PoolProvider;
    this.v3PoolProvider = v3PoolProvider;
  }

  public async simulateTransaction(
    fromAddress: string,
    _swapOptions: SwapOptions,
    swapRoute: SwapRoute,
    l2GasData?: ArbitrumGasData | OptimismGasData
  ): Promise<SwapRoute> {
    const currencyIn = swapRoute.trade.inputAmount.currency;
    const tokenIn = currencyIn.wrapped;
    const chainId = tokenIn.chainId;
    if ([ChainId.CELO, ChainId.CELO_ALFAJORES].includes(chainId)) {
      const msg = 'Celo not supported by Tenderly!';
      log.info(msg);
      return { ...swapRoute, simulationError: true };
    }

    if (!swapRoute.methodParameters) {
      const msg = 'No calldata provided to simulate transaction';
      log.info(msg);
      throw new Error(msg);
    }

    const { calldata } = swapRoute.methodParameters;

    log.info(
      {
        calldata: swapRoute.methodParameters.calldata,
        fromAddress: fromAddress,
        chainId: chainId,
        tokenInAddress: tokenIn.address,
      },
      'Simulating transaction via Tenderly'
    );

    // Do initial onboarding approval of Permit2.
    const erc20Interface = Erc20__factory.createInterface();
    const approvePermit2Calldata = erc20Interface.encodeFunctionData(
      'approve',
      [PERMIT2_ADDRESS, MaxUint256]
    );

    // We are unsure if the users calldata contains a permit or not. We just
    // max approve the Univeral Router from Permit2 instead, which will cover both cases.
    const permit2Interface = Permit2__factory.createInterface();
    const approveUniversalRouterCallData = permit2Interface.encodeFunctionData(
      'approve',
      [
        tokenIn.address,
        UNIVERSAL_ROUTER_ADDRESS,
        MAX_UINT160,
        Math.floor(new Date().getTime() / 1000) + 10000000,
      ]
    );

    const approvePermit2 = {
      network_id: chainId,
      input: approvePermit2Calldata,
      to: tokenIn.address,
      value: '0',
      from: fromAddress,
      gasPrice: '0',
      gas: 30000000,
    };

    const approveUniversalRouter = {
      network_id: chainId,
      input: approveUniversalRouterCallData,
      to: PERMIT2_ADDRESS,
      value: '0',
      from: fromAddress,
      gasPrice: '0',
      gas: 30000000,
    };

    const swap = {
      network_id: chainId,
      input: calldata,
      to: UNIVERSAL_ROUTER_ADDRESS,
      value: currencyIn.isNative ? swapRoute.methodParameters.value : '0',
      from: fromAddress,
      gasPrice: '0',
      gas: 30000000,
      type: 1,
    };

    const body = {
      simulations: [approvePermit2, approveUniversalRouter, swap],
    };
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
    const resp = (await axios.post<TenderlyResponse>(url, body, opts)).data;

    // Validate tenderly response body
    if (
      !resp ||
      resp.simulation_results.length < 3 ||
      !resp.simulation_results[2].transaction ||
      resp.simulation_results[2].transaction.error_message
    ) {
      log.info(
        {
          resp,
        },
        'Failed to Simulate on Tenderly'
      );
      log.info(
        {
          err:
            resp.simulation_results.length >= 1
              ? resp.simulation_results[0].transaction
              : {},
        },
        'Failed to Simulate on Tenderly #1 Transaction'
      );
      log.info(
        {
          err:
            resp.simulation_results.length >= 1
              ? resp.simulation_results[0].simulation
              : {},
        },
        'Failed to Simulate on Tenderly #1 Simulation'
      );
      log.info(
        {
          err:
            resp.simulation_results.length >= 2
              ? resp.simulation_results[1].transaction
              : {},
        },
        'Failed to Simulate on Tenderly #2 Transaction'
      );
      log.info(
        {
          err:
            resp.simulation_results.length >= 2
              ? resp.simulation_results[1].simulation
              : {},
        },
        'Failed to Simulate on Tenderly #2 Simulation'
      );
      log.info(
        {
          err:
            resp.simulation_results.length >= 3
              ? resp.simulation_results[2].transaction
              : {},
        },
        'Failed to Simulate on Tenderly #3 Transaction'
      );
      log.info(
        {
          err:
            resp.simulation_results.length >= 3
              ? resp.simulation_results[2].simulation
              : {},
        },
        'Failed to Simulate on Tenderly #3 Simulation'
      );
      return { ...swapRoute, simulationError: true };
    }

    log.info(
      {
        approvePermit2: resp.simulation_results[0],
        approveUniversalRouter: resp.simulation_results[1],
        swap: resp.simulation_results[2],
      },
      'Simulated Approvals + Swap via Tenderly'
    );

    // Parse the gas used in the simulation response object, and then pad it so that we overestimate.
    const estimatedGasUsed = BigNumber.from(
      (
        resp.simulation_results[2].transaction.gas_used * ESTIMATE_MULTIPLIER
      ).toFixed(0)
    );

    const {
      estimatedGasUsedUSD,
      estimatedGasUsedQuoteToken,
      quoteGasAdjusted,
    } = await calculateGasUsed(
      chainId,
      swapRoute,
      estimatedGasUsed,
      this.v2PoolProvider,
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
