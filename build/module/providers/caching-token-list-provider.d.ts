import { ChainId, Token } from '@uniswap/sdk-core';
import { TokenList } from '@uniswap/token-lists';
import { ICache } from './cache';
import { ITokenProvider, TokenAccessor } from './token-provider';
/**
 * Provider for getting token data from a Token List.
 *
 * @export
 * @interface ITokenListProvider
 */
export interface ITokenListProvider {
    hasTokenBySymbol(_symbol: string): Promise<boolean>;
    getTokenBySymbol(_symbol: string): Promise<Token | undefined>;
    hasTokenByAddress(address: string): Promise<boolean>;
    getTokenByAddress(address: string): Promise<Token | undefined>;
}
export declare class CachingTokenListProvider implements ITokenProvider, ITokenListProvider {
    private tokenCache;
    private CACHE_KEY;
    private chainId;
    private chainToTokenInfos;
    private chainSymbolToTokenInfo;
    private chainAddressToTokenInfo;
    private tokenList;
    private CHAIN_SYMBOL_KEY;
    private CHAIN_ADDRESS_KEY;
    /**
     * Creates an instance of CachingTokenListProvider.
     * Token metadata (e.g. symbol and decimals) generally don't change so can be cached indefinitely.
     *
     * @param chainId The chain id to use.
     * @param tokenList The token list to get the tokens from.
     * @param tokenCache Cache instance to hold cached tokens.
     */
    constructor(chainId: ChainId | number, tokenList: TokenList, tokenCache: ICache<Token>);
    static fromTokenListURI(chainId: ChainId | number, tokenListURI: string, tokenCache: ICache<Token>): Promise<CachingTokenListProvider>;
    private static buildTokenList;
    static fromTokenList(chainId: ChainId | number, tokenList: TokenList, tokenCache: ICache<Token>): Promise<CachingTokenListProvider>;
    /**
     * If no addresses array is specified, all tokens in the token list are
     * returned.
     *
     * @param _addresses (optional) The token addresses to get.
     * @returns Promise<TokenAccessor> A token accessor with methods for accessing the tokens.
     */
    getTokens(_addresses?: string[]): Promise<TokenAccessor>;
    hasTokenBySymbol(_symbol: string): Promise<boolean>;
    getTokenBySymbol(_symbol: string): Promise<Token | undefined>;
    hasTokenByAddress(address: string): Promise<boolean>;
    getTokenByAddress(address: string): Promise<Token | undefined>;
    private buildToken;
}
