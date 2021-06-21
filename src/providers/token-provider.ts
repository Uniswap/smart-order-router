import { Token } from '@uniswap/sdk-core';
import { schema, TokenInfo, TokenList } from '@uniswap/token-lists';
import Ajv from 'ajv';
import axios from 'axios';
import Logger from 'bunyan';
import _ from 'lodash';
import NodeCache from 'node-cache';
import { IMetricLogger, MetricLoggerUnit } from '../routers/metric';
import { ChainId } from '../util/chains';

type SymbolToTokenInfo = { [index: string]: TokenInfo };
type ChainToTokenInfoList = { [chainId in ChainId]: TokenInfo[] };
type TokenInfoMapping = { [chainId in ChainId]: SymbolToTokenInfo };
const tokenListValidator = new Ajv().compile(schema);

const TOKEN_LIST_CACHE = new NodeCache({ stdTTL: 600, useClones: false });
export class TokenProvider {
  protected log: Logger;
  private chainToTokenInfos: ChainToTokenInfoList;
  private chainSymbolToTokenInfo: TokenInfoMapping;
  private tokenList: TokenList;

  constructor(tokenList: TokenList, log: Logger) {
    if (!tokenListValidator(tokenList)) {
      throw new Error('Token list failed validation.');
    }
    this.log = log;
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

  public static async fromTokenListURI(
    tokenListURI: string,
    log: Logger,
    metricLogger: IMetricLogger
  ) {
    const now = Date.now();

    const cachedTokenList = TOKEN_LIST_CACHE.get<TokenList>(tokenListURI);

    if (cachedTokenList) {
      metricLogger.putMetric(
        'TokenListLoad',
        Date.now() - now,
        MetricLoggerUnit.Milliseconds
      );

      return new TokenProvider(cachedTokenList, log);
    }

    log.info(`Getting tokenList from ${tokenListURI}.`);
    const response = await axios.get(tokenListURI);
    log.info(`Got tokenList from ${tokenListURI}.`);

    metricLogger.putMetric(
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

    return new TokenProvider(tokenList, log);
  }

  public static async fromTokenList(tokenList: TokenList, log: Logger) {
    return new TokenProvider(tokenList, log);
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
      this.log.trace(
        `Could not find ${symbol} in Token List: '${this.tokenList.name}'. Ignoring.`
      );

      return undefined;
    }

    return new Token(
      chainId,
      tokenInfo.address.toLowerCase(),
      tokenInfo.decimals,
      tokenInfo.symbol,
      tokenInfo.name
    );
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
