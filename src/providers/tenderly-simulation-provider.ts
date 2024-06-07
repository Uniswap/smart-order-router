import http from 'http';
import https from 'https';

import { MaxUint256 } from '@ethersproject/constants';
import { JsonRpcProvider } from '@ethersproject/providers';
import { ChainId } from '@uniswap/sdk-core';
import {
  PERMIT2_ADDRESS,
  UNIVERSAL_ROUTER_ADDRESS,
} from '@uniswap/universal-router-sdk';
import axios, { AxiosRequestConfig } from 'axios';
import { BigNumber } from 'ethers/lib/ethers';

import {
  GasModelProviderConfig,
  metric,
  MetricLoggerUnit,
  SwapOptions,
  SwapRoute,
  SwapType,
} from '../routers';
import { Erc20__factory } from '../types/other/factories/Erc20__factory';
import { Permit2__factory } from '../types/other/factories/Permit2__factory';
import {
  BEACON_CHAIN_DEPOSIT_ADDRESS,
  log,
  MAX_UINT160,
  SWAP_ROUTER_02_ADDRESSES,
} from '../util';
import { APPROVE_TOKEN_FOR_TRANSFER } from '../util/callData';
import {
  calculateGasUsed,
  initSwapRouteFromExisting,
} from '../util/gas-factory-helpers';

import { EthEstimateGasSimulator } from './eth-estimate-gas-provider';
import { IPortionProvider } from './portion-provider';
import {
  SimulationResult,
  SimulationStatus,
  Simulator,
} from './simulation-provider';
import { IV2PoolProvider } from './v2/pool-provider';
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

export type GasBody = {
  gas: string;
  gasUsed: string;
};

export type TenderlyResponseEstimateGasBundle = {
  id: number;
  jsonrpc: string;
  result: GasBody[];
};

enum TenderlySimulationType {
  QUICK = 'quick',
  FULL = 'full',
  ABI = 'abi',
}

type TenderlySimulationRequest = {
  network_id: ChainId;
  estimate_gas: boolean;
  input: string;
  to: string;
  value: string;
  from: string;
  simulation_type: TenderlySimulationType;
  block_number?: number;
  save_if_fails?: boolean;
};

type TenderlySimulationBody = {
  simulations: TenderlySimulationRequest[];
  estimate_gas: boolean;
};

type EthJsonRpcRequestBody = {
  from: string;
  to: string;
  data: string;
};

type blockNumber =
  | number
  | string
  | 'latest'
  | 'pending'
  | 'earliest'
  | 'finalized'
  | 'safe';

type TenderlyNodeEstimateGasBundleBody = {
  id: number;
  jsonrpc: string;
  method: string;
  params: Array<Array<EthJsonRpcRequestBody> | blockNumber>;
};

const TENDERLY_BATCH_SIMULATE_API = (
  tenderlyBaseUrl: string,
  tenderlyUser: string,
  tenderlyProject: string
) =>
  `${tenderlyBaseUrl}/api/v1/account/${tenderlyUser}/project/${tenderlyProject}/simulate-batch`;

const TENDERLY_NODE_API = (chainId: ChainId, tenderlyNodeApiKey: string) => {
  switch (chainId) {
    case ChainId.MAINNET:
      return `https://mainnet.gateway.tenderly.co/${tenderlyNodeApiKey}`;
    default:
      throw new Error(
        `ChainId ${chainId} does not correspond to a tenderly node endpoint`
      );
  }
};

// We multiply tenderly gas limit by this to overestimate gas limit
const DEFAULT_ESTIMATE_MULTIPLIER = 1.3;

export class FallbackTenderlySimulator extends Simulator {
  private tenderlySimulator: TenderlySimulator;
  private ethEstimateGasSimulator: EthEstimateGasSimulator;
  constructor(
    chainId: ChainId,
    provider: JsonRpcProvider,
    portionProvider: IPortionProvider,
    tenderlySimulator: TenderlySimulator,
    ethEstimateGasSimulator: EthEstimateGasSimulator
  ) {
    super(provider, portionProvider, chainId);
    this.tenderlySimulator = tenderlySimulator;
    this.ethEstimateGasSimulator = ethEstimateGasSimulator;
  }

  protected async simulateTransaction(
    fromAddress: string,
    swapOptions: SwapOptions,
    swapRoute: SwapRoute,
    providerConfig?: GasModelProviderConfig
  ): Promise<SwapRoute> {
    // Make call to eth estimate gas if possible
    // For erc20s, we must check if the token allowance is sufficient
    const inputAmount = swapRoute.trade.inputAmount;

    if (
      (inputAmount.currency.isNative && this.chainId == ChainId.MAINNET) ||
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
            providerConfig
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
        providerConfig
      );
    } catch (err) {
      log.error({ err: err }, 'Failed to simulate via Tenderly');

      if (err instanceof Error && err.message.includes('timeout')) {
        metric.putMetric(
          'TenderlySimulationTimeouts',
          1,
          MetricLoggerUnit.Count
        );
      }
      return { ...swapRoute, simulationStatus: SimulationStatus.Failed };
    }
  }
}

export class TenderlySimulator extends Simulator {
  private tenderlyBaseUrl: string;
  private tenderlyUser: string;
  private tenderlyProject: string;
  private tenderlyAccessKey: string;
  private tenderlyNodeApiKey: string;
  private v2PoolProvider: IV2PoolProvider;
  private v3PoolProvider: IV3PoolProvider;
  private overrideEstimateMultiplier: { [chainId in ChainId]?: number };
  private tenderlyRequestTimeout?: number;
  private tenderlyNodeApiSamplingPercent?: number;
  private tenderlyNodeApiEnabledChains?: ChainId[] = [];
  private tenderlyServiceInstance = axios.create({
    // keep connections alive,
    // maxSockets default is Infinity, so Infinity is read as 50 sockets
    httpAgent: new http.Agent({ keepAlive: true }),
    httpsAgent: new https.Agent({ keepAlive: true }),
  });

  constructor(
    chainId: ChainId,
    tenderlyBaseUrl: string,
    tenderlyUser: string,
    tenderlyProject: string,
    tenderlyAccessKey: string,
    tenderlyNodeApiKey: string,
    v2PoolProvider: IV2PoolProvider,
    v3PoolProvider: IV3PoolProvider,
    provider: JsonRpcProvider,
    portionProvider: IPortionProvider,
    overrideEstimateMultiplier?: { [chainId in ChainId]?: number },
    tenderlyRequestTimeout?: number,
    tenderlyNodeApiSamplingPercent?: number,
    tenderlyNodeApiEnabledChains?: ChainId[]
  ) {
    super(provider, portionProvider, chainId);
    this.tenderlyBaseUrl = tenderlyBaseUrl;
    this.tenderlyUser = tenderlyUser;
    this.tenderlyProject = tenderlyProject;
    this.tenderlyAccessKey = tenderlyAccessKey;
    this.tenderlyNodeApiKey = tenderlyNodeApiKey;
    this.v2PoolProvider = v2PoolProvider;
    this.v3PoolProvider = v3PoolProvider;
    this.overrideEstimateMultiplier = overrideEstimateMultiplier ?? {};
    this.tenderlyRequestTimeout = tenderlyRequestTimeout;
    this.tenderlyNodeApiSamplingPercent = tenderlyNodeApiSamplingPercent;
    this.tenderlyNodeApiEnabledChains = tenderlyNodeApiEnabledChains;
  }

  public async simulateTransaction(
    fromAddress: string,
    swapOptions: SwapOptions,
    swapRoute: SwapRoute,
    providerConfig?: GasModelProviderConfig
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
      // simulating from beacon chain deposit address that should always hold **enough balance**
      if (currencyIn.isNative && this.chainId == ChainId.MAINNET) {
        fromAddress = BEACON_CHAIN_DEPOSIT_ADDRESS;
      }
      // Do initial onboarding approval of Permit2.
      const erc20Interface = Erc20__factory.createInterface();
      const approvePermit2Calldata = erc20Interface.encodeFunctionData(
        'approve',
        [PERMIT2_ADDRESS, MaxUint256]
      );

      // We are unsure if the users calldata contains a permit or not. We just
      // max approve the Universal Router from Permit2 instead, which will cover both cases.
      const permit2Interface = Permit2__factory.createInterface();
      const approveUniversalRouterCallData =
        permit2Interface.encodeFunctionData('approve', [
          tokenIn.address,
          UNIVERSAL_ROUTER_ADDRESS(this.chainId),
          MAX_UINT160,
          Math.floor(new Date().getTime() / 1000) + 10000000,
        ]);

      const approvePermit2: TenderlySimulationRequest = {
        network_id: chainId,
        estimate_gas: true,
        input: approvePermit2Calldata,
        to: tokenIn.address,
        value: '0',
        from: fromAddress,
        simulation_type: TenderlySimulationType.QUICK,
        save_if_fails: providerConfig?.saveTenderlySimulationIfFailed,
      };

      const approveUniversalRouter: TenderlySimulationRequest = {
        network_id: chainId,
        estimate_gas: true,
        input: approveUniversalRouterCallData,
        to: PERMIT2_ADDRESS,
        value: '0',
        from: fromAddress,
        simulation_type: TenderlySimulationType.QUICK,
        save_if_fails: providerConfig?.saveTenderlySimulationIfFailed,
      };

      const swap: TenderlySimulationRequest = {
        network_id: chainId,
        input: calldata,
        estimate_gas: true,
        to: UNIVERSAL_ROUTER_ADDRESS(this.chainId),
        value: currencyIn.isNative ? swapRoute.methodParameters.value : '0',
        from: fromAddress,
        block_number: blockNumber,
        simulation_type: TenderlySimulationType.QUICK,
        save_if_fails: providerConfig?.saveTenderlySimulationIfFailed,
      };

      const body: TenderlySimulationBody = {
        simulations: [approvePermit2, approveUniversalRouter, swap],
        estimate_gas: true,
      };
      const opts: AxiosRequestConfig = {
        headers: {
          'X-Access-Key': this.tenderlyAccessKey,
        },
        timeout: this.tenderlyRequestTimeout,
      };
      const url = TENDERLY_BATCH_SIMULATE_API(
        this.tenderlyBaseUrl,
        this.tenderlyUser,
        this.tenderlyProject
      );

      metric.putMetric(
        'TenderlySimulationUniversalRouterRequests',
        1,
        MetricLoggerUnit.Count
      );

      const before = Date.now();

      const { data: resp, status: httpStatus } =
        await this.tenderlyServiceInstance
          .post<TenderlyResponseUniversalRouter>(url, body, opts)
          .finally(() => {
            metric.putMetric(
              'TenderlySimulationLatencies',
              Date.now() - before,
              MetricLoggerUnit.Milliseconds
            );
          });

      // fire tenderly node endpoint sampling and forget
      this.sampleNodeEndpoint(
        approvePermit2,
        approveUniversalRouter,
        swap,
        resp
      );

      const latencies = Date.now() - before;
      log.info(
        `Tenderly simulation universal router request body: ${JSON.stringify(
          body,
          null,
          2
        )} with result ${JSON.stringify(
          resp,
          null,
          2
        )}, having latencies ${latencies} in milliseconds.`
      );
      metric.putMetric(
        'TenderlySimulationUniversalRouterLatencies',
        Date.now() - before,
        MetricLoggerUnit.Milliseconds
      );
      metric.putMetric(
        `TenderlySimulationUniversalRouterResponseStatus${httpStatus}`,
        1,
        MetricLoggerUnit.Count
      );

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
          resp.simulation_results[2].transaction.gas * estimateMultiplier
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
          approvePermit2Gas: resp.simulation_results[0].transaction.gas,
          approveUniversalRouterGas: resp.simulation_results[1].transaction.gas,
          swapGas: resp.simulation_results[2].transaction.gas,
          swapWithMultiplier: estimatedGasUsed.toString(),
        },
        'Successfully Simulated Approvals + Swap via Tenderly for Universal Router. Gas used.'
      );

      log.info(
        {
          body,
          swapSimulation: resp.simulation_results[2].simulation,
          swapTransaction: resp.simulation_results[2].transaction,
        },
        'Successful Tenderly Swap Simulation for Universal Router'
      );
    } else if (swapOptions.type == SwapType.SWAP_ROUTER_02) {
      const approve: TenderlySimulationRequest = {
        network_id: chainId,
        input: APPROVE_TOKEN_FOR_TRANSFER,
        estimate_gas: true,
        to: tokenIn.address,
        value: '0',
        from: fromAddress,
        simulation_type: TenderlySimulationType.QUICK,
      };

      const swap: TenderlySimulationRequest = {
        network_id: chainId,
        input: calldata,
        to: SWAP_ROUTER_02_ADDRESSES(chainId),
        estimate_gas: true,
        value: currencyIn.isNative ? swapRoute.methodParameters.value : '0',
        from: fromAddress,
        block_number: blockNumber,
        simulation_type: TenderlySimulationType.QUICK,
      };

      const body = { simulations: [approve, swap] };
      const opts: AxiosRequestConfig = {
        headers: {
          'X-Access-Key': this.tenderlyAccessKey,
        },
        timeout: this.tenderlyRequestTimeout,
      };

      const url = TENDERLY_BATCH_SIMULATE_API(
        this.tenderlyBaseUrl,
        this.tenderlyUser,
        this.tenderlyProject
      );

      metric.putMetric(
        'TenderlySimulationSwapRouter02Requests',
        1,
        MetricLoggerUnit.Count
      );

      const before = Date.now();

      const { data: resp, status: httpStatus } =
        await this.tenderlyServiceInstance.post<TenderlyResponseSwapRouter02>(
          url,
          body,
          opts
        );

      metric.putMetric(
        `TenderlySimulationSwapRouter02ResponseStatus${httpStatus}`,
        1,
        MetricLoggerUnit.Count
      );

      const latencies = Date.now() - before;
      log.info(
        `Tenderly simulation swap router02 request body: ${body}, having latencies ${latencies} in milliseconds.`
      );
      metric.putMetric(
        'TenderlySimulationSwapRouter02Latencies',
        latencies,
        MetricLoggerUnit.Milliseconds
      );

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
          resp.simulation_results[1].transaction.gas * estimateMultiplier
        ).toFixed(0)
      );

      log.info(
        {
          body,
          approveGasUsed: resp.simulation_results[0].transaction.gas_used,
          swapGasUsed: resp.simulation_results[1].transaction.gas_used,
          approveGas: resp.simulation_results[0].transaction.gas,
          swapGas: resp.simulation_results[1].transaction.gas,
          swapWithMultiplier: estimatedGasUsed.toString(),
        },
        'Successfully Simulated Approval + Swap via Tenderly for SwapRouter02. Gas used.'
      );

      log.info(
        {
          body,
          swapTransaction: resp.simulation_results[1].transaction,
          swapSimulation: resp.simulation_results[1].simulation,
        },
        'Successful Tenderly Swap Simulation for SwapRouter02'
      );
    } else {
      throw new Error(`Unsupported swap type: ${swapOptions}`);
    }

    const {
      estimatedGasUsedUSD,
      estimatedGasUsedQuoteToken,
      estimatedGasUsedGasToken,
      quoteGasAdjusted,
    } = await calculateGasUsed(
      chainId,
      swapRoute,
      estimatedGasUsed,
      this.v2PoolProvider,
      this.v3PoolProvider,
      this.provider,
      providerConfig
    );
    return {
      ...initSwapRouteFromExisting(
        swapRoute,
        this.v2PoolProvider,
        this.v3PoolProvider,
        this.portionProvider,
        quoteGasAdjusted,
        estimatedGasUsed,
        estimatedGasUsedQuoteToken,
        estimatedGasUsedUSD,
        swapOptions,
        estimatedGasUsedGasToken
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

  private async sampleNodeEndpoint(
    approvePermit2: TenderlySimulationRequest,
    approveUniversalRouter: TenderlySimulationRequest,
    swap: TenderlySimulationRequest,
    gatewayResp: TenderlyResponseUniversalRouter
  ): Promise<void> {
    if (
      Math.random() * 100 < (this.tenderlyNodeApiSamplingPercent ?? 0) &&
      (this.tenderlyNodeApiEnabledChains ?? []).find(
        (chainId) => chainId === this.chainId
      )
    ) {
      const nodeEndpoint = TENDERLY_NODE_API(
        this.chainId,
        this.tenderlyNodeApiKey
      );
      const body: TenderlyNodeEstimateGasBundleBody = {
        id: 1,
        jsonrpc: '2.0',
        method: 'tenderly_estimateGasBundle',
        params: [
          [
            {
              from: approvePermit2.from,
              to: approvePermit2.to,
              data: approvePermit2.input,
            },
            {
              from: approveUniversalRouter.from,
              to: approveUniversalRouter.to,
              data: approveUniversalRouter.input,
            },
            { from: swap.from, to: swap.to, data: swap.input },
          ],
          swap.block_number
            ? BigNumber.from(swap.block_number)
              .toHexString()
              .replace('0x0', '0x')
            : 'latest',
        ],
      };

      log.info(
        `About to invoke Tenderly Node Endpoint for gas estimation bundle ${JSON.stringify(
          body,
          null,
          2
        )}.`
      );

      const before = Date.now();

      try {
        // For now, we don't timeout tenderly node endpoint, but we should before we live switch to node endpoint
        const { data: resp, status: httpStatus } =
          await this.tenderlyServiceInstance.post<TenderlyResponseEstimateGasBundle>(
            nodeEndpoint,
            body
          );

        const latencies = Date.now() - before;
        metric.putMetric(
          'TenderlyNodeGasEstimateBundleLatencies',
          latencies,
          MetricLoggerUnit.Milliseconds
        );
        metric.putMetric(
          'TenderlyNodeGasEstimateBundleSuccess',
          1,
          MetricLoggerUnit.Count
        );

        log.info(
          `Tenderly estimate gas bundle request body: ${JSON.stringify(
            body,
            null,
            2
          )} with http status ${httpStatus} result ${JSON.stringify(
            resp,
            null,
            2
          )}, having latencies ${latencies} in milliseconds.`
        );

        if (gatewayResp.simulation_results.length !== resp.result.length) {
          metric.putMetric(
            'TenderlyNodeGasEstimateBundleLengthMismatch',
            1,
            MetricLoggerUnit.Count
          );
          return;
        }

        let gasEstimateMismatch = false;

        for (
          let i = 0;
          i <
          Math.min(gatewayResp.simulation_results.length, resp.result.length);
          i++
        ) {
          const gatewayGas = gatewayResp.simulation_results[i]!.transaction.gas;
          const nodeGas = Number(resp.result[i]!.gas);
          const gatewayGasUsed =
            gatewayResp.simulation_results[i]!.transaction.gas_used;
          const nodeGasUsed = Number(resp.result[i]!.gasUsed);

          if (gatewayGas !== nodeGas) {
            log.error(
              `Gateway gas and node gas estimates do not match for index ${i}`,
              { gatewayGas, nodeGas }
            );
            metric.putMetric(
              `TenderlyNodeGasEstimateBundleGasMismatch${i}`,
              1,
              MetricLoggerUnit.Count
            );
            gasEstimateMismatch = true;
          }

          if (gatewayGasUsed !== nodeGasUsed) {
            log.error(
              `Gateway gas and node gas used estimates do not match for index ${i}`,
              { gatewayGasUsed, nodeGasUsed }
            );
            metric.putMetric(
              `TenderlyNodeGasEstimateBundleGasUsedMismatch${i}`,
              1,
              MetricLoggerUnit.Count
            );
            gasEstimateMismatch = true;
          }
        }

        if (!gasEstimateMismatch) {
          metric.putMetric(
            'TenderlyNodeGasEstimateBundleMatch',
            1,
            MetricLoggerUnit.Count
          );
        }
      } catch (err) {
        log.error(
          `Failed to invoke Tenderly Node Endpoint for gas estimation bundle ${JSON.stringify(
            body,
            null,
            2
          )}. Error: ${err}`
        );

        metric.putMetric(
          'TenderlyNodeGasEstimateBundleFailure',
          1,
          MetricLoggerUnit.Count
        );
      }
    }
  }
}
