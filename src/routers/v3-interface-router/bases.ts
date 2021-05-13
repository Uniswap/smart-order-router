import { ChainId, Token, WETH9 } from '@uniswap/sdk-core';
import _ from 'lodash';
import { getTokenIfExists, getTokensIfExists } from '../../util/tokens';

// a list of tokens by chain
type ChainTokenList = {
  readonly [chainId in ChainId]: Token[];
};

export const BASES_TO_CHECK_TRADES_AGAINST: ChainTokenList = {
  [ChainId.MAINNET]: [
    WETH9[ChainId.MAINNET],
    ...getTokensIfExists(ChainId.MAINNET, 'DAI', 'USDC', 'USDT', 'WBTC'),
  ],
  [ChainId.ROPSTEN]: [WETH9[ChainId.ROPSTEN]],
  [ChainId.RINKEBY]: [WETH9[ChainId.RINKEBY]],
  [ChainId.GÖRLI]: [WETH9[ChainId.GÖRLI]],
  [ChainId.KOVAN]: [WETH9[ChainId.KOVAN]],
};

const getBasePairBySymbols = (
  chainId: ChainId,
  fromSymbol: string,
  ...toSymbols: string[]
): { [tokenAddress: string]: Token[] } => {
  const fromToken: Token | undefined = getTokenIfExists(chainId, fromSymbol);
  const toTokens: Token[] = _(toSymbols)
    .map((toSymbol) => getTokenIfExists(chainId, toSymbol))
    .compact()
    .value();

  if (!fromToken || _.isEmpty(toTokens)) return {};

  return {
    [fromToken.address]: toTokens,
  };
};

const getBasePairByAddress = (
  chainId: ChainId,
  fromAddress: string,
  toSymbol: string
): { [tokenAddress: string]: Token[] } => {
  const toToken: Token | undefined = getTokenIfExists(chainId, toSymbol);

  if (!toToken) return {};

  return {
    [fromAddress]: [toToken],
  };
};

export const ADDITIONAL_BASES: {
  [chainId in ChainId]?: { [tokenAddress: string]: Token[] };
} = {
  [ChainId.MAINNET]: {
    ...getBasePairByAddress(
      ChainId.MAINNET,
      '0xA948E86885e12Fb09AfEF8C52142EBDbDf73cD18',
      'UNI'
    ),
    ...getBasePairByAddress(
      ChainId.MAINNET,
      '0x561a4717537ff4AF5c687328c0f7E90a319705C0',
      'UNI'
    ),
    ...getBasePairBySymbols(ChainId.MAINNET, 'FEI', 'TRIBE'),
    ...getBasePairBySymbols(ChainId.MAINNET, 'TRIBE', 'FEI'),
    ...getBasePairBySymbols(ChainId.MAINNET, 'FRAX', 'FXS'),
    ...getBasePairBySymbols(ChainId.MAINNET, 'FXS', 'FRAX'),
    ...getBasePairBySymbols(ChainId.MAINNET, 'WBTC', 'renBTC'),
    ...getBasePairBySymbols(ChainId.MAINNET, 'renBTC', 'WBTC'),
  },
};

/**
 * Some tokens can only be swapped via certain pairs, so we override the list of bases that are considered for these
 * tokens.
 */
export const CUSTOM_BASES: {
  [chainId in ChainId]?: { [tokenAddress: string]: Token[] };
} = {
  [ChainId.MAINNET]: {
    ...getBasePairBySymbols(ChainId.MAINNET, 'AMPL', 'DAI', 'ETH'),
  },
};
