import { ChainId, Token, WETH9 } from '@uniswap/sdk-core';
import { TokenInfo, TokenList, schema } from '@uniswap/token-lists';
import _ from 'lodash';
import Logger from 'bunyan';
import Ajv from 'ajv';
import axios from 'axios';

type SymbolToTokenInfo = { [index: string]: TokenInfo };
type ChainToTokenInfoList = { [chainId in ChainId]: TokenInfo[] };
type TokenInfoMapping = { [chainId in ChainId]: SymbolToTokenInfo };

export class TokenProvider {
  private log: Logger;
  private chainToTokenInfos: ChainToTokenInfoList;
  private chainSymbolToTokenInfo: TokenInfoMapping;
  private tokenList: TokenList;

  constructor(tokenList: TokenList, log: Logger) {
    const tokenListValidator = new Ajv().compile(schema);
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

  public static async fromTokenListUrl(tokenListUrl: string, log: Logger) {
    const response = await axios.get(tokenListUrl);
    const { data: tokenList, status } = response;

    if (status != 200) {
      log.error(
        { response },
        `Unabled to get token list from ${tokenListUrl}.`
      );

      throw new Error(`Unable to get token list from ${tokenListUrl}`);
    }

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

  public getTokenIfExists(chainId: ChainId, symbol: string): Token | undefined {
    if (symbol == 'ETH') {
      return WETH9[chainId];
    }

    const tokenInfo: TokenInfo | undefined = this.chainSymbolToTokenInfo[
      chainId
    ][symbol];

    if (!tokenInfo) {
      this.log.warn(
        `Could not find ${symbol} in Token List: '${this.tokenList.name}'. Ignoring.`
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
