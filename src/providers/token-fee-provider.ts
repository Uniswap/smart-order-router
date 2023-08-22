import { ChainId, Token } from '@uniswap/sdk-core';
import _ from 'lodash';

import { TokenFeeDetector__factory } from '../types/other/factories/TokenFeeDetector__factory';
import { log, WRAPPED_NATIVE_CURRENCY } from '../util';

import { ICache } from './cache';
import { IMulticallProvider } from './multicall-provider';
import { ProviderConfig } from './provider';
import { DEFAULT_ALLOWLIST } from './token-validator-provider';

export type TokenFeeResult = {
  buyFeeBps: number,
  sellFeeBps: number,
}

// on detector failure, assume no fee
const DEFAULT_TOKEN_FEE_RESULT = {
  buyFeeBps: 0,
  sellFeeBps: 0,
};

export interface TokenFeeResults {
  getFeesByToken(token: Token): TokenFeeResult | undefined;
}

const FEE_DETECTOR_ADDRESS = '0x57eC54d113719dDE9A90E6bE807524a86560E89D';
const AMOUNT_TO_FLASH_BORROW = '1000';
const GAS_LIMIT_PER_VALIDATE = 1_000_000;

/**
 * Provider for getting token fee data.
 *
 * @export
 * @interface ITokenFeeProvider
 */
export interface ITokenFeeProvider {
  /**
   * Gets the token at each address. Any addresses that are not valid ERC-20 are ignored.
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
    protected chainId: ChainId,
    protected multicall2Provider: IMulticallProvider,
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
    const tokenAddressToToken = _.keyBy(tokens, 'address');
    const addressesRaw = _(tokens)
      .map((token) => token.address)
      .uniq()
      .value();

    const addresses: string[] = [];
    const tokenToResult: { [tokenAddress: string]: TokenFeeResult } = {};

    // Check if we have cached token validation results for any tokens.
    for (const address of addressesRaw) {
      if (
        await this.tokenFeeCache.has(
          this.CACHE_KEY(this.chainId, address)
        )
      ) {
        tokenToResult[address.toLowerCase()] =
          (await this.tokenFeeCache.get(
            this.CACHE_KEY(this.chainId, address)
          ))!;
      } else {
        addresses.push(address);
      }
    }

    log.info(
      `Got token fee results for ${
        addressesRaw.length - addresses.length
      } tokens from cache. Getting ${addresses.length} on-chain.`
    );

    const functionParams = _(addresses)
      .map((address) => [address, this.BASE_TOKEN, this.amountToFlashBorrow])
      .value() as [string, string, string][];

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

      if (this.allowList.has(token.address.toLowerCase())) {
        tokenToResult[token.address.toLowerCase()] = DEFAULT_TOKEN_FEE_RESULT;

        await this.tokenFeeCache.set(
          this.CACHE_KEY(this.chainId, token.address.toLowerCase()),
          tokenToResult[token.address.toLowerCase()]!
        );

        continue;
      }

      // Could happen if the tokens transfer consumes too much gas so we revert. Just
      // drop the token in that case.
      if (!resultWrapper.success) {
        log.info(
          { result: resultWrapper },
          `Failed to validate token ${token.symbol}`
        );

        continue;
      }

      const validationResult = resultWrapper.result[0]!;

      tokenToResult[token.address.toLowerCase()] =
        validationResult as TokenFeeResult;

      await this.tokenFeeCache.set(
        this.CACHE_KEY(this.chainId, token.address.toLowerCase()),
        tokenToResult[token.address.toLowerCase()]!
      );
    }

    return {
      getFeesByToken: (token: Token) =>
        tokenToResult[token.address.toLowerCase()],
    };
  }
}
