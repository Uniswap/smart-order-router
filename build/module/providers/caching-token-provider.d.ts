import { ChainId, Token } from '@uniswap/sdk-core';
import { ICache } from './cache';
import { ITokenProvider, TokenAccessor } from './token-provider';
export declare const CACHE_SEED_TOKENS: {
    [chainId in ChainId]?: {
        [symbol: string]: Token;
    };
};
/**
 * Provider for getting token metadata that falls back to a different provider
 * in the event of failure.
 *
 * @export
 * @class CachingTokenProviderWithFallback
 */
export declare class CachingTokenProviderWithFallback implements ITokenProvider {
    protected chainId: ChainId;
    private tokenCache;
    protected primaryTokenProvider: ITokenProvider;
    protected fallbackTokenProvider?: ITokenProvider | undefined;
    private CACHE_KEY;
    constructor(chainId: ChainId, tokenCache: ICache<Token>, primaryTokenProvider: ITokenProvider, fallbackTokenProvider?: ITokenProvider | undefined);
    getTokens(_addresses: string[]): Promise<TokenAccessor>;
}
