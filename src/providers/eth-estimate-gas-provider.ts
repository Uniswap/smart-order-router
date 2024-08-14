import { BigNumber } from '@ethersproject/bignumber';
import { JsonRpcProvider } from '@ethersproject/providers';
import { ChainId } from '@uniswap/sdk-core';

import {
  GasModelProviderConfig,
  SwapOptions,
  SwapRoute,
  SwapType,
} from '../routers';
import { BEACON_CHAIN_DEPOSIT_ADDRESS, log } from '../util';
import {
  calculateGasUsed,
  initSwapRouteFromExisting,
} from '../util/gas-factory-helpers';

import { IPortionProvider } from './portion-provider';
import { ProviderConfig } from './provider';
import { SimulationStatus, Simulator } from './simulation-provider';
import { IV2PoolProvider } from './v2/pool-provider';
import { IV3PoolProvider } from './v3/pool-provider';
import { hexValue } from 'ethers/lib/utils';
import { ethers } from 'ethers';
import { permit2Address } from '@uniswap/permit2-sdk';
import { UNIVERSAL_ROUTER_ADDRESS } from '@uniswap/universal-router-sdk';

// We multiply eth estimate gas by this to add a buffer for gas limits
const DEFAULT_ESTIMATE_MULTIPLIER = 1.2;

const STATE_OVERRIDE_SUPPORTED_CHAINS = [ChainId.MAINNET]

type StateOverrides = {
  [key: string]: {
    balance?: string,
    state?: Object,
    stateDiff?: Object
  }
}

export class EthEstimateGasSimulator extends Simulator {
  v2PoolProvider: IV2PoolProvider;
  v3PoolProvider: IV3PoolProvider;
  private overrideEstimateMultiplier: { [chainId in ChainId]?: number };

  constructor(
    chainId: ChainId,
    provider: JsonRpcProvider,
    v2PoolProvider: IV2PoolProvider,
    v3PoolProvider: IV3PoolProvider,
    portionProvider: IPortionProvider,
    overrideEstimateMultiplier?: { [chainId in ChainId]?: number }
  ) {
    super(provider, portionProvider, chainId);
    this.v2PoolProvider = v2PoolProvider;
    this.v3PoolProvider = v3PoolProvider;
    this.overrideEstimateMultiplier = overrideEstimateMultiplier ?? {};
  }

  async ethEstimateGas(
    fromAddress: string,
    swapOptions: SwapOptions,
    route: SwapRoute,
    providerConfig?: ProviderConfig,
    stateOverrides?: StateOverrides
  ): Promise<SwapRoute> {
    const currencyIn = route.trade.inputAmount.currency;
    let estimatedGasUsed: BigNumber;
    if (swapOptions.type == SwapType.UNIVERSAL_ROUTER) {
      if (currencyIn.isNative && this.chainId == ChainId.MAINNET) {
        // w/o this gas estimate differs by a lot depending on if user holds enough native balance
        // always estimate gas as if user holds enough balance
        // so that gas estimate is consistent for UniswapX
        fromAddress = BEACON_CHAIN_DEPOSIT_ADDRESS;
      }
      log.info(
        { addr: fromAddress, methodParameters: route.methodParameters },
        'Simulating using eth_estimateGas on Universal Router'
      );
      try {
        estimatedGasUsed = await this.provider.send("eth_estimateGas", [{
          data: route.methodParameters!.calldata,
          to: route.methodParameters!.to,
          from: fromAddress,
          value: BigNumber.from(
            currencyIn.isNative ? route.methodParameters!.value : '0'
          ),
        }, "latest", stateOverrides]);
      } catch (e) {
        log.error({ e }, 'Error estimating gas');
        return {
          ...route,
          simulationStatus: SimulationStatus.Failed,
        };
      }
    } else if (swapOptions.type == SwapType.SWAP_ROUTER_02) {
      try {
        estimatedGasUsed = await this.provider.send("eth_estimateGas", [{
          data: route.methodParameters!.calldata,
          to: route.methodParameters!.to,
          from: fromAddress,
          value: BigNumber.from(
            currencyIn.isNative ? route.methodParameters!.value : '0'
          ),
        }, "latest", stateOverrides]);
      } catch (e) {
        log.error({ e }, 'Error estimating gas');
        return {
          ...route,
          simulationStatus: SimulationStatus.Failed,
        };
      }
    } else {
      throw new Error(`Unsupported swap type ${swapOptions}`);
    }

    estimatedGasUsed = this.adjustGasEstimate(estimatedGasUsed);
    log.info(
      {
        methodParameters: route.methodParameters,
        estimatedGasUsed: estimatedGasUsed.toString(),
      },
      'Simulated using eth_estimateGas on SwapRouter02'
    );

    const {
      estimatedGasUsedUSD,
      estimatedGasUsedQuoteToken,
      estimatedGasUsedGasToken,
      quoteGasAdjusted,
    } = await calculateGasUsed(
      route.quote.currency.chainId,
      route,
      estimatedGasUsed,
      this.v2PoolProvider,
      this.v3PoolProvider,
      this.provider,
      providerConfig
    );
    return {
      ...initSwapRouteFromExisting(
        route,
        this.v2PoolProvider,
        this.v3PoolProvider,
        this.portionProvider,
        quoteGasAdjusted,
        estimatedGasUsed,
        estimatedGasUsedQuoteToken,
        estimatedGasUsedUSD,
        swapOptions,
        estimatedGasUsedGasToken,
        providerConfig
      ),
      simulationStatus: SimulationStatus.Succeeded,
    };
  }

  private adjustGasEstimate(gasLimit: BigNumber): BigNumber {
    const estimateMultiplier =
      this.overrideEstimateMultiplier[this.chainId] ??
      DEFAULT_ESTIMATE_MULTIPLIER;

    const adjustedGasEstimate = BigNumber.from(gasLimit)
      .mul(estimateMultiplier * 100)
      .div(100);

    return adjustedGasEstimate;
  }

  protected getStateOverrides(
    fromAddress: string,
    swapOptions: SwapOptions,
    swapRoute: SwapRoute
  ): StateOverrides | undefined {
    const tokenIn = swapRoute.trade.inputAmount.currency.wrapped.address;
    const permit2 = permit2Address(this.chainId);
    const spender = UNIVERSAL_ROUTER_ADDRESS(this.chainId);
    const tokenAllowanceSlot = 3; 
    const tokenAllowanceSlotMappingIndex = ethers.utils.solidityKeccak256(
      ["address", "uint256"],
      [permit2, ethers.utils.solidityKeccak256(
        ["address", "uint256"],
        [fromAddress, tokenAllowanceSlot]
      )]
    );
    const permit2AllowanceSlot = 1;
    const firstLevel = ethers.utils.solidityKeccak256(
      ["uint256", "uint256"],
      [fromAddress, permit2AllowanceSlot]
    ); // returns mapping(address => mapping(address => PackedAllowance))
    const secondLevel = ethers.utils.solidityKeccak256(
      ["uint256", "uint256"],
      [tokenIn, firstLevel]
    ); // returns mapping(address => PackedAllowance)
    const thirdLevel = ethers.utils.solidityKeccak256(
      ["uint256", "uint256"],
      [spender, secondLevel]
    ); // returns PackedAllowance

    if (swapOptions.type == SwapType.UNIVERSAL_ROUTER) {
      return {
        // give from address max balance
        [fromAddress]: {
          balance: hexValue(ethers.constants.MaxUint256),
        },
        // fromAddress max approves Permit2
        [tokenIn]: {
          stateDiff: {
            [tokenAllowanceSlotMappingIndex]: hexValue(ethers.constants.MaxUint256),
          }
        },
        // permit2 allowance on UR
        // PackedAllowance is of shape (uint160 amount, uint48 expiration, uint48 nonce)
        // we use max everything
        [permit2]: {
          stateDiff: {
            [thirdLevel]: ethers.utils.solidityPack(['uint160', 'uint48', 'uint48'], [hexValue("0xffffffffffffffffffffffffffffffffffffffff"), hexValue("0xffffffffffff"), hexValue("0xffffffffffff")])
          }
        }
      }
    }
    return undefined;
  }

  protected async simulateTransaction(
    fromAddress: string,
    swapOptions: SwapOptions,
    swapRoute: SwapRoute,
    _providerConfig?: GasModelProviderConfig
  ): Promise<SwapRoute> {
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
      return await this.ethEstimateGas(
        fromAddress,
        swapOptions,
        swapRoute,
        _providerConfig
      );
    } else if (STATE_OVERRIDE_SUPPORTED_CHAINS.includes(this.chainId)) {
      /// Since we only use the gas from the swap itself, we can use state overrides when supported to override the approval
      log.info('Token not approved, trying to simulate with state override');

      return await this.ethEstimateGas(
        fromAddress,
        swapOptions,
        swapRoute,
        _providerConfig,
        this.getStateOverrides(fromAddress, swapOptions, swapRoute)
      );
    }
    else {
      log.info('Token not approved, skipping simulation');
      return {
        ...swapRoute,
        simulationStatus: SimulationStatus.NotApproved,
      };
    }
  }
}
