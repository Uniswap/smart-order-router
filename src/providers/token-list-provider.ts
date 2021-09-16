import { Token } from '@uniswap/sdk-core';
import { TokenInfo, TokenList } from '@uniswap/token-lists';
import axios from 'axios';
import _ from 'lodash';
import NodeCache from 'node-cache';
import { ChainId } from '../util/chains';
import { log } from '../util/log';
import { metric, MetricLoggerUnit } from '../util/metric';
import { ITokenProvider, TokenAccessor } from './token-provider';

type StringToTokenInfo = { [index: string]: TokenInfo };
type ChainToTokenInfoList = { [chainId in ChainId]: TokenInfo[] };
type TokenInfoMapping = { [chainId in ChainId]: StringToTokenInfo };

const TOKEN_LIST_CACHE = new NodeCache({ stdTTL: 600, useClones: false });

// Constructing a new token object is slow as sdk-core does checksumming.
const TOKEN_CACHE = new NodeCache({ stdTTL: 3600, useClones: false });

export interface ITokenListProvider {
  getTokenBySymbol(_symbol: string): Token | undefined;
  getTokenByAddress(address: string): Token | undefined;
}

export class TokenListProvider implements ITokenProvider, ITokenListProvider {
  private chainId: ChainId;
  private chainToTokenInfos: ChainToTokenInfoList;
  private chainSymbolToTokenInfo: TokenInfoMapping;
  private chainAddressToTokenInfo: TokenInfoMapping;
  private tokenList: TokenList;

  constructor(chainId: ChainId, tokenList: TokenList) {
    this.chainId = chainId;
    this.tokenList = tokenList;

    this.chainToTokenInfos = _.reduce(
      this.tokenList.tokens,
      (result: ChainToTokenInfoList, tokenInfo: TokenInfo) => {
        // Filter out tokens on the blocklist.
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

    this.chainAddressToTokenInfo = _.mapValues(
      this.chainToTokenInfos,
      (tokenInfos: TokenInfo[]) =>
        _.keyBy(tokenInfos, (tokenInfo) => tokenInfo.address.toLowerCase())
    );
  }

  public static async fromTokenListURI(chainId: ChainId, tokenListURI: string) {
    const now = Date.now();
    const tokenList = await this.buildTokenList(tokenListURI);

    metric.putMetric(
      'TokenListLoad',
      Date.now() - now,
      MetricLoggerUnit.Milliseconds
    );

    return new TokenListProvider(chainId, tokenList);
  }

  private static async buildTokenList(
    tokenListURI: string
  ): Promise<TokenList> {
    const cachedTokenList = TOKEN_LIST_CACHE.get<TokenList>(tokenListURI);

    if (cachedTokenList) {
      log.info(`Found token list for ${tokenListURI} in local cache`);
      return cachedTokenList;
    }

    log.info(`Getting tokenList from ${tokenListURI}.`);
    const response = await axios.get(tokenListURI);
    log.info(`Got tokenList from ${tokenListURI}.`);

    const { data: tokenList, status } = response;

    if (status != 200) {
      log.error(
        { response },
        `Unabled to get token list from ${tokenListURI}.`
      );

      throw new Error(`Unable to get token list from ${tokenListURI}`);
    }

    TOKEN_LIST_CACHE.set<TokenList>(tokenListURI, tokenList);

    return tokenList;
  }

  public static async fromTokenList(chainId: ChainId, tokenList: TokenList) {
    const now = Date.now();

    const tokenProvider = new TokenListProvider(chainId, tokenList);

    metric.putMetric(
      'TokenListLoad',
      Date.now() - now,
      MetricLoggerUnit.Milliseconds
    );

    return tokenProvider;
  }

  public async getTokens(_addresses: string[]): Promise<TokenAccessor> {
    return {
      getTokenByAddress: (address: string) => this.getTokenByAddress(address),
      getTokenBySymbol: (symbol: string) => this.getTokenBySymbol(symbol),
      getAllTokens: (): Token[] => {
        const tokenInfos = Object.values(this.chainSymbolToTokenInfo[this.chainId]);
        return _.map(tokenInfos, this.buildToken);
      },
    };
  }

  public getTokenBySymbol(_symbol: string): Token | undefined {
    let symbol = _symbol;

    // We consider ETH as a regular ERC20 Token throughout this package. We don't use the NativeCurrency object from the sdk.
    // When we build the calldata for swapping we insert wrapping/unwrapping as needed.
    if (_symbol == 'ETH') {
      symbol = 'WETH';
    }

    const tokenInfo: TokenInfo | undefined =
      this.chainSymbolToTokenInfo[this.chainId][symbol];

    if (!tokenInfo) {
      return undefined;
    }

    const token: Token = this.buildToken(tokenInfo);

    return token;
  }

  public getTokenByAddress(address: string): Token | undefined {
    const tokenInfo: TokenInfo | undefined =
      this.chainAddressToTokenInfo[this.chainId][address.toLowerCase()];

    if (!tokenInfo) {
      return undefined;
    }

    const token: Token = this.buildToken(tokenInfo);

    return token;
  }

  private buildToken(tokenInfo: TokenInfo): Token {
    const cacheKey = `${this.chainId}/${this.tokenList.name}/${this.tokenList.timestamp}/${
      this.tokenList.version
    }/${tokenInfo.address.toLowerCase()}/${tokenInfo.decimals}/${
      tokenInfo.symbol
    }/${tokenInfo.name}`;
    const cachedToken = TOKEN_CACHE.get<Token>(cacheKey);

    if (cachedToken) {
      return cachedToken;
    }

    const token = new Token(
      this.chainId,
      tokenInfo.address,
      tokenInfo.decimals,
      tokenInfo.symbol,
      tokenInfo.name
    );

    TOKEN_CACHE.set<Token>(cacheKey, token);

    return token;
  }
}
