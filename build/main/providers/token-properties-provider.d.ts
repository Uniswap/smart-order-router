import { ChainId, Token } from '@uniswap/sdk-core';
import { ICache } from './cache';
import { ProviderConfig } from './provider';
import { ITokenFeeFetcher, TokenFeeResult } from './token-fee-fetcher';
import { TokenValidationResult } from './token-validator-provider';
export declare const DEFAULT_TOKEN_PROPERTIES_RESULT: TokenPropertiesResult;
export declare const POSITIVE_CACHE_ENTRY_TTL = 600;
export declare const NEGATIVE_CACHE_ENTRY_TTL = 600;
type Address = string;
export type TokenPropertiesResult = {
    tokenFeeResult?: TokenFeeResult;
    tokenValidationResult?: TokenValidationResult;
};
export type TokenPropertiesMap = Record<Address, TokenPropertiesResult>;
export interface ITokenPropertiesProvider {
    getTokensProperties(tokens: Token[], providerConfig?: ProviderConfig): Promise<TokenPropertiesMap>;
}
export declare class TokenPropertiesProvider implements ITokenPropertiesProvider {
    private chainId;
    private tokenPropertiesCache;
    private tokenFeeFetcher;
    private allowList;
    private positiveCacheEntryTTL;
    private negativeCacheEntryTTL;
    private CACHE_KEY;
    constructor(chainId: ChainId, tokenPropertiesCache: ICache<TokenPropertiesResult>, tokenFeeFetcher: ITokenFeeFetcher, allowList?: Set<string>, positiveCacheEntryTTL?: number, negativeCacheEntryTTL?: number);
    getTokensProperties(tokens: Token[], providerConfig?: ProviderConfig): Promise<TokenPropertiesMap>;
    private buildAddressesRaw;
}
export {};
