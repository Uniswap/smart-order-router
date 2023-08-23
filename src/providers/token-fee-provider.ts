import { ChainId, Token } from '@uniswap/sdk-core';
import { BigNumber } from '@ethersproject/bignumber';
import _ from 'lodash';

import { TokenFeeDetector__factory } from '../types/other/factories/TokenFeeDetector__factory';
import { log, WRAPPED_NATIVE_CURRENCY } from '../util';

import { ICache } from './cache';
import { IMulticallProvider } from './multicall-provider';
import { ProviderConfig } from './provider';
import { DEFAULT_ALLOWLIST } from './token-validator-provider';

export type TokenFeeResult = {
  buyFeeBps: BigNumber,
  sellFeeBps: BigNumber,
}

// on detector failure, assume no fee
const DEFAULT_TOKEN_FEE_RESULT = {
  buyFeeBps: BigNumber.from(0),
  sellFeeBps: BigNumber.from(0),
};

export interface TokenFeeResults {
  getFeesByToken(token: Token): TokenFeeResult | undefined;
}

// address at which the FeeDetector lens is deployed
const FEE_DETECTOR_ADDRESS = '0x57eC54d113719dDE9A90E6bE807524a86560E89D';
// Amount has to be big enough to avoid rounding errors, but small enough that
// most v2 pools will have at least this many token units
// 10000 is the smallest number that avoids rounding errors in bps terms
const AMOUNT_TO_FLASH_BORROW = '10000';
// 1M gas limit per validate call, should cover most swap cases
const GAS_LIMIT_PER_VALIDATE = 1_000_000;

/**
 * Provider for getting token fee data.
 *
 * @export
 * @interface ITokenFeeProvider
 */
export interface ITokenFeeProvider {
  /**
   * Gets the fees for the token at each address.
   *
   * @param tokens The token addresses to fetch fees for.
   * @param [providerConfig] The provider config.
   * @returns A token accessor with methods for accessing the tokens.
   */
  validateTokens(
    tokens: Token[],
    providerConfig?: ProviderConfig
  ): Promise<TokenFeeResults>;
}

export class TokenFeeProvider implements ITokenFeeProvider {
  private CACHE_KEY = (chainId: ChainId, address: string) =>
    `token-${chainId}-${address}`;

  private BASE_TOKEN: string;

  constructor(
    private chainId: ChainId,
    private multicall2Provider: IMulticallProvider,
    private tokenFeeCache: ICache<TokenFeeResult>,
    private tokenValidatorAddress = FEE_DETECTOR_ADDRESS,
    private gasLimitPerCall = GAS_LIMIT_PER_VALIDATE,
    private amountToFlashBorrow = AMOUNT_TO_FLASH_BORROW,
    private allowList = DEFAULT_ALLOWLIST
  ) {
    this.BASE_TOKEN = WRAPPED_NATIVE_CURRENCY[this.chainId]!.address;
  }

  public async validateTokens(
    tokens: Token[],
    providerConfig?: ProviderConfig
  ): Promise<TokenFeeResults> {
    const tokenAddressToToken = _.keyBy(tokens, (t) => t.address.toLowerCase());
    const addressesRaw = _(tokens)
      .map((token) => token.address.toLowerCase())
      .uniq()
      .value();

    const addresses: string[] = [];
    const tokenToResult: { [tokenAddress: string]: TokenFeeResult } = {};

    // Check if we have cached token validation results for any tokens.
    for (const address of addressesRaw) {
      const cachedValue = await this.tokenFeeCache.get(this.CACHE_KEY(this.chainId, address));
      if (cachedValue) {
        tokenToResult[address] = cachedValue
      } else if (this.allowList.has(address)) {
        tokenToResult[address] = DEFAULT_TOKEN_FEE_RESULT;
      } else {
        addresses.push(address);
      }
    }

    log.info(
      `Got token fee results for ${addressesRaw.length - addresses.length
      } tokens from cache. Getting ${addresses.length} on-chain.`
    );

    if (addresses.length > 0) {
      const functionParams = addresses
        .map((address) => [address, this.BASE_TOKEN, this.amountToFlashBorrow]) as [string, string, string][];

      // We use the validate function instead of batchValidate to avoid poison pill problem.
      // One token that consumes too much gas could cause the entire batch to fail.
      const multicallResult =
      await this.multicall2Provider.callSameFunctionOnContractWithMultipleParams<
      [string, string, string], // address, base token address, amount to borrow
      [TokenFeeResult]
      >({
        address: this.tokenValidatorAddress,
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
        const token = tokenAddressToToken[tokenAddress]!;

        // Could happen if the tokens transfer consumes too much gas so we revert. Just
        // drop the token in that case.
        if (!resultWrapper.success || resultWrapper.result.length < 1) {
          log.warn(
            { result: resultWrapper },
            `Failed to validate token ${token.symbol}`
          );

          continue;
        }
        if (resultWrapper.result.length > 1) {
          log.warn(
            { result: resultWrapper },
            `Unexpected result length: ${resultWrapper.result.length}`
          );
        }
        const validationResult = resultWrapper.result[0]!;

        tokenToResult[tokenAddress] =
          validationResult as TokenFeeResult;

        await this.tokenFeeCache.set(
          this.CACHE_KEY(this.chainId, tokenAddress),
          tokenToResult[tokenAddress]!
        );
      }
    }

    return {
      getFeesByToken: (token: Token) =>
        tokenToResult[token.address.toLowerCase()],
    };
  }
}
