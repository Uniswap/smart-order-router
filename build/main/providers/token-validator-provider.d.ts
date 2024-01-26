import { ChainId, Token } from '@uniswap/sdk-core';
import { ICache } from './cache';
import { IMulticallProvider } from './multicall-provider';
import { ProviderConfig } from './provider';
export declare const DEFAULT_ALLOWLIST: Set<string>;
export declare enum TokenValidationResult {
    UNKN = 0,
    FOT = 1,
    STF = 2
}
export interface TokenValidationResults {
    getValidationByToken(token: Token): TokenValidationResult | undefined;
}
/**
 * Provider for getting token data.
 *
 * @export
 * @interface ITokenValidatorProvider
 */
export interface ITokenValidatorProvider {
    /**
     * Gets the token at each address. Any addresses that are not valid ERC-20 are ignored.
     *
     * @param addresses The token addresses to get.
     * @param [providerConfig] The provider config.
     * @returns A token accessor with methods for accessing the tokens.
     */
    validateTokens(tokens: Token[], providerConfig?: ProviderConfig): Promise<TokenValidationResults>;
}
export declare class TokenValidatorProvider implements ITokenValidatorProvider {
    protected chainId: ChainId;
    protected multicall2Provider: IMulticallProvider;
    private tokenValidationCache;
    private tokenValidatorAddress;
    private gasLimitPerCall;
    private amountToFlashBorrow;
    private allowList;
    private CACHE_KEY;
    private BASES;
    constructor(chainId: ChainId, multicall2Provider: IMulticallProvider, tokenValidationCache: ICache<TokenValidationResult>, tokenValidatorAddress?: string, gasLimitPerCall?: number, amountToFlashBorrow?: string, allowList?: Set<string>);
    validateTokens(tokens: Token[], providerConfig?: ProviderConfig): Promise<TokenValidationResults>;
}
