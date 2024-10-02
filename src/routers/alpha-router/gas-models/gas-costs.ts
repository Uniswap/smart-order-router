import { BigNumber } from '@ethersproject/bignumber';
import { ChainId, Currency } from '@uniswap/sdk-core';

import { Protocol } from '@uniswap/router-sdk';
import { AAVE_MAINNET, LIDO_MAINNET } from '../../../providers';
import { V3Route, V4Route } from '../../router';

// Cost for crossing an uninitialized tick.
export const COST_PER_UNINIT_TICK = BigNumber.from(0);

//l2 execution fee on optimism is roughly the same as mainnet
export const BASE_SWAP_COST = (id: ChainId): BigNumber => {
  switch (id) {
    case ChainId.MAINNET:
    case ChainId.GOERLI:
    case ChainId.SEPOLIA:
    case ChainId.OPTIMISM:
    case ChainId.OPTIMISM_GOERLI:
    case ChainId.OPTIMISM_SEPOLIA:
    case ChainId.BNB:
    case ChainId.AVALANCHE:
    case ChainId.BASE:
    case ChainId.BASE_GOERLI:
    case ChainId.ZORA:
    case ChainId.ZORA_SEPOLIA:
    case ChainId.ROOTSTOCK:
    case ChainId.BLAST:
    case ChainId.ZKSYNC:
    case ChainId.WORLDCHAIN:
    case ChainId.ASTROCHAIN_SEPOLIA:
      return BigNumber.from(2000);
    case ChainId.ARBITRUM_ONE:
    case ChainId.ARBITRUM_GOERLI:
    case ChainId.ARBITRUM_SEPOLIA:
      return BigNumber.from(5000);
    case ChainId.POLYGON:
    case ChainId.POLYGON_MUMBAI:
      return BigNumber.from(2000);

    case ChainId.CELO:
    case ChainId.CELO_ALFAJORES:
      return BigNumber.from(2000);

    //TODO determine if sufficient
    case ChainId.GNOSIS:
      return BigNumber.from(2000);
    case ChainId.MOONBEAM:
      return BigNumber.from(2000);
  }
};
export const COST_PER_INIT_TICK = (id: ChainId): BigNumber => {
  switch (id) {
    case ChainId.MAINNET:
    case ChainId.GOERLI:
    case ChainId.SEPOLIA:
    case ChainId.BNB:
    case ChainId.AVALANCHE:
      return BigNumber.from(31000);
    case ChainId.OPTIMISM:
    case ChainId.OPTIMISM_GOERLI:
    case ChainId.OPTIMISM_SEPOLIA:
    case ChainId.BASE:
    case ChainId.BASE_GOERLI:
    case ChainId.ZORA:
    case ChainId.ZORA_SEPOLIA:
    case ChainId.ROOTSTOCK:
    case ChainId.BLAST:
    case ChainId.ZKSYNC:
    case ChainId.WORLDCHAIN:
    case ChainId.ASTROCHAIN_SEPOLIA:
      return BigNumber.from(31000);
    case ChainId.ARBITRUM_ONE:
    case ChainId.ARBITRUM_GOERLI:
    case ChainId.ARBITRUM_SEPOLIA:
      return BigNumber.from(31000);
    case ChainId.POLYGON:
    case ChainId.POLYGON_MUMBAI:
      return BigNumber.from(31000);
    case ChainId.CELO:
    case ChainId.CELO_ALFAJORES:
      return BigNumber.from(31000);
    case ChainId.GNOSIS:
      return BigNumber.from(31000);
    case ChainId.MOONBEAM:
      return BigNumber.from(31000);
  }
};

export const COST_PER_HOP = (id: ChainId): BigNumber => {
  switch (id) {
    case ChainId.MAINNET:
    case ChainId.GOERLI:
    case ChainId.SEPOLIA:
    case ChainId.BNB:
    case ChainId.OPTIMISM:
    case ChainId.OPTIMISM_GOERLI:
    case ChainId.OPTIMISM_SEPOLIA:
    case ChainId.AVALANCHE:
    case ChainId.BASE:
    case ChainId.BASE_GOERLI:
    case ChainId.ZORA:
    case ChainId.ZORA_SEPOLIA:
    case ChainId.ROOTSTOCK:
    case ChainId.BLAST:
    case ChainId.ZKSYNC:
    case ChainId.WORLDCHAIN:
    case ChainId.ASTROCHAIN_SEPOLIA:
      return BigNumber.from(80000);
    case ChainId.ARBITRUM_ONE:
    case ChainId.ARBITRUM_GOERLI:
    case ChainId.ARBITRUM_SEPOLIA:
      return BigNumber.from(80000);
    case ChainId.POLYGON:
    case ChainId.POLYGON_MUMBAI:
      return BigNumber.from(80000);
    case ChainId.CELO:
    case ChainId.CELO_ALFAJORES:
      return BigNumber.from(80000);
    case ChainId.GNOSIS:
      return BigNumber.from(80000);
    case ChainId.MOONBEAM:
      return BigNumber.from(80000);
  }
};

export const SINGLE_HOP_OVERHEAD = (_id: ChainId): BigNumber => {
  return BigNumber.from(15000);
};

export const TOKEN_OVERHEAD = (
  id: ChainId,
  route: V3Route | V4Route
): BigNumber => {
  const currencies: Currency[] =
    route.protocol === Protocol.V4 ? route.currencyPath : route.tokenPath;
  let overhead = BigNumber.from(0);

  if (id == ChainId.MAINNET) {
    // AAVE's transfer contains expensive governance snapshotting logic. We estimate
    // it at around 150k.
    if (currencies.some((t: Currency) => t.equals(AAVE_MAINNET))) {
      overhead = overhead.add(150000);
    }

    // LDO's reaches out to an external token controller which adds a large overhead
    // of around 150k.
    if (currencies.some((t: Currency) => t.equals(LIDO_MAINNET))) {
      overhead = overhead.add(150000);
    }
  }

  return overhead;
};

// TODO: change per chain
export const NATIVE_WRAP_OVERHEAD = (id: ChainId): BigNumber => {
  switch (id) {
    default:
      return BigNumber.from(27938);
  }
};

export const NATIVE_UNWRAP_OVERHEAD = (id: ChainId): BigNumber => {
  switch (id) {
    default:
      return BigNumber.from(36000);
  }
};

export const NATIVE_OVERHEAD = (
  chainId: ChainId,
  amount: Currency,
  quote: Currency
): BigNumber => {
  if (amount.isNative) {
    // need to wrap eth in
    return NATIVE_WRAP_OVERHEAD(chainId);
  }
  if (quote.isNative) {
    // need to unwrap eth out
    return NATIVE_UNWRAP_OVERHEAD(chainId);
  }
  return BigNumber.from(0);
};
