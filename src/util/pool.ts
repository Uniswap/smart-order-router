import { ChainId } from '@kittycorn-labs/sdk-core';
import { ADDRESS_ZERO } from '@uniswap/router-sdk';
import { Pool as V4Pool } from '@uniswap/v4-sdk';

import { nativeOnChain } from './chains';

const FAKE_TICK_SPACING = 0;

export const V4_ETH_WETH_FAKE_POOL: { [chainId in ChainId]: V4Pool } = {
  [ChainId.MAINNET]: new V4Pool(
    nativeOnChain(ChainId.MAINNET),
    nativeOnChain(ChainId.MAINNET).wrapped,
    0,
    FAKE_TICK_SPACING,
    ADDRESS_ZERO,
    79228162514264337593543950336,
    0,
    0
  ),
  [ChainId.GOERLI]: new V4Pool(
    nativeOnChain(ChainId.GOERLI),
    nativeOnChain(ChainId.GOERLI).wrapped,
    0,
    FAKE_TICK_SPACING,
    ADDRESS_ZERO,
    79228162514264337593543950336,
    0,
    0
  ),
  [ChainId.SEPOLIA]: new V4Pool(
    nativeOnChain(ChainId.SEPOLIA),
    nativeOnChain(ChainId.SEPOLIA).wrapped,
    0,
    FAKE_TICK_SPACING,
    ADDRESS_ZERO,
    79228162514264337593543950336,
    0,
    0
  ),
  [ChainId.OPTIMISM]: new V4Pool(
    nativeOnChain(ChainId.OPTIMISM),
    nativeOnChain(ChainId.OPTIMISM).wrapped,
    0,
    FAKE_TICK_SPACING,
    ADDRESS_ZERO,
    79228162514264337593543950336,
    0,
    0
  ),
  [ChainId.OPTIMISM_GOERLI]: new V4Pool(
    nativeOnChain(ChainId.OPTIMISM_GOERLI),
    nativeOnChain(ChainId.OPTIMISM_GOERLI).wrapped,
    0,
    FAKE_TICK_SPACING,
    ADDRESS_ZERO,
    79228162514264337593543950336,
    0,
    0
  ),
  [ChainId.OPTIMISM_SEPOLIA]: new V4Pool(
    nativeOnChain(ChainId.OPTIMISM_SEPOLIA),
    nativeOnChain(ChainId.OPTIMISM_SEPOLIA).wrapped,
    0,
    FAKE_TICK_SPACING,
    ADDRESS_ZERO,
    79228162514264337593543950336,
    0,
    0
  ),
  [ChainId.ARBITRUM_ONE]: new V4Pool(
    nativeOnChain(ChainId.ARBITRUM_ONE),
    nativeOnChain(ChainId.ARBITRUM_ONE).wrapped,
    0,
    FAKE_TICK_SPACING,
    ADDRESS_ZERO,
    79228162514264337593543950336,
    0,
    0
  ),
  [ChainId.ARBITRUM_GOERLI]: new V4Pool(
    nativeOnChain(ChainId.ARBITRUM_GOERLI),
    nativeOnChain(ChainId.ARBITRUM_GOERLI).wrapped,
    0,
    FAKE_TICK_SPACING,
    ADDRESS_ZERO,
    79228162514264337593543950336,
    0,
    0
  ),
  [ChainId.ARBITRUM_SEPOLIA]: new V4Pool(
    nativeOnChain(ChainId.ARBITRUM_SEPOLIA),
    nativeOnChain(ChainId.ARBITRUM_SEPOLIA).wrapped,
    0,
    FAKE_TICK_SPACING,
    ADDRESS_ZERO,
    79228162514264337593543950336,
    0,
    0
  ),
  [ChainId.POLYGON]: new V4Pool(
    nativeOnChain(ChainId.POLYGON),
    nativeOnChain(ChainId.POLYGON).wrapped,
    0,
    FAKE_TICK_SPACING,
    ADDRESS_ZERO,
    79228162514264337593543950336,
    0,
    0
  ),
  [ChainId.POLYGON_MUMBAI]: new V4Pool(
    nativeOnChain(ChainId.POLYGON_MUMBAI),
    nativeOnChain(ChainId.POLYGON_MUMBAI).wrapped,
    0,
    FAKE_TICK_SPACING,
    ADDRESS_ZERO,
    79228162514264337593543950336,
    0,
    0
  ),
  [ChainId.CELO]: new V4Pool(
    nativeOnChain(ChainId.CELO),
    nativeOnChain(ChainId.CELO).wrapped,
    0,
    FAKE_TICK_SPACING,
    ADDRESS_ZERO,
    79228162514264337593543950336,
    0,
    0
  ),
  [ChainId.CELO_ALFAJORES]: new V4Pool(
    nativeOnChain(ChainId.CELO_ALFAJORES),
    nativeOnChain(ChainId.CELO_ALFAJORES).wrapped,
    0,
    FAKE_TICK_SPACING,
    ADDRESS_ZERO,
    79228162514264337593543950336,
    0,
    0
  ),
  [ChainId.GNOSIS]: new V4Pool(
    nativeOnChain(ChainId.GNOSIS),
    nativeOnChain(ChainId.GNOSIS).wrapped,
    0,
    FAKE_TICK_SPACING,
    ADDRESS_ZERO,
    79228162514264337593543950336,
    0,
    0
  ),
  [ChainId.MOONBEAM]: new V4Pool(
    nativeOnChain(ChainId.MOONBEAM),
    nativeOnChain(ChainId.MOONBEAM).wrapped,
    0,
    FAKE_TICK_SPACING,
    ADDRESS_ZERO,
    79228162514264337593543950336,
    0,
    0
  ),
  [ChainId.BNB]: new V4Pool(
    nativeOnChain(ChainId.BNB),
    nativeOnChain(ChainId.BNB).wrapped,
    0,
    FAKE_TICK_SPACING,
    ADDRESS_ZERO,
    79228162514264337593543950336,
    0,
    0
  ),
  [ChainId.AVALANCHE]: new V4Pool(
    nativeOnChain(ChainId.AVALANCHE),
    nativeOnChain(ChainId.AVALANCHE).wrapped,
    0,
    FAKE_TICK_SPACING,
    ADDRESS_ZERO,
    79228162514264337593543950336,
    0,
    0
  ),
  [ChainId.BASE_GOERLI]: new V4Pool(
    nativeOnChain(ChainId.BASE_GOERLI),
    nativeOnChain(ChainId.BASE_GOERLI).wrapped,
    0,
    FAKE_TICK_SPACING,
    ADDRESS_ZERO,
    79228162514264337593543950336,
    0,
    0
  ),
  [ChainId.BASE_SEPOLIA]: new V4Pool(
    nativeOnChain(ChainId.BASE_SEPOLIA),
    nativeOnChain(ChainId.BASE_SEPOLIA).wrapped,
    0,
    FAKE_TICK_SPACING,
    ADDRESS_ZERO,
    79228162514264337593543950336,
    0,
    0
  ),
  [ChainId.BASE]: new V4Pool(
    nativeOnChain(ChainId.BASE),
    nativeOnChain(ChainId.BASE).wrapped,
    0,
    FAKE_TICK_SPACING,
    ADDRESS_ZERO,
    79228162514264337593543950336,
    0,
    0
  ),
  [ChainId.ZORA]: new V4Pool(
    nativeOnChain(ChainId.ZORA),
    nativeOnChain(ChainId.ZORA).wrapped,
    0,
    FAKE_TICK_SPACING,
    ADDRESS_ZERO,
    79228162514264337593543950336,
    0,
    0
  ),
  [ChainId.ZORA_SEPOLIA]: new V4Pool(
    nativeOnChain(ChainId.ZORA_SEPOLIA),
    nativeOnChain(ChainId.ZORA_SEPOLIA).wrapped,
    0,
    FAKE_TICK_SPACING,
    ADDRESS_ZERO,
    79228162514264337593543950336,
    0,
    0
  ),
  [ChainId.ROOTSTOCK]: new V4Pool(
    nativeOnChain(ChainId.ROOTSTOCK),
    nativeOnChain(ChainId.ROOTSTOCK).wrapped,
    0,
    FAKE_TICK_SPACING,
    ADDRESS_ZERO,
    79228162514264337593543950336,
    0,
    0
  ),
  [ChainId.BLAST]: new V4Pool(
    nativeOnChain(ChainId.BLAST),
    nativeOnChain(ChainId.BLAST).wrapped,
    0,
    FAKE_TICK_SPACING,
    ADDRESS_ZERO,
    79228162514264337593543950336,
    0,
    0
  ),
  [ChainId.ZKSYNC]: new V4Pool(
    nativeOnChain(ChainId.ZKSYNC),
    nativeOnChain(ChainId.ZKSYNC).wrapped,
    0,
    FAKE_TICK_SPACING,
    ADDRESS_ZERO,
    79228162514264337593543950336,
    0,
    0
  ),
  [ChainId.WORLDCHAIN]: new V4Pool(
    nativeOnChain(ChainId.WORLDCHAIN),
    nativeOnChain(ChainId.WORLDCHAIN).wrapped,
    0,
    FAKE_TICK_SPACING,
    ADDRESS_ZERO,
    79228162514264337593543950336,
    0,
    0
  ),
  [ChainId.UNICHAIN_SEPOLIA]: new V4Pool(
    nativeOnChain(ChainId.UNICHAIN_SEPOLIA),
    nativeOnChain(ChainId.UNICHAIN_SEPOLIA).wrapped,
    0,
    FAKE_TICK_SPACING,
    ADDRESS_ZERO,
    79228162514264337593543950336,
    0,
    0
  ),
  [ChainId.UNICHAIN]: new V4Pool(
    nativeOnChain(ChainId.UNICHAIN),
    nativeOnChain(ChainId.UNICHAIN).wrapped,
    0,
    FAKE_TICK_SPACING,
    ADDRESS_ZERO,
    79228162514264337593543950336,
    0,
    0
  ),
  [ChainId.MONAD_TESTNET]: new V4Pool(
    nativeOnChain(ChainId.MONAD_TESTNET),
    nativeOnChain(ChainId.MONAD_TESTNET).wrapped,
    0,
    FAKE_TICK_SPACING,
    ADDRESS_ZERO,
    79228162514264337593543950336,
    0,
    0
  ),
  [ChainId.SONEIUM]: new V4Pool(
    nativeOnChain(ChainId.SONEIUM),
    nativeOnChain(ChainId.SONEIUM).wrapped,
    0,
    FAKE_TICK_SPACING,
    ADDRESS_ZERO,
    79228162514264337593543950336,
    0,
    0
  ),
};
