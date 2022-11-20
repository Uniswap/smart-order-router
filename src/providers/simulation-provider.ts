import { JsonRpcProvider } from '@ethersproject/providers';
import { TradeType } from '@uniswap/sdk-core';
import { PERMIT2_ADDRESS } from '@uniswap/universal-router-sdk';
import { BigNumber } from 'ethers/lib/ethers';

import { SwapOptions, SwapRoute, SwapType } from '../routers';
import { Erc20__factory } from '../types/other/factories/Erc20__factory';
import { Permit2__factory } from '../types/other/factories/Permit2__factory';
import { ChainId, CurrencyAmount, log, SWAP_ROUTER_02_ADDRESS } from '../util';

import { ArbitrumGasData, OptimismGasData } from './v3/gas-data-provider';

export type SimulationResult = {
  transaction: { hash: string; gas_used: number; error_message: string };
  simulation: { state_overrides: Record<string, unknown> };
};

export enum SimulationStatus {
  Unattempted = 0,
  Failed = 1,
  Succeeded = 2,
}

/**
 * Provider for dry running transactions.
 *
 * @export
 * @class Simulator
 */
export abstract class Simulator {
  protected provider: JsonRpcProvider;

  /**
   * Returns a new SwapRoute with simulated gas estimates
   * @returns SwapRoute
   */
  constructor(provider: JsonRpcProvider, protected chainId: ChainId) {
    this.provider = provider;
  }

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
      return { ...swapRoute, simulationStatus: SimulationStatus.Unattempted };
    }
  }

  protected abstract simulateTransaction(
    fromAddress: string,
    swapOptions: SwapOptions,
    swapRoute: SwapRoute,
    l2GasData?: OptimismGasData | ArbitrumGasData
  ): Promise<SwapRoute>;

  protected async userHasSufficientBalance(
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

    if (swapOptions.type == SwapType.UNIVERSAL_ROUTER) {
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
      const permit2Contract = Permit2__factory.connect(
        PERMIT2_ADDRESS,
        provider
      );

      const { amount: tokenAllowance, expiration: tokenExpiration } =
        await permit2Contract.allowance(
          fromAddress,
          inputAmount.currency.wrapped.address,
          SWAP_ROUTER_02_ADDRESS
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
    } else if (swapOptions.type == SwapType.SWAP_ROUTER_02) {
      const allowance = await tokenContract.allowance(
        fromAddress,
        SWAP_ROUTER_02_ADDRESS
      );
      // Return true if token allowance is greater than input amount
      return allowance.gt(BigNumber.from(inputAmount.quotient.toString()));
    }

    throw new Error(`Unsupported swap type ${swapOptions}`);
  }
}
