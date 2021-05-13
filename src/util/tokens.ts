import DEFAULT_TOKEN_LIST from '@uniswap/default-token-list';
import { ChainId, Token, WETH9 } from '@uniswap/sdk-core';
import { TokenInfo, TokenList } from '@uniswap/token-lists';
import _ from 'lodash';
import bunyan from 'bunyan';

const log = bunyan.createLogger({ name: 'Uniswap SOR' });

// const tokenListValidator = new Ajv().compile(schema);
// if (!tokenListValidator(DEFAULT_TOKEN_LIST)) {
//   throw new Error('Token list invalid.');
// }

const UNISWAP_DEFAULT_TOKEN_LIST = DEFAULT_TOKEN_LIST as TokenList;

type SymbolToTokenInfo = { [index: string]: TokenInfo };
type ChainToTokenInfoList = { [chainId in ChainId]: TokenInfo[] };

const chainToTokenInfos: ChainToTokenInfoList = _.reduce(
  UNISWAP_DEFAULT_TOKEN_LIST.tokens,
  (result: ChainToTokenInfoList, tokenInfo: TokenInfo) => {
    result[tokenInfo.chainId as ChainId].push(tokenInfo);
    return result;
  },
  {
    [ChainId.MAINNET]: [],
    [ChainId.KOVAN]: [],
    [ChainId.RINKEBY]: [],
    [ChainId.ROPSTEN]: [],
    [ChainId.GÖRLI]: [],
  }
);

type TokenInfoMapping = {
  [chainId in ChainId]: SymbolToTokenInfo;
};

const chainIdToSymbolToTokenInfo: TokenInfoMapping = _.mapValues(
  chainToTokenInfos,
  (tokenInfos: TokenInfo[]) => _.keyBy(tokenInfos, 'symbol')
);

export const getToken = (chainId: ChainId, symbol: string): Token => {
  const token: Token | undefined = getTokenIfExists(chainId, symbol);

  if (!token) {
    throw new Error(
      `Token ${symbol} not found in token list "${UNISWAP_DEFAULT_TOKEN_LIST.name}"`
    );
  }

  return token;
};

export const getTokenIfExists = (
  chainId: ChainId,
  symbol: string
): Token | undefined => {
  if (symbol == 'ETH') {
    return WETH9[chainId];
  }

  const tokenInfo: TokenInfo | undefined =
    chainIdToSymbolToTokenInfo[chainId][symbol];

  if (!tokenInfo) {
    log.warn(
      `Could not find ${symbol} in Token List ${UNISWAP_DEFAULT_TOKEN_LIST.name}. Ignoring.`
    );

    return undefined;
  }

  return new Token(
    chainId,
    tokenInfo.address,
    tokenInfo.decimals,
    tokenInfo.symbol,
    tokenInfo.name
  );
};

export const getTokensIfExists = (
  chainId: ChainId,
  ...symbols: string[]
): Token[] => {
  const tokens: Token[] = _(symbols)
    .map((symbol: string) => {
      if (symbol == 'ETH') {
        return WETH9[chainId];
      }

      return getTokenIfExists(chainId, symbol);
    })
    .compact()
    .value();

  return tokens;
};
