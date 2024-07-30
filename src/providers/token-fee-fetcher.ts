import { BigNumber } from '@ethersproject/bignumber';
import { BaseProvider } from '@ethersproject/providers';
import { ChainId } from '@uniswap/sdk-core';

import { TokenFeeDetector__factory } from '../types/other/factories/TokenFeeDetector__factory';
import { TokenFeeDetector } from '../types/other/TokenFeeDetector';
import {
  log,
  metric,
  MetricLoggerUnit,
  WRAPPED_NATIVE_CURRENCY,
} from '../util';

import { ProviderConfig } from './provider';

const DEFAULT_TOKEN_BUY_FEE_BPS = BigNumber.from(0);
const DEFAULT_TOKEN_SELL_FEE_BPS = BigNumber.from(0);

// on detector failure, assume no fee
export const DEFAULT_TOKEN_FEE_RESULT = {
  buyFeeBps: DEFAULT_TOKEN_BUY_FEE_BPS,
  sellFeeBps: DEFAULT_TOKEN_SELL_FEE_BPS,
};

type Address = string;

export type TokenFeeResult = {
  buyFeeBps?: BigNumber;
  sellFeeBps?: BigNumber;
  feeTakenOnTransfer?: boolean;
  externalTransferFailed?: boolean;
  sellReverted?: boolean;
};
export type TokenFeeMap = Record<Address, TokenFeeResult>;

// address at which the FeeDetector lens is deployed
const FEE_DETECTOR_ADDRESS = (chainId: ChainId) => {
  switch (chainId) {
    case ChainId.MAINNET:
      return '0xbc708B192552e19A088b4C4B8772aEeA83bCf760';
    case ChainId.OPTIMISM:
      return '0x95aDC98A949dCD94645A8cD56830D86e4Cf34Eff';
    case ChainId.BNB:
      return '0xCF6220e4496B091a6b391D48e770f1FbaC63E740';
    case ChainId.POLYGON:
      return '0xC988e19819a63C0e487c6Ad8d6668Ac773923BF2';
    case ChainId.BASE:
      return '0xCF6220e4496B091a6b391D48e770f1FbaC63E740';
    case ChainId.ARBITRUM_ONE:
      return '0x37324D81e318260DC4f0fCb68035028eFdE6F50e';
    case ChainId.CELO:
      return '0x8eEa35913DdeD795001562f9bA5b282d3ac04B60';
    case ChainId.AVALANCHE:
      return '0x8269d47c4910B8c87789aA0eC128C11A8614dfC8';
    default:
      // just default to mainnet contract
      return '0xbc708B192552e19A088b4C4B8772aEeA83bCf760';
  }
};

// Amount has to be big enough to avoid rounding errors, but small enough that
// most v2 pools will have at least this many token units
// 100000 is the smallest number that avoids rounding errors in bps terms
// 10000 was not sufficient due to rounding errors for rebase token (e.g. stETH)
const AMOUNT_TO_FLASH_BORROW = '100000';
// 1M gas limit per validate call, should cover most swap cases
const GAS_LIMIT_PER_VALIDATE = 1_000_000;

export interface ITokenFeeFetcher {
  fetchFees(
    addresses: Address[],
    providerConfig?: ProviderConfig
  ): Promise<TokenFeeMap>;
}

export class OnChainTokenFeeFetcher implements ITokenFeeFetcher {
  private BASE_TOKEN: string;
  private readonly contract: TokenFeeDetector;

  constructor(
    private chainId: ChainId,
    rpcProvider: BaseProvider,
    private tokenFeeAddress = FEE_DETECTOR_ADDRESS(chainId),
    private gasLimitPerCall = GAS_LIMIT_PER_VALIDATE,
    private amountToFlashBorrow = AMOUNT_TO_FLASH_BORROW
  ) {
    this.BASE_TOKEN = WRAPPED_NATIVE_CURRENCY[this.chainId]?.address;
    this.contract = TokenFeeDetector__factory.connect(
      this.tokenFeeAddress,
      rpcProvider
    );
  }

  public async fetchFees(
    addresses: Address[],
    providerConfig?: ProviderConfig
  ): Promise<TokenFeeMap> {
    const tokenToResult: TokenFeeMap = {};

    const addressesWithoutBaseToken = addresses.filter(
      (address) => address.toLowerCase() !== this.BASE_TOKEN.toLowerCase()
    );
    const functionParams = addressesWithoutBaseToken.map((address) => [
      address,
      this.BASE_TOKEN,
      this.amountToFlashBorrow,
    ]) as [string, string, string][];

    const results = await Promise.all(
      functionParams.map(async ([address, baseToken, amountToBorrow]) => {
        try {
          // We use the validate function instead of batchValidate to avoid poison pill problem.
          // One token that consumes too much gas could cause the entire batch to fail.
          const feeResult = await this.contract.callStatic.validate(
            address,
            baseToken,
            amountToBorrow,
            {
              gasLimit: this.gasLimitPerCall,
              blockTag: providerConfig?.blockNumber,
            }
          );

          metric.putMetric(
            'TokenFeeFetcherFetchFeesSuccess',
            1,
            MetricLoggerUnit.Count
          );

          return { address, ...feeResult };
        } catch (err) {
          log.error(
            { err },
            `Error calling validate on-chain for token ${address}`
          );

          metric.putMetric(
            'TokenFeeFetcherFetchFeesFailure',
            1,
            MetricLoggerUnit.Count
          );

          // in case of FOT token fee fetch failure, we return null
          // so that they won't get returned from the token-fee-fetcher
          // and thus no fee will be applied, and the cache won't cache on FOT tokens with failed fee fetching
          return {
            address,
            buyFeeBps: undefined,
            sellFeeBps: undefined,
            feeTakenOnTransfer: false,
            externalTransferFailed: false,
            sellReverted: false,
          };
        }
      })
    );

    results.forEach(
      ({
        address,
        buyFeeBps,
        sellFeeBps,
        feeTakenOnTransfer,
        externalTransferFailed,
        sellReverted,
      }) => {
        if (buyFeeBps || sellFeeBps) {
          tokenToResult[address] = {
            buyFeeBps,
            sellFeeBps,
            feeTakenOnTransfer,
            externalTransferFailed,
            sellReverted,
          };
        }
      }
    );

    return tokenToResult;
  }
}
