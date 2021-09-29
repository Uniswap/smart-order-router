import { Token } from '@uniswap/sdk-core';
import { TokenInfo, TokenList } from '@uniswap/token-lists';
import axios from 'axios';
import _ from 'lodash';
import { ChainId } from '../util/chains';
import { log } from '../util/log';
import { metric, MetricLoggerUnit } from '../util/metric';
import { ICache } from './cache';
import { ITokenProvider, TokenAccessor } from './token-provider';

type StringToTokenInfo = { [index: string]: TokenInfo };
type ChainToTokenInfoList = { [chainId in ChainId]: TokenInfo[] };
type TokenInfoMapping = { [chainId in ChainId]: StringToTokenInfo };

export interface ITokenListProvider {
  getTokenBySymbol(_symbol: string): Promise<Token | undefined>;
  getTokenByAddress(address: string): Promise<Token | undefined>;
}

export class CachingTokenListProvider implements ITokenProvider, ITokenListProvider {
  private CACHE_KEY = (tokenInfo: TokenInfo) => `token-list-token-${this.chainId}/${this.tokenList.name}/${this.tokenList.timestamp}/${
    this.tokenList.version
  }/${tokenInfo.address.toLowerCase()}/${tokenInfo.decimals}/${
    tokenInfo.symbol
  }/${tokenInfo.name}`;

  private chainId: ChainId;
  private chainToTokenInfos: ChainToTokenInfoList;
  private chainSymbolToTokenInfo: TokenInfoMapping;
  private chainAddressToTokenInfo: TokenInfoMapping;
  private tokenList: TokenList;

  // Token metadata (e.g. symbol and decimals) don't change so can be cached indefinitely.
  // Constructing a new token object is slow as sdk-core does checksumming.
  constructor(chainId: ChainId, tokenList: TokenList, private tokenCache: ICache<Token>) {
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

  public static async fromTokenListURI(
    chainId: ChainId, 
    tokenListURI: string, 
    tokenCache: ICache<Token>,
  ) {
    const now = Date.now();
    const tokenList = await this.buildTokenList(tokenListURI);

    metric.putMetric(
      'TokenListLoad',
      Date.now() - now,
      MetricLoggerUnit.Milliseconds
    );

    return new CachingTokenListProvider(chainId, tokenList, tokenCache);
  }

  private static async buildTokenList(
    tokenListURI: string, 
  ): Promise<TokenList> {
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

    return tokenList;
  }

  public static async fromTokenList(
    chainId: ChainId, 
    tokenList: TokenList, 
    tokenCache: ICache<Token>,
  ) {
    const now = Date.now();

    const tokenProvider = new CachingTokenListProvider(chainId, tokenList, tokenCache);

    metric.putMetric(
      'TokenListLoad',
      Date.now() - now,
      MetricLoggerUnit.Milliseconds
    );

    return tokenProvider;
  }

  public async getTokens(_addresses: string[]): Promise<TokenAccessor> {
    const addressToToken: { [address: string]: Token } = {};
    const symbolToToken: { [symbol: string]: Token } = {};

    for (const address of _addresses) {
      const token = await this.getTokenByAddress(address);
      if (!token) {
        continue;
      }
      addressToToken[address.toLowerCase()] = token;

      if (!token.symbol) {
        continue;
      }
      symbolToToken[token.symbol.toLowerCase()] = token;
    }
    
    return {
      getTokenByAddress: (address: string) => addressToToken[address.toLowerCase()],
      getTokenBySymbol: (symbol: string) => symbolToToken[symbol.toLowerCase()],
      getAllTokens: (): Token[] => {
        return Object.values(addressToToken);
      },
    };
  }

  public async getTokenBySymbol(_symbol: string): Promise<Token | undefined> {
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

    const token: Token = await this.buildToken(tokenInfo);

    return token;
  }

  public async getTokenByAddress(address: string): Promise<Token | undefined> {
    const tokenInfo: TokenInfo | undefined =
      this.chainAddressToTokenInfo[this.chainId][address.toLowerCase()];

    if (!tokenInfo) {
      return undefined;
    }

    const token: Token = await this.buildToken(tokenInfo);

    return token;
  }

  private async buildToken(tokenInfo: TokenInfo): Promise<Token> {
    const cacheKey = this.CACHE_KEY(tokenInfo);
    const cachedToken = await this.tokenCache.get(cacheKey);

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

    await this.tokenCache.set(cacheKey, token);

    return token;
  }
}
