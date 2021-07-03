import { Token } from '@uniswap/sdk-core';
import { TokenInfo, TokenList } from '@uniswap/token-lists';
import axios from 'axios';
import _ from 'lodash';
import NodeCache from 'node-cache';
import { ChainId } from '../util/chains';
import { log } from '../util/log';
import { metric, MetricLoggerUnit } from '../util/metric';

type StringToTokenInfo = { [index: string]: TokenInfo };
type ChainToTokenInfoList = { [chainId in ChainId]: TokenInfo[] };
type TokenInfoMapping = { [chainId in ChainId]: StringToTokenInfo };

const TOKEN_LIST_CACHE = new NodeCache({ stdTTL: 600, useClones: false });

// Constructing a new token object is slow as sdk-core does checksumming.
const TOKEN_CACHE = new NodeCache({ stdTTL: 3600, useClones: false });

export interface ITokenListProvider {
  getTokenBySymbol(chainId: ChainId, symbol: string): Token;
  getTokenByAddress(chainId: ChainId, address: string): Token;
  getTokenBySymbolIfExists(
    chainId: ChainId,
    _symbol: string
  ): Token | undefined;
  getTokenByAddressIfExists(
    chainId: ChainId,
    address: string
  ): Token | undefined;
  tokenExistsBySymbol(chainId: ChainId, symbol: string): boolean;
  tokenExistsByAddress(chainId: ChainId, symbol: string): boolean;
  tokenBlockedBySymbol(chainId: ChainId, symbol: string): boolean;
  tokenBlockedByAddress(chainId: ChainId, symbol: string): boolean;
  getTokensBySymbolIfExists(chainId: ChainId, ...symbols: string[]): Token[];
  getTokensByAddressIfExists(chainId: ChainId, ...addresses: string[]): Token[];
}

export class TokenListProvider implements ITokenListProvider {
  private chainToTokenInfos: ChainToTokenInfoList;
  private chainSymbolToTokenInfo: TokenInfoMapping;
  private chainAddressToTokenInfo: TokenInfoMapping;
  private chainToBlockedTokenInfos: ChainToTokenInfoList;
  private chainSymbolToBlockedTokenInfo: TokenInfoMapping;
  private chainAddressToBlockedTokenInfo: TokenInfoMapping;
  private tokenList: TokenList;
  private blockTokenList?: TokenList;

  constructor(tokenList: TokenList, blockTokenList?: TokenList) {
    // if (!tokenListValidator(tokenList)) {
    //   throw new Error('Token list failed validation.');
    // }
    this.tokenList = tokenList;
    this.blockTokenList = blockTokenList;

    this.chainToBlockedTokenInfos = _.reduce(
      this.blockTokenList?.tokens ?? [],
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

    this.chainSymbolToBlockedTokenInfo = _.mapValues(
      this.chainToBlockedTokenInfos,
      (tokenInfos: TokenInfo[]) => _.keyBy(tokenInfos, 'symbol')
    );

    this.chainAddressToBlockedTokenInfo = _.mapValues(
      this.chainToBlockedTokenInfos,
      (tokenInfos: TokenInfo[]) =>
        _.keyBy(tokenInfos, (tokenInfo) => tokenInfo.address.toLowerCase())
    );

    this.chainToTokenInfos = _.reduce(
      this.tokenList.tokens,
      (result: ChainToTokenInfoList, tokenInfo: TokenInfo) => {
        // Filter out tokens on the blocklist.
        if (
          this.chainAddressToBlockedTokenInfo[tokenInfo.chainId as ChainId][
            tokenInfo.address.toLowerCase()
          ]
        ) {
          log.info(
            `Dropping ${tokenInfo.symbol} ${tokenInfo.address} from tokenList ${this.tokenList.name} as it is on blocklist ${this.blockTokenList?.name}`
          );
        } else {
          result[tokenInfo.chainId as ChainId].push(tokenInfo);
        }

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
    tokenListURI: string,
    blockTokenListURI?: string
  ) {
    const now = Date.now();

    const uris = _.compact([tokenListURI, blockTokenListURI]);

    const [tokenList, blockTokenList] = await Promise.all(
      _.map(uris, (uri) => this.buildTokenList(uri))
    );

    metric.putMetric(
      'TokenListLoad',
      Date.now() - now,
      MetricLoggerUnit.Milliseconds
    );

    return new TokenListProvider(tokenList!, blockTokenList);
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

  public static async fromTokenList(
    tokenList: TokenList,
    blockTokenList?: TokenList
  ) {
    const now = Date.now();

    const tokenProvider = new TokenListProvider(tokenList, blockTokenList);

    metric.putMetric(
      'TokenListLoad',
      Date.now() - now,
      MetricLoggerUnit.Milliseconds
    );

    return tokenProvider;
  }

  public getTokenBySymbol(chainId: ChainId, symbol: string): Token {
    const token: Token | undefined = this.getTokenBySymbolIfExists(
      chainId,
      symbol
    );

    if (!token) {
      throw new Error(
        `Token ${symbol} not found in token list '${this.tokenList.name}'`
      );
    }

    return token;
  }

  public getTokenByAddress(chainId: ChainId, address: string): Token {
    const token: Token | undefined = this.getTokenByAddressIfExists(
      chainId,
      address
    );

    if (!token) {
      throw new Error(
        `Token ${address} not found in token list '${this.tokenList.name}'`
      );
    }

    return token;
  }

  public getTokenBySymbolIfExists(
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
      log.info(
        `Could not find ${symbol} in Token List: '${this.tokenList.name}'. Ignoring.`
      );

      return undefined;
    }

    const token: Token = this.buildToken(chainId, tokenInfo);

    return token;
  }

  public getTokenByAddressIfExists(
    chainId: ChainId,
    address: string
  ): Token | undefined {
    const tokenInfo: TokenInfo | undefined =
      this.chainAddressToTokenInfo[chainId][address.toLowerCase()];

    if (!tokenInfo) {
      log.info(
        `Could not find ${address} in Token List: '${this.tokenList.name}'. Ignoring.`
      );

      return undefined;
    }

    const token: Token = this.buildToken(chainId, tokenInfo);

    return token;
  }

  public getTokensBySymbolIfExists(
    chainId: ChainId,
    ...symbols: string[]
  ): Token[] {
    const tokens: Token[] = _(symbols)
      .map((symbol: string) => {
        return this.getTokenBySymbolIfExists(chainId, symbol);
      })
      .compact()
      .value();

    return tokens;
  }

  public getTokensByAddressIfExists(
    chainId: ChainId,
    ...addresses: string[]
  ): Token[] {
    const tokens: Token[] = _(addresses)
      .map((symbol: string) => {
        return this.getTokenByAddressIfExists(chainId, symbol);
      })
      .compact()
      .value();

    return tokens;
  }

  public tokenExistsBySymbol(chainId: ChainId, symbol: string): boolean {
    return !!this.getTokenBySymbolIfExists(chainId, symbol);
  }

  public tokenExistsByAddress(chainId: ChainId, address: string): boolean {
    return !!this.getTokenByAddressIfExists(chainId, address);
  }

  public tokenBlockedBySymbol(chainId: ChainId, symbol: string): boolean {
    return !!this.chainSymbolToBlockedTokenInfo[chainId][symbol];
  }

  public tokenBlockedByAddress(chainId: ChainId, address: string): boolean {
    return !!this.chainAddressToBlockedTokenInfo[chainId][
      address.toLowerCase()
    ];
  }

  private buildToken(chainId: ChainId, tokenInfo: TokenInfo): Token {
    const cacheKey = `${this.tokenList.name}/${this.tokenList.timestamp}/${
      this.tokenList.version
    }/${tokenInfo.address.toLowerCase()}/${tokenInfo.decimals}/${
      tokenInfo.symbol
    }/${tokenInfo.name}`;
    const cachedToken = TOKEN_CACHE.get<Token>(cacheKey);

    if (cachedToken) {
      return cachedToken;
    }

    const token = new Token(
      chainId,
      tokenInfo.address,
      tokenInfo.decimals,
      tokenInfo.symbol,
      tokenInfo.name
    );

    TOKEN_CACHE.set<Token>(cacheKey, token);

    return token;
  }
}
