/* eslint-disable @typescript-eslint/no-non-null-assertion */
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
import { SwapRouter02__factory } from '../types/other/factories/SwapRouter02__factory';
import { ChainId, log, MAX_UINT160, SWAP_ROUTER_02_ADDRESS } from '../util';
import { APPROVE_TOKEN_FOR_TRANSFER } from '../util/callData';
import {
  calculateGasUsed,
  initSwapRouteFromExisting,
} from '../util/gas-factory-helpers';

import {
  SimulationResult,
  SimulationStatus,
  Simulator,
} from './simulation-provider';
import { IV2PoolProvider } from './v2/pool-provider';
import { ArbitrumGasData, OptimismGasData } from './v3/gas-data-provider';
import { IV3PoolProvider } from './v3/pool-provider';

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

export class FallbackTenderlySimulator extends Simulator {
  private tenderlySimulator: TenderlySimulator;
  private v3PoolProvider: IV3PoolProvider;
  private v2PoolProvider: IV2PoolProvider;

  constructor(
    chainId: ChainId,
    tenderlyBaseUrl: string,
    tenderlyUser: string,
    tenderlyProject: string,
    tenderlyAccessKey: string,
    provider: JsonRpcProvider,
    v2PoolProvider: IV2PoolProvider,
    v3PoolProvider: IV3PoolProvider,
    tenderlySimulator?: TenderlySimulator
  ) {
    super(provider, chainId);
    this.tenderlySimulator =
      tenderlySimulator ??
      new TenderlySimulator(
        chainId,
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
          swapOptions,
          swapRoute,
          l2GasData
        );
        return swapRouteWithGasEstimate;
      } catch (err) {
        log.info({ err: err }, 'Error calling eth estimate gas!');
        return { ...swapRoute, simulationStatus: SimulationStatus.Failed };
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
      return { ...swapRoute, simulationStatus: SimulationStatus.Failed };
    }
  }

  private async ethEstimateGas(
    fromAddress: string,
    swapOptions: SwapOptions,
    route: SwapRoute,
    l2GasData?: ArbitrumGasData | OptimismGasData
  ): Promise<SwapRoute> {
    const currencyIn = route.trade.inputAmount.currency;
    let estimatedGasUsed: BigNumber;
    if (swapOptions.type == SwapType.UNIVERSAL_ROUTER) {
      estimatedGasUsed = await this.provider.estimateGas({
        data: route.methodParameters!.calldata,
        to: UNIVERSAL_ROUTER_ADDRESS(this.chainId), // TODO
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
    } else if (swapOptions.type == SwapType.SWAP_ROUTER_02) {
      const router = SwapRouter02__factory.connect(
        SWAP_ROUTER_02_ADDRESS,
        this.provider
      );
      estimatedGasUsed = await router.estimateGas['multicall(bytes[])'](
        [route.methodParameters!.calldata],
        {
          from: fromAddress,
          value: BigNumber.from(
            currencyIn.isNative ? route.methodParameters!.value : '0'
          ),
        }
      );
    } else {
      throw new Error(`Unsupported swap type ${swapOptions}`);
    }

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
    return {
      ...initSwapRouteFromExisting(
        route,
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
}

export class TenderlySimulator extends Simulator {
  private tenderlyBaseUrl: string;
  private tenderlyUser: string;
  private tenderlyProject: string;
  private tenderlyAccessKey: string;
  private v2PoolProvider: IV2PoolProvider;
  private v3PoolProvider: IV3PoolProvider;

  constructor(
    chainId: ChainId,
    tenderlyBaseUrl: string,
    tenderlyUser: string,
    tenderlyProject: string,
    tenderlyAccessKey: string,
    v2PoolProvider: IV2PoolProvider,
    v3PoolProvider: IV3PoolProvider,
    provider: JsonRpcProvider
  ) {
    super(provider, chainId);
    this.tenderlyBaseUrl = tenderlyBaseUrl;
    this.tenderlyUser = tenderlyUser;
    this.tenderlyProject = tenderlyProject;
    this.tenderlyAccessKey = tenderlyAccessKey;
    this.v2PoolProvider = v2PoolProvider;
    this.v3PoolProvider = v3PoolProvider;
  }

  public async simulateTransaction(
    fromAddress: string,
    swapOptions: SwapOptions,
    swapRoute: SwapRoute,
    l2GasData?: ArbitrumGasData | OptimismGasData
  ): Promise<SwapRoute> {
    const currencyIn = swapRoute.trade.inputAmount.currency;
    const tokenIn = currencyIn.wrapped;
    const chainId = tokenIn.chainId;
    if ([ChainId.CELO, ChainId.CELO_ALFAJORES].includes(chainId)) {
      const msg = 'Celo not supported by Tenderly!';
      log.info(msg);
      return { ...swapRoute, simulationStatus: SimulationStatus.Unattempted };
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
      'Simulating transaction via Tenderly'
    );

    let estimatedGasUsed;

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
          UNIVERSAL_ROUTER_ADDRESS(this.chainId), //TODO
          MAX_UINT160,
          Math.floor(new Date().getTime() / 1000) + 10000000,
        ]);

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
        to: UNIVERSAL_ROUTER_ADDRESS(this.chainId),
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
        this.logTenderlyErrorResponse(resp);
        return { ...swapRoute, simulationStatus: SimulationStatus.Failed };
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
      estimatedGasUsed = BigNumber.from(
        (
          resp.simulation_results[2].transaction.gas_used * ESTIMATE_MULTIPLIER
        ).toFixed(0)
      );
    } else if (swapOptions.type == SwapType.SWAP_ROUTER_02) {
      const approve = {
        network_id: chainId,
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
        to: SWAP_ROUTER_02_ADDRESS,
        value: currencyIn.isNative ? swapRoute.methodParameters.value : '0',
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
      const resp = (await axios.post<TenderlyResponse>(url, body, opts)).data;

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

      log.info(
        {
          approve: resp.simulation_results[0],
          swap: resp.simulation_results[1],
        },
        'Simulated Approval + Swap via Tenderly'
      );

      // Parse the gas used in the simulation response object, and then pad it so that we overestimate.
      estimatedGasUsed = BigNumber.from(
        (
          resp.simulation_results[1].transaction.gas_used * ESTIMATE_MULTIPLIER
        ).toFixed(0)
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

  private logTenderlyErrorResponse(resp: TenderlyResponse) {
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
