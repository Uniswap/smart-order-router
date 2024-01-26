/* eslint-disable @typescript-eslint/no-non-null-assertion */
import { Token } from '@uniswap/sdk-core';
import axios from 'axios';
import { log } from '../util/log';
import { metric, MetricLoggerUnit } from '../util/metric';
export class CachingTokenListProvider {
    /**
     * Creates an instance of CachingTokenListProvider.
     * Token metadata (e.g. symbol and decimals) generally don't change so can be cached indefinitely.
     *
     * @param chainId The chain id to use.
     * @param tokenList The token list to get the tokens from.
     * @param tokenCache Cache instance to hold cached tokens.
     */
    constructor(chainId, tokenList, tokenCache) {
        this.tokenCache = tokenCache;
        this.CACHE_KEY = (tokenInfo) => `token-list-token-${this.chainId}/${this.tokenList.name}/${this.tokenList.timestamp}/${this.tokenList.version}/${tokenInfo.address.toLowerCase()}/${tokenInfo.decimals}/${tokenInfo.symbol}/${tokenInfo.name}`;
        this.CHAIN_SYMBOL_KEY = (chainId, symbol) => `${chainId.toString()}/${symbol}`;
        this.CHAIN_ADDRESS_KEY = (chainId, address) => `${chainId.toString()}/${address.toLowerCase()}`;
        this.chainId = chainId;
        this.tokenList = tokenList;
        this.chainToTokenInfos = new Map();
        this.chainSymbolToTokenInfo = new Map();
        this.chainAddressToTokenInfo = new Map();
        for (const tokenInfo of this.tokenList.tokens) {
            const chainId = tokenInfo.chainId;
            const chainIdString = chainId.toString();
            const symbol = tokenInfo.symbol;
            const address = tokenInfo.address.toLowerCase();
            if (!this.chainToTokenInfos.has(chainIdString)) {
                this.chainToTokenInfos.set(chainIdString, []);
            }
            this.chainToTokenInfos.get(chainIdString).push(tokenInfo);
            this.chainSymbolToTokenInfo.set(this.CHAIN_SYMBOL_KEY(chainId, symbol), tokenInfo);
            this.chainAddressToTokenInfo.set(this.CHAIN_ADDRESS_KEY(chainId, address), tokenInfo);
        }
    }
    static async fromTokenListURI(chainId, tokenListURI, tokenCache) {
        const now = Date.now();
        const tokenList = await this.buildTokenList(tokenListURI);
        metric.putMetric('TokenListLoad', Date.now() - now, MetricLoggerUnit.Milliseconds);
        return new CachingTokenListProvider(chainId, tokenList, tokenCache);
    }
    static async buildTokenList(tokenListURI) {
        log.info(`Getting tokenList from ${tokenListURI}.`);
        const response = await axios.get(tokenListURI);
        log.info(`Got tokenList from ${tokenListURI}.`);
        const { data: tokenList, status } = response;
        if (status != 200) {
            log.error({ response }, `Unabled to get token list from ${tokenListURI}.`);
            throw new Error(`Unable to get token list from ${tokenListURI}`);
        }
        return tokenList;
    }
    static async fromTokenList(chainId, tokenList, tokenCache) {
        const now = Date.now();
        const tokenProvider = new CachingTokenListProvider(chainId, tokenList, tokenCache);
        metric.putMetric('TokenListLoad', Date.now() - now, MetricLoggerUnit.Milliseconds);
        return tokenProvider;
    }
    /**
     * If no addresses array is specified, all tokens in the token list are
     * returned.
     *
     * @param _addresses (optional) The token addresses to get.
     * @returns Promise<TokenAccessor> A token accessor with methods for accessing the tokens.
     */
    async getTokens(_addresses) {
        var _a;
        const addressToToken = new Map();
        const symbolToToken = new Map();
        const addToken = (token) => {
            if (!token)
                return;
            addressToToken.set(token.address.toLowerCase(), token);
            if (token.symbol !== undefined) {
                symbolToToken.set(token.symbol.toLowerCase(), token);
            }
        };
        if (_addresses) {
            for (const address of _addresses) {
                const token = await this.getTokenByAddress(address);
                addToken(token);
            }
        }
        else {
            const chainTokens = (_a = this.chainToTokenInfos.get(this.chainId.toString())) !== null && _a !== void 0 ? _a : [];
            for (const info of chainTokens) {
                const token = await this.buildToken(info);
                addToken(token);
            }
        }
        return {
            getTokenByAddress: (address) => addressToToken.get(address.toLowerCase()),
            getTokenBySymbol: (symbol) => symbolToToken.get(symbol.toLowerCase()),
            getAllTokens: () => {
                return Array.from(addressToToken.values());
            },
        };
    }
    async hasTokenBySymbol(_symbol) {
        return this.chainSymbolToTokenInfo.has(this.CHAIN_SYMBOL_KEY(this.chainId, _symbol));
    }
    async getTokenBySymbol(_symbol) {
        let symbol = _symbol;
        // We consider ETH as a regular ERC20 Token throughout this package. We don't use the NativeCurrency object from the sdk.
        // When we build the calldata for swapping we insert wrapping/unwrapping as needed.
        if (_symbol == 'ETH') {
            symbol = 'WETH';
        }
        const tokenInfo = this.chainSymbolToTokenInfo.get(this.CHAIN_SYMBOL_KEY(this.chainId, symbol));
        if (!tokenInfo) {
            return undefined;
        }
        const token = await this.buildToken(tokenInfo);
        return token;
    }
    async hasTokenByAddress(address) {
        return this.chainAddressToTokenInfo.has(this.CHAIN_ADDRESS_KEY(this.chainId, address));
    }
    async getTokenByAddress(address) {
        const tokenInfo = this.chainAddressToTokenInfo.get(this.CHAIN_ADDRESS_KEY(this.chainId, address));
        if (!tokenInfo) {
            return undefined;
        }
        const token = await this.buildToken(tokenInfo);
        return token;
    }
    async buildToken(tokenInfo) {
        const cacheKey = this.CACHE_KEY(tokenInfo);
        const cachedToken = await this.tokenCache.get(cacheKey);
        if (cachedToken) {
            return cachedToken;
        }
        const token = new Token(this.chainId, tokenInfo.address, tokenInfo.decimals, tokenInfo.symbol, tokenInfo.name);
        await this.tokenCache.set(cacheKey, token);
        return token;
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY2FjaGluZy10b2tlbi1saXN0LXByb3ZpZGVyLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiLi4vLi4vLi4vc3JjL3Byb3ZpZGVycy9jYWNoaW5nLXRva2VuLWxpc3QtcHJvdmlkZXIudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUEsNkRBQTZEO0FBQzdELE9BQU8sRUFBVyxLQUFLLEVBQUUsTUFBTSxtQkFBbUIsQ0FBQztBQUVuRCxPQUFPLEtBQUssTUFBTSxPQUFPLENBQUM7QUFFMUIsT0FBTyxFQUFFLEdBQUcsRUFBRSxNQUFNLGFBQWEsQ0FBQztBQUNsQyxPQUFPLEVBQUUsTUFBTSxFQUFFLGdCQUFnQixFQUFFLE1BQU0sZ0JBQWdCLENBQUM7QUFxQjFELE1BQU0sT0FBTyx3QkFBd0I7SUFxQm5DOzs7Ozs7O09BT0c7SUFDSCxZQUNFLE9BQXlCLEVBQ3pCLFNBQW9CLEVBQ1osVUFBeUI7UUFBekIsZUFBVSxHQUFWLFVBQVUsQ0FBZTtRQTdCM0IsY0FBUyxHQUFHLENBQUMsU0FBb0IsRUFBRSxFQUFFLENBQzNDLG9CQUFvQixJQUFJLENBQUMsT0FBTyxJQUFJLElBQUksQ0FBQyxTQUFTLENBQUMsSUFBSSxJQUNyRCxJQUFJLENBQUMsU0FBUyxDQUFDLFNBQ2pCLElBQUksSUFBSSxDQUFDLFNBQVMsQ0FBQyxPQUFPLElBQUksU0FBUyxDQUFDLE9BQU8sQ0FBQyxXQUFXLEVBQUUsSUFDM0QsU0FBUyxDQUFDLFFBQ1osSUFBSSxTQUFTLENBQUMsTUFBTSxJQUFJLFNBQVMsQ0FBQyxJQUFJLEVBQUUsQ0FBQztRQVFuQyxxQkFBZ0IsR0FBRyxDQUFDLE9BQWdCLEVBQUUsTUFBYyxFQUFFLEVBQUUsQ0FDOUQsR0FBRyxPQUFPLENBQUMsUUFBUSxFQUFFLElBQUksTUFBTSxFQUFFLENBQUM7UUFDNUIsc0JBQWlCLEdBQUcsQ0FBQyxPQUFnQixFQUFFLE9BQWUsRUFBRSxFQUFFLENBQ2hFLEdBQUcsT0FBTyxDQUFDLFFBQVEsRUFBRSxJQUFJLE9B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