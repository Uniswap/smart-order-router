import { BigNumber } from '@ethersproject/bignumber';
import { ChainId } from '@uniswap/sdk-core';

import { TokenFeeDetector__factory } from '../types/other';
import { log, WRAPPED_NATIVE_CURRENCY } from '../util';

import { IMulticallProvider } from './multicall-provider';
import { ProviderConfig } from './provider';

type Address = string

export type TokenFeeResult = {
  buyFeeBps: BigNumber,
  sellFeeBps: BigNumber,
}
export type TokenFeeMap = Record<Address, TokenFeeResult>

// address at which the FeeDetector lens is deployed
const FEE_DETECTOR_ADDRESS = '0x57eC54d113719dDE9A90E6bE807524a86560E89D';
// Amount has to be big enough to avoid rounding errors, but small enough that
// most v2 pools will have at least this many token units
// 10000 is the smallest number that avoids rounding errors in bps terms
const AMOUNT_TO_FLASH_BORROW = '10000';
// 1M gas limit per validate call, should cover most swap cases
const GAS_LIMIT_PER_VALIDATE = 1_000_000;

export interface ITokenFeeFetcher {
  fetchFees(addresses: Address[], providerConfig?: ProviderConfig): Promise<TokenFeeMap>
}

export class OnChainTokenFeeFetcher implements ITokenFeeFetcher {
  private BASE_TOKEN: string;

  constructor(
    private chainId: ChainId,
    private multicall2Provider: IMulticallProvider,
    private tokenFeeAddress = FEE_DETECTOR_ADDRESS,
    private gasLimitPerCall = GAS_LIMIT_PER_VALIDATE,
    private amountToFlashBorrow = AMOUNT_TO_FLASH_BORROW,
  ) {
    this.BASE_TOKEN = WRAPPED_NATIVE_CURRENCY[this.chainId]?.address;
  }

  public async fetchFees(addresses: Address[], providerConfig?: ProviderConfig): Promise<TokenFeeMap> {
    const tokenToResult: TokenFeeMap = {};

    const functionParams = addresses
      .map((address) => [address, this.BASE_TOKEN, this.amountToFlashBorrow]) as [string, string, string][];

    // We use the validate function instead of batchValidate to avoid poison pill problem.
    // One token that consumes too much gas could cause the entire batch to fail.
    const multicallResult =
      await this.multicall2Provider.callSameFunctionOnContractWithMultipleParams<
        [string, string, string], // address, base token address, amount to borrow
        [TokenFeeResult]
      >({
        address: this.tokenFeeAddress,
        contractInterface: TokenFeeDetector__factory.createInterface(),
        functionName: 'validate',
        functionParams: functionParams,
        providerConfig,
        additionalConfig: {
          gasLimitPerCallOverride: this.gasLimitPerCall,
        },
      });

    for (let i = 0; i < multicallResult.results.length; i++) {
      const resultWrapper = multicallResult.results[i]!;
      const tokenAddress = addresses[i]!;

      // Could happen if the tokens transfer consumes too much gas so we revert. Just
      // drop the token in that case.
      if (!resultWrapper.success || resultWrapper.result.length < 1) {
        log.warn(
          { result: resultWrapper },
          `Failed to validate token ${tokenAddress}`
        );

        continue;
      }

      if (resultWrapper.result.length > 1) {
        log.warn(
          { result: resultWrapper },
          `Unexpected result length: ${resultWrapper.result.length}`
        );
      }

      tokenToResult[tokenAddress] = resultWrapper.result[0];
    }

    return tokenToResult
  }
}

