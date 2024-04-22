import { ChainId } from '@uniswap/sdk-core';

import {
  BatchParams,
  BlockNumberConfig,
  FailureOverrides,
  QuoteRetryOptions,
} from '../providers';

export const NETWORKS_WITH_SAME_RETRY_OPTIONS = Object.values(
  ChainId
) as ChainId[];

export function constructSameRetryOptionsMap<T extends QuoteRetryOptions>(
  retryOptions: T,
  additionalNetworks: ChainId[] = []
): { [chainId: number]: T } {
  return NETWORKS_WITH_SAME_RETRY_OPTIONS.concat(additionalNetworks).reduce<{
    [chainId: number]: T;
  }>((memo, chainId) => {
    memo[chainId] = retryOptions;
    return memo;
  }, {});
}

export const DEFAULT_RETRY_OPTIONS: QuoteRetryOptions = {
  retries: 2,
  minTimeout: 100,
  maxTimeout: 1000,
};

export const RETRY_OPTIONS = {
  ...constructSameRetryOptionsMap(DEFAULT_RETRY_OPTIONS),
};

export const NETWORKS_WITH_SAME_BATCH_PARAMS = Object.values(
  ChainId
) as ChainId[];

export function constructSameBatchParamsMap<T extends BatchParams>(
  batchParams: T,
  additionalNetworks: ChainId[] = []
): { [chainId: number]: T } {
  return NETWORKS_WITH_SAME_BATCH_PARAMS.concat(additionalNetworks).reduce<{
    [chainId: number]: T;
  }>((memo, chainId) => {
    memo[chainId] = batchParams;
    return memo;
  }, {});
}

export const DEFAULT_BATCH_PARAMS: BatchParams = {
  multicallChunk: 210,
  gasLimitPerCall: 705_000,
  quoteMinSuccessRate: 0.15,
};

export const BATCH_PARAMS = {
  ...constructSameBatchParamsMap(DEFAULT_BATCH_PARAMS),
};

export const NETWORKS_WITH_SAME_GAS_ERROR_FAILURE_OVERRIDES = Object.values(
  ChainId
) as ChainId[];

export function constructSameGasErrorFailureOverridesMap<
  T extends FailureOverrides
>(
  gasErrorFailureOverrides: T,
  additionalNetworks: ChainId[] = []
): { [chainId: number]: T } {
  return NETWORKS_WITH_SAME_GAS_ERROR_FAILURE_OVERRIDES.concat(
    additionalNetworks
  ).reduce<{
    [chainId: number]: T;
  }>((memo, chainId) => {
    memo[chainId] = gasErrorFailureOverrides;
    return memo;
  }, {});
}

export const DEFAULT_GAS_ERROR_FAILURE_OVERRIDES: FailureOverrides = {
  gasLimitOverride: 2_000_000,
  multicallChunk: 70,
};

export const GAS_ERROR_FAILURE_OVERRIDES = {
  ...constructSameGasErrorFailureOverridesMap(
    DEFAULT_GAS_ERROR_FAILURE_OVERRIDES
  ),
};

export const NETWORKS_WITH_SAME_SUCCESS_RATE_FAILURE_OVERRIDES = [
  ChainId.POLYGON,
];

export function constructSameSuccessRateFailureOverridesMap<
  T extends FailureOverrides
>(
  successRateFailureOverrides: T,
  additionalNetworks: ChainId[] = []
): { [chainId: number]: T } {
  return NETWORKS_WITH_SAME_SUCCESS_RATE_FAILURE_OVERRIDES.concat(
    additionalNetworks
  ).reduce<{
    [chainId: number]: T;
  }>((memo, chainId) => {
    memo[chainId] = successRateFailureOverrides;
    return memo;
  }, {});
}

export const DEFAULT_SUCCESS_RATE_FAILURE_OVERRIDES: FailureOverrides = {
  gasLimitOverride: 1_300_000,
  multicallChunk: 110,
};

export const SUCCESS_RATE_FAILURE_OVERRIDES = {
  ...constructSameSuccessRateFailureOverridesMap(
    DEFAULT_SUCCESS_RATE_FAILURE_OVERRIDES
  ),
};

export const NETWORKS_WITH_SAME_BLOCK_NUMBER_CONFIGS = Object.values(
  ChainId
) as ChainId[];

export function constructSameBlockNumberConfigsMap<T extends BlockNumberConfig>(
  blockNumberConfigs: T,
  additionalNetworks: ChainId[] = []
): { [chainId: number]: T } {
  return NETWORKS_WITH_SAME_BLOCK_NUMBER_CONFIGS.concat(
    additionalNetworks
  ).reduce<{
    [chainId: number]: T;
  }>((memo, chainId) => {
    memo[chainId] = blockNumberConfigs;
    return memo;
  }, {});
}

export const DEFAULT_BLOCK_NUMBER_CONFIGS: BlockNumberConfig = {
  baseBlockOffset: 0,
  rollback: { enabled: false },
};

export const BLOCK_NUMBER_CONFIGS = {
  ...constructSameBlockNumberConfigsMap(DEFAULT_BLOCK_NUMBER_CONFIGS),
};
