import { MaxUint256 } from '@ethersproject/constants';
import { JsonRpcProvider } from '@ethersproject/providers';
import {
  PERMIT2_ADDRESS,
  UNIVERSAL_ROUTER_ADDRESS,
} from '@uniswap/universal-router-sdk';
import axios from 'axios';
import { BigNumber } from 'ethers/lib/ethers';

import { SwapOptions, SwapRoute, SwapType } from '../routers';
import { Erc20__factory } from '../types/other/factories/Erc20__factory';
import { Permit2__factory } from '../types/other/factories/Permit2__factory';
import { ChainId, log, MAX_UINT160, SWAP_ROUTER_02_ADDRESS } from '../util';
import { APPROVE_TOKEN_FOR_TRANSFER } from '../util/callData';
import {
  calculateGasUsed,
  initSwapRouteFromExisting,
} from '../util/gas-factory-helpers';

import { EthEstimateGasSimulator } from './eth-estimate-gas-provider';
import { ProviderConfig } from './provider';
import {
  SimulationResult,
  SimulationStatus,
  Simulator,
} from './simulation-provider';
import { IV2PoolProvider } from './v2/pool-provider';
import { ArbitrumGasData, OptimismGasData } from './v3/gas-data-provider';
import { IV3PoolProvider } from './v3/pool-provider';

export type TenderlyResponseUniversalRouter = {
  config: {
    url: string;
    method: string;
    data: string;
  };
  simulation_results: [SimulationResult, SimulationResult, SimulationResult];
};

export type TenderlyResponseSwapRouter02 = {
  config: {
    url: string;
    method: string;
    data: string;
  };
  simulation_results: [SimulationResult, SimulationResult];
};

const TENDERLY_BATCH_SIMULATE_API = (
  tenderlyBaseUrl: string,
  tenderlyUser: string,
  tenderlyProject: string
) =>
  `${tenderlyBaseUrl}/api/v1/account/${tenderlyUser}/project/${tenderlyProject}/simulate-batch`;

// We multiply tenderly gas limit by this to overestimate gas limit
const DEFAULT_ESTIMATE_MULTIPLIER = 1.25;

export class FallbackTenderlySimulator extends Simulator {
  private tenderlySimulator: TenderlySimulator;
  private ethEstimateGasSimulator: EthEstimateGasSimulator;
  constructor(
    chainId: ChainId,
    provider: JsonRpcProvider,
    tenderlySimulator: TenderlySimulator,
    ethEstimateGasSimulator: EthEstimateGasSimulator
  ) {
    super(provider, chainId);
    this.tenderlySimulator = tenderlySimulator;
    this.ethEstimateGasSimulator = ethEstimateGasSimulator;
  }

  protected async simulateTransaction(
    fromAddress: string,
    swapOptions: SwapOptions,
    swapRoute: SwapRoute,
    l2GasData?: ArbitrumGasData | OptimismGasData,
    providerConfig?: ProviderConfig
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
      log.info(
        'Simulating with eth_estimateGas since token is native or approved.'
      );

      try {
        const swapRouteWithGasEstimate =
          await this.ethEstimateGasSimulator.ethEstimateGas(
            fromAddress,
            swapOptions,
            swapRoute,
            l2GasData
          );
        return swapRouteWithGasEstimate;
      } catch (err) {
        log.info({ err: err }, 'Error simulating using eth_estimateGas');
        return { ...swapRoute, simulationStatus: SimulationStatus.Failed };
      }
    }

    try {
      return await this.tenderlySimulator.simulateTransaction(
        fromAddress,
        swapOptions,
        swapRoute,
        l2GasData,
        providerConfig
      );
    } catch (err) {
      log.info({ err: err }, 'Failed to simulate via Tenderly');
      return { ...swapRoute, simulationStatus: SimulationStatus.Failed };
    }
  }
}

export class TenderlySimulator extends Simulator {
  private tenderlyBaseUrl: string;
  private tenderlyUser: string;
  private tenderlyProject: string;
  private tenderlyAccessKey: string;
  private v2PoolProvider: IV2PoolProvider;
  private v3PoolProvider: IV3PoolProvider;
  private overrideEstimateMultiplier: { [chainId in ChainId]?: number };

  constructor(
    chainId: ChainId,
    tenderlyBaseUrl: string,
    tenderlyUser: string,
    tenderlyProject: string,
    tenderlyAccessKey: string,
    v2PoolProvider: IV2PoolProvider,
    v3PoolProvider: IV3PoolProvider,
    provider: JsonRpcProvider,
    overrideEstimateMultiplier?: { [chainId in ChainId]?: number }
  ) {
    super(provider, chainId);
    this.tenderlyBaseUrl = tenderlyBaseUrl;
    this.tenderlyUser = tenderlyUser;
    this.tenderlyProject = tenderlyProject;
    this.tenderlyAccessKey = tenderlyAccessKey;
    this.v2PoolProvider = v2PoolProvider;
    this.v3PoolProvider = v3PoolProvider;
    this.overrideEstimateMultiplier = overrideEstimateMultiplier ?? {};
  }

  public async simulateTransaction(
    fromAddress: string,
    swapOptions: SwapOptions,
    swapRoute: SwapRoute,
    l2GasData?: ArbitrumGasData | OptimismGasData,
    providerConfig?: ProviderConfig
  ): Promise<SwapRoute> {
    const currencyIn = swapRoute.trade.inputAmount.currency;
    const tokenIn = currencyIn.wrapped;
    const chainId = this.chainId;
    if ([ChainId.CELO, ChainId.CELO_ALFAJORES].includes(chainId)) {
      const msg = 'Celo not supported by Tenderly!';
      log.info(msg);
      return { ...swapRoute, simulationStatus: SimulationStatus.NotSupported };
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
        router: swapOptions.type,
      },
      'Simulating transaction on Tenderly'
    );

    const blockNumber = await providerConfig?.blockNumber;
    let estimatedGasUsed: BigNumber;
    const estimateMultiplier =
      this.overrideEstimateMultiplier[chainId] ?? DEFAULT_ESTIMATE_MULTIPLIER;

    if (swapOptions.type == SwapType.UNIVERSAL_ROUTER) {
      // Do initial onboarding approval of Permit2.
      const erc20Interface = Erc20__factory.createInterface();
      const approvePermit2Calldata = erc20Interface.encodeFunctionData(
        'approve',
        [PERMIT2_ADDRESS, MaxUint256]
      );

      // We are unsure if the users calldata contains a permit or not. We just
      // max approve the Univeral Router from Permit2 instead, which will cover both cases.
      const permit2Interface = Permit2__factory.createInterface();
      const approveUniversalRouterCallData =
        permit2Interface.encodeFunctionData('approve', [
          tokenIn.address,
          UNIVERSAL_ROUTER_ADDRESS(this.chainId),
          MAX_UINT160,
          Math.floor(new Date().getTime() / 1000) + 10000000,
        ]);

      const approvePermit2 = {
        network_id: chainId,
        gas_estimate: true,
        input: approvePermit2Calldata,
        to: tokenIn.address,
        value: '0',
        from: fromAddress,
      };

      const approveUniversalRouter = {
        network_id: chainId,
        gas_estimate: true,
        input: approveUniversalRouterCallData,
        to: PERMIT2_ADDRESS,
        value: '0',
        from: fromAddress,
      };

      const swap = {
        network_id: chainId,
        input: calldata,
        gas_estimate: true,
        to: UNIVERSAL_ROUTER_ADDRESS(this.chainId),
        value: currencyIn.isNative ? swapRoute.methodParameters.value : '0',
        from: fromAddress,
        // TODO: This is a Temporary fix given by Tenderly team, remove once resolved on their end.
        block_number:
          chainId == ChainId.ARBITRUM_ONE && blockNumber
            ? blockNumber - 5
            : undefined,
      };

      const body = {
        simulations: [approvePermit2, approveUniversalRouter, swap],
        gas_estimate: true,
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
      const resp = (
        await axios.post<TenderlyResponseUniversalRouter>(url, body, opts)
      ).data;

      // Validate tenderly response body
      if (
        !resp ||
        resp.simulation_results.length < 3 ||
        !resp.simulation_results[2].transaction ||
        resp.simulation_results[2].transaction.error_message
      ) {
        this.logTenderlyErrorResponse(resp);
        return { ...swapRoute, simulationStatus: SimulationStatus.Failed };
      }

      // Parse the gas used in the simulation response object, and then pad it so that we overestimate.
      estimatedGasUsed = BigNumber.from(
        (
          resp.simulation_results[2].transaction.gas_used * estimateMultiplier
        ).toFixed(0)
      );

      log.info(
        {
          body,
          approvePermit2GasUsed:
            resp.simulation_results[0].transaction.gas_used,
          approveUniversalRouterGasUsed:
            resp.simulation_results[1].transaction.gas_used,
          swapGasUsed: resp.simulation_results[2].transaction.gas_used,
          swapWithMultiplier: estimatedGasUsed.toString(),
        },
        'Successfully Simulated Approvals + Swap via Tenderly for Universal Router. Gas used.'
      );

      log.info(
        { swapTransaction: resp.simulation_results[2].transaction },
        'Successful Tenderly Swap Transaction for Universal Router'
      );

      log.info(
        { swapSimulation: resp.simulation_results[2].simulation },
        'Successful Tenderly Swap Simulation for Universal Router'
      );
    } else if (swapOptions.type == SwapType.SWAP_ROUTER_02) {
      const approve = {
        network_id: chainId,
        input: APPROVE_TOKEN_FOR_TRANSFER,
        gas_estimate: true,
        to: tokenIn.address,
        value: '0',
        from: fromAddress,
      };

      const swap = {
        network_id: chainId,
        input: calldata,
        to: SWAP_ROUTER_02_ADDRESS,
        gas_estimate: true,
        value: currencyIn.isNative ? swapRoute.methodParameters.value : '0',
        from: fromAddress,
        // TODO: This is a Temporary fix given by Tenderly team, remove once resolved on their end.
        block_number:
          chainId == ChainId.ARBITRUM_ONE && blockNumber
            ? blockNumber - 5
            : undefined,
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

      const resp = (
        await axios.post<TenderlyResponseSwapRouter02>(url, body, opts)
      ).data;

      // Validate tenderly response body
      if (
        !resp ||
        resp.simulation_results.length < 2 ||
        !resp.simulation_results[1].transaction ||
        resp.simulation_results[1].transaction.error_message
      ) {
        const msg = `Failed to Simulate Via Tenderly!: ${resp.simulation_results[1].transaction.error_message}`;
        log.info(
          { err: resp.simulation_results[1].transaction.error_message },
          msg
        );
        return { ...swapRoute, simulationStatus: SimulationStatus.Failed };
      }

      // Parse the gas used in the simulation response object, and then pad it so that we overestimate.
      estimatedGasUsed = BigNumber.from(
        (
          resp.simulation_results[1].transaction.gas_used * estimateMultiplier
        ).toFixed(0)
      );

      log.info(
        {
          body,
          approveGasUsed: resp.simulation_results[0].transaction.gas_used,
          swapGasUsed: resp.simulation_results[1].transaction.gas_used,
          swapWithMultiplier: estimatedGasUsed.toString(),
        },
        'Successfully Simulated Approval + Swap via Tenderly for SwapRouter02. Gas used.'
      );
      log.info(
        { swapTransaction: resp.simulation_results[1].transaction },
        'Successful Tenderly Swap Transaction for SwapRouter02'
      );
      log.info(
        { swapSimulation: resp.simulation_results[1].simulation },
        'Successful Tenderly Swap Simulation for SwapRouter02'
      );
    } else {
      throw new Error(`Unsupported swap type: ${swapOptions}`);
    }

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
    return {
      ...initSwapRouteFromExisting(
        swapRoute,
        this.v2PoolProvider,
        this.v3PoolProvider,
        quoteGasAdjusted,
        estimatedGasUsed,
        estimatedGasUsedQuoteToken,
        estimatedGasUsedUSD
      ),
      simulationStatus: SimulationStatus.Succeeded,
    };
  }

  private logTenderlyErrorResponse(resp: TenderlyResponseUniversalRouter) {
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
  }
}
