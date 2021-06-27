import { Token } from '@uniswap/sdk-core';
import { TokenInfo, TokenList } from '@uniswap/token-lists';
import axios from 'axios';
import _ from 'lodash';
import NodeCache from 'node-cache';
import { ChainId } from '../util/chains';
import { log } from '../util/log';
import { metric, MetricLoggerUnit } from '../util/metric';

type SymbolToTokenInfo = { [index: string]: TokenInfo };
type ChainToTokenInfoList = { [chainId in ChainId]: TokenInfo[] };
type TokenInfoMapping = { [chainId in ChainId]: SymbolToTokenInfo };

const TOKEN_LIST_CACHE = new NodeCache({ stdTTL: 600, useClones: false });

// Constructing a new token object is slow as sdk-core does checksumming.
const TOKEN_CACHE = new NodeCache({ stdTTL: 3600, useClones: false });
export class TokenProvider {
  private chainToTokenInfos: ChainToTokenInfoList;
  private chainSymbolToTokenInfo: TokenInfoMapping;
  private tokenList: TokenList;

  constructor(tokenList: TokenList) {
    // if (!tokenListValidator(tokenList)) {
    //   throw new Error('Token list failed validation.');
    // }
    this.tokenList = tokenList;

    this.chainToTokenInfos = _.reduce(
      this.tokenList.tokens,
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

    this.chainSymbolToTokenInfo = _.mapValues(
      this.chainToTokenInfos,
      (tokenInfos: TokenInfo[]) => _.keyBy(tokenInfos, 'symbol')
    );
  }

  public static async fromTokenListURI(tokenListURI: string) {
    const now = Date.now();

    const cachedTokenList = TOKEN_LIST_CACHE.get<TokenList>(tokenListURI);

    if (cachedTokenList) {
      metric.putMetric(
        'TokenListLoad',
        Date.now() - now,
        MetricLoggerUnit.Milliseconds
      );

      return new TokenProvider(cachedTokenList);
    }

    log.info(`Getting tokenList from ${tokenListURI}.`);
    const response = await axios.get(tokenListURI);
    log.info(`Got tokenList from ${tokenListURI}.`);

    metric.putMetric(
      'TokenListLoad',
      Date.now() - now,
      MetricLoggerUnit.Milliseconds
    );

    const { data: tokenList, status } = response;

    if (status != 200) {
      log.error(
        { response },
        `Unabled to get token list from ${tokenListURI}.`
      );

      throw new Error(`Unable to get token list from ${tokenListURI}`);
    }

    TOKEN_LIST_CACHE.set<TokenList>(tokenListURI, tokenList);

    return new TokenProvider(tokenList);
  }

  public static async fromTokenList(tokenList: TokenList) {
    const now = Date.now();

    const tokenProvider = new TokenProvider(tokenList);

    metric.putMetric(
      'TokenListLoad',
      Date.now() - now,
      MetricLoggerUnit.Milliseconds
    );

    return tokenProvider;
  }

  public getToken(chainId: ChainId, symbol: string): Token {
    const token: Token | undefined = this.getTokenIfExists(chainId, symbol);

    if (!token) {
      throw new Error(
        `Token ${symbol} not found in token list '${this.tokenList.name}'`
      );
    }

    return token;
  }

  public getTokenIfExists(
    chainId: ChainId,
    _symbol: string
  ): Token | undefined {
    let symbol = _symbol;

    // We consider ETH as a regular ERC20 Token throughout this package. We don't use the NativeCurrency object from the sdk.
    // When we build the calldata for swapping we insert wrapping/unwrapping as needed.
    if (_symbol == 'ETH') {
      symbol = 'WETH';
    }

    const tokenInfo: TokenInfo | undefined =
      this.chainSymbolToTokenInfo[chainId][symbol];

    if (!tokenInfo) {
      log.trace(
        `Could not find ${symbol} in Token List: '${this.tokenList.name}'. Ignoring.`
      );

      return undefined;
    }

    const cacheKey = `${tokenInfo.address}${tokenInfo.decimals}${tokenInfo.symbol}${tokenInfo.name}`;
    const cachedToken = TOKEN_CACHE.get<Token>(cacheKey);

    if (cachedToken) {
      return cachedToken;
    }

    const token = new Token(
      chainId,
      tokenInfo.address.toLowerCase(),
      tokenInfo.decimals,
      tokenInfo.symbol,
      tokenInfo.name
    );

    TOKEN_CACHE.set<Token>(cacheKey, token);

    return token;
  }

  public tokenExists(chainId: ChainId, symbol: string): boolean {
    return !!this.getTokenIfExists(chainId, symbol);
  }

  public getTokensIfExists(chainId: ChainId, ...symbols: string[]): Token[] {
    const tokens: Token[] = _(symbols)
      .map((symbol: string) => {
        return this.getTokenIfExists(chainId, symbol);
      })
      .compact()
      .value();

    return tokens;
  }
}
