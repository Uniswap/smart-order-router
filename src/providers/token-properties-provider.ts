import { BigNumber } from '@ethersproject/bignumber';
import { ChainId, Token } from '@uniswap/sdk-core';

import { TokenFeeDetector__factory } from '../types/other';
import { WRAPPED_NATIVE_CURRENCY } from '../util';
import { log } from '../util';

import { ICache } from './cache';
import { IMulticallProvider } from './multicall-provider';
import { ProviderConfig } from './provider';
import {
  DEFAULT_ALLOWLIST,
} from './token-validator-provider';




export type TokenFeeResult = {
  buyFeeBps: BigNumber,
  sellFeeBps: BigNumber,
}

const DEFAULT_TOKEN_BUY_FEE_BPS = BigNumber.from(0);
const DEFAULT_TOKEN_SELL_FEE_BPS = BigNumber.from(0);

// on detector failure, assume no fee
const DEFAULT_TOKEN_FEE_RESULT = {
  buyFeeBps: DEFAULT_TOKEN_BUY_FEE_BPS,
  sellFeeBps: DEFAULT_TOKEN_SELL_FEE_BPS,
};

const DEFAULT_TOKEN_PROPERTIES_RESULT: TokenPropertiesResult = {
  tokenFeeResult: DEFAULT_TOKEN_FEE_RESULT,
}

// address at which the FeeDetector lens is deployed
const FEE_DETECTOR_ADDRESS = '0x57eC54d113719dDE9A90E6bE807524a86560E89D';
// Amount has to be big enough to avoid rounding errors, but small enough that
// most v2 pools will have at least this many token units
// 10000 is the smallest number that avoids rounding errors in bps terms
const AMOUNT_TO_FLASH_BORROW = '10000';
// 1M gas limit per validate call, should cover most swap cases
const GAS_LIMIT_PER_VALIDATE = 1_000_000;

export type TokenPropertiesResult = {
  tokenFeeResult: TokenFeeResult;
}

export class TokenPropertiesResults {
  constructor(private readonly tokenToResult: { [tokenAddress: string]: TokenPropertiesResult } ) {}

  getPropertiesByToken(token: Token): TokenPropertiesResult | undefined {
    return this.tokenToResult[token.address.toLowerCase()];
  }
}

export interface ITokenPropertiesProvider {
  getTokensProperties(
    tokens: Token[],
    providerConfig?: ProviderConfig
  ): Promise<TokenPropertiesResults>
}

export class TokenPropertiesProvider implements ITokenPropertiesProvider {
  private CACHE_KEY = (chainId: ChainId, address: string) =>
    `token-${chainId}-${address}`;
  private BASE_TOKEN: string;

  constructor(
    private chainId: ChainId,
    private multicall2Provider: IMulticallProvider,
    private tokenPropertiesCache: ICache<TokenPropertiesResult>,
    private tokenValidatorAddress = FEE_DETECTOR_ADDRESS,
    private gasLimitPerCall = GAS_LIMIT_PER_VALIDATE,
    private amountToFlashBorrow = AMOUNT_TO_FLASH_BORROW,
    private allowList = DEFAULT_ALLOWLIST
  ) {
    this.BASE_TOKEN = WRAPPED_NATIVE_CURRENCY[this.chainId]?.address;
  }

  public async getTokensProperties(
    tokens: Token[],
    providerConfig?: ProviderConfig
  ): Promise<TokenPropertiesResults> {
    const tokenToResult: { [tokenAddress: string]: TokenPropertiesResult } = {};
    const addressesToFetchFeesOnchain: string[] = [];
    const addressesRaw = this.buildAddressesRaw(tokens);

    // Check if we have cached token validation results for any tokens.
    for (const address of addressesRaw) {
      const cachedValue = await this.tokenPropertiesCache.get(this.CACHE_KEY(this.chainId, address));
      if (cachedValue) {
        tokenToResult[address] = cachedValue
      } else if (this.allowList.has(address)) {
        tokenToResult[address] = DEFAULT_TOKEN_PROPERTIES_RESULT;
      } else {
        addressesToFetchFeesOnchain.push(address);
      }
    }

    log.info(
      `Got token fee results for ${addressesRaw.size - addressesToFetchFeesOnchain.length
      } tokens from cache. Getting ${addressesToFetchFeesOnchain.length} on-chain.`
    );

    if (addressesToFetchFeesOnchain.length > 0) {
      const functionParams = addressesToFetchFeesOnchain
        .map((address) => [address, this.BASE_TOKEN, this.amountToFlashBorrow]) as [string, string, string][];

      // We use the validate function instead of batchValidate to avoid poison pill problem.
      // One token that consumes too much gas could cause the entire batch to fail.
      const multicallResult =
        await this.multicall2Provider.callSameFunctionOnContractWithMultipleParams<
          [string, string, string], // address, base token address, amount to borrow
          [TokenPropertiesResult]
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
        const tokenAddress = addressesToFetchFeesOnchain[i]!;

        // Could happen if the tokens transfer consumes too much gas so we revert. Just
        // drop the token in that case.
        if (!resultWrapper.success || resultWrapper.result.length < 1) {
          log.error(
            { result: resultWrapper },
            `Failed to validate token ${tokenAddress}`
          );

          continue;
        }

        if (resultWrapper.result.length > 1) {
          log.error(
            { result: resultWrapper },
            `Unexpected result length: ${resultWrapper.result.length}`
          );
        }

        const propertiesResult: TokenPropertiesResult = resultWrapper.result[0];
        tokenToResult[tokenAddress] = propertiesResult as TokenPropertiesResult;

        await this.tokenPropertiesCache.set(
          this.CACHE_KEY(this.chainId, tokenAddress),
          tokenToResult[tokenAddress]!
        );
      }
    }

    return new TokenPropertiesResults(tokenToResult);
  }

  private buildAddressesRaw(tokens: Token[]): Set<string> {
    const addressesRaw = new Set<string>();

    for (const token of tokens) {
      const address = token.address.toLowerCase();
      if (!addressesRaw.has(address)) {
        addressesRaw.add(address)
      }
    }

    return addressesRaw;
  }
}
