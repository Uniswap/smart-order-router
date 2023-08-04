import { ChainId, Currency, Ether } from '@uniswap/sdk-core';
import {
  CEUR_CELO,
  CEUR_CELO_ALFAJORES,
  CUSD_CELO,
  DAI_MAINNET,
  DAI_ON,
  ExtendedEther,
  nativeOnChain,
  UNI_GOERLI,
  UNI_MAINNET,
  USDC_MAINNET,
  USDC_ON,
  USDT_MAINNET,
  WETH9,
  WNATIVE_ON,
} from '../../src';

export const WHALES = (token: Currency): string => {
  switch (token) {
    case Ether.onChain(ChainId.MAINNET) as Currency:
      return '0x0716a17FBAeE714f1E6aB0f9d59edbC5f09815C0';
    case ExtendedEther.onChain(ChainId.MAINNET):
      return '0x0716a17FBAeE714f1E6aB0f9d59edbC5f09815C0';
    case ExtendedEther.onChain(ChainId.ARBITRUM_ONE):
      return '0xf977814e90da44bfa03b6295a0616a897441acec';
    case nativeOnChain(ChainId.POLYGON):
      return '0xe7804c37c13166ff0b37f5ae0bb07a3aebb6e245';
    case nativeOnChain(ChainId.GOERLI):
      return '0x08505F42D5666225d5d73B842dAdB87CCA44d1AE';
    case WETH9[1]:
      return '0x06920c9fc643de77b99cb7670a944ad31eaaa260';
    case WNATIVE_ON(ChainId.MAINNET):
      return '0xf04a5cc80b1e94c69b48f5ee68a08cd2f09a7c3e';
    case WNATIVE_ON(ChainId.ARBITRUM_ONE):
      return '0x80a9ae39310abf666a87c743d6ebbd0e8c42158e';
    case WNATIVE_ON(ChainId.GOERLI):
      return '0x2372031bb0fc735722aa4009aebf66e8beaf4ba1';
    case WNATIVE_ON(ChainId.POLYGON):
      return '0x369582d2010b6ed950b571f4101e3bb9b554876f';
    case WNATIVE_ON(ChainId.BASE):
      return '0x755554f1716d2241d6af94ea1d7dbb1631af9a40';
    case USDC_MAINNET:
      return '0x8eb8a3b98659cce290402893d0123abb75e3ab28';
    case UNI_MAINNET:
    case DAI_MAINNET:
    case USDT_MAINNET:
      return '0x47ac0fb4f2d84898e4d9e7b4dab3c24507a6d503';
    case UNI_GOERLI:
      return '0x41653c7d61609d856f29355e404f310ec4142cfb';
    case USDC_ON(ChainId.OPTIMISM):
      return '0xad7b4c162707e0b2b5f6fddbd3f8538a5fba0d60';
    case USDC_ON(ChainId.OPTIMISM_GOERLI):
      return '0x4cb0645e92a3b5872ae54e5704e03c09ca0ea220';
    case USDC_ON(ChainId.ARBITRUM_ONE):
      return '0xf89d7b9c864f589bbf53a82105107622b35eaa40';
    case USDC_ON(ChainId.ARBITRUM_GOERLI):
      return '0x7e3114fcbc1d529fd96de61d65d4a03071609c56';
    case USDC_ON(ChainId.SEPOLIA):
      return '0xe2a3422f3168149AD2d11b4dE2B97b05f1ebF76e';
    case USDC_ON(ChainId.POLYGON):
      return '0xe7804c37c13166ff0b37f5ae0bb07a3aebb6e245';
    case USDC_ON(ChainId.POLYGON_MUMBAI):
      return '0x48520ff9b32d8b5bf87abf789ea7b3c394c95ebe';
    case USDC_ON(ChainId.AVALANCHE):
      return '0x9f8c163cBA728e99993ABe7495F06c0A3c8Ac8b9';
    case USDC_ON(ChainId.BASE):
      return '0x389bfa91ad0d143e8cb26c15cb52d942ee9651f7';
    case DAI_ON(ChainId.GOERLI):
      return '0x20918f71e99c09ae2ac3e33dbde33457d3be01f4';
    case DAI_ON(ChainId.SEPOLIA):
      return '0x67550Df3290415611F6C140c81Cd770Ff1742cb9';
    case DAI_ON(ChainId.OPTIMISM):
      return '0x100bdc1431a9b09c61c0efc5776814285f8fb248';
    case DAI_ON(ChainId.ARBITRUM_ONE):
      return '0x07b23ec6aedf011114d3ab6027d69b561a2f635e';
    case DAI_ON(ChainId.POLYGON):
      return '0xf04adbf75cdfc5ed26eea4bbbb991db002036bdd';
    case DAI_ON(ChainId.POLYGON_MUMBAI):
      return '0xda8ab4137fe28f969b27c780d313d1bb62c8341e';
    case DAI_ON(ChainId.AVALANCHE):
      return '0x835866d37AFB8CB8F8334dCCdaf66cf01832Ff5D';
    case CEUR_CELO:
      return '0x612A7c4E40EAcb63dADaD4939dFedb9d3397E6fd';
    case CEUR_CELO_ALFAJORES:
      return '0x489324b266DFb125CC791B91Bc68F307cE3f6691';
    case WNATIVE_ON(ChainId.CELO):
      return '0x6cC083Aed9e3ebe302A6336dBC7c921C9f03349E';
    case CUSD_CELO:
      return '0xC32cBaf3D44dA6fbC761289b871af1A30cc7f993';
    default:
      return '0xf04a5cc80b1e94c69b48f5ee68a08cd2f09a7c3e';
  }
};
