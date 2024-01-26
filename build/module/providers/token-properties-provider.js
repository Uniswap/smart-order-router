import { ChainId } from '@uniswap/sdk-core';
import { log, metric, MetricLoggerUnit } from '../util';
import { DEFAULT_TOKEN_FEE_RESULT, } from './token-fee-fetcher';
import { DEFAULT_ALLOWLIST, TokenValidationResult, } from './token-validator-provider';
export const DEFAULT_TOKEN_PROPERTIES_RESULT = {
    tokenFeeResult: DEFAULT_TOKEN_FEE_RESULT,
};
export const POSITIVE_CACHE_ENTRY_TTL = 600; // 10 minutes in seconds
export const NEGATIVE_CACHE_ENTRY_TTL = 600; // 10 minutes in seconds
export class TokenPropertiesProvider {
    constructor(chainId, tokenPropertiesCache, tokenFeeFetcher, allowList = DEFAULT_ALLOWLIST, positiveCacheEntryTTL = POSITIVE_CACHE_ENTRY_TTL, negativeCacheEntryTTL = NEGATIVE_CACHE_ENTRY_TTL) {
        this.chainId = chainId;
        this.tokenPropertiesCache = tokenPropertiesCache;
        this.tokenFeeFetcher = tokenFeeFetcher;
        this.allowList = allowList;
        this.positiveCacheEntryTTL = positiveCacheEntryTTL;
        this.negativeCacheEntryTTL = negativeCacheEntryTTL;
        this.CACHE_KEY = (chainId, address) => `token-properties-${chainId}-${address}`;
    }
    async getTokensProperties(tokens, providerConfig) {
        const tokenToResult = {};
        if (!(providerConfig === null || providerConfig === void 0 ? void 0 : providerConfig.enableFeeOnTransferFeeFetching) ||
            this.chainId !== ChainId.MAINNET) {
            return tokenToResult;
        }
        const addressesToFetchFeesOnchain = [];
        const addressesRaw = this.buildAddressesRaw(tokens);
        const tokenProperties = await this.tokenPropertiesCache.batchGet(addressesRaw);
        // Check if we have cached token validation results for any tokens.
        for (const address of addressesRaw) {
            const cachedValue = tokenProperties[address];
            if (cachedValue) {
                metric.putMetric('TokenPropertiesProviderBatchGetCacheHit', 1, MetricLoggerUnit.Count);
                const tokenFee = cachedValue.tokenFeeResult;
                const tokenFeeResultExists = tokenFee && (tokenFee.buyFeeBps || tokenFee.sellFeeBps);
                if (tokenFeeResultExists) {
                    metric.putMetric(`TokenPropertiesProviderCacheHitTokenFeeResultExists${tokenFeeResultExists}`, 1, MetricLoggerUnit.Count);
                }
                else {
                    metric.putMetric(`TokenPropertiesProviderCacheHitTokenFeeResultNotExists`, 1, MetricLoggerUnit.Count);
                }
                tokenToResult[address] = cachedValue;
            }
            else if (this.allowList.has(address)) {
                tokenToResult[address] = {
                    tokenValidationResult: TokenValidationResult.UNKN,
                };
            }
            else {
                addressesToFetchFeesOnchain.push(address);
            }
        }
        if (addressesToFetchFeesOnchain.length > 0) {
            let tokenFeeMap = {};
            try {
                tokenFeeMap = await this.tokenFeeFetcher.fetchFees(addressesToFetchFeesOnchain, providerConfig);
            }
            catch (err) {
                log.error({ err }, `Error fetching fees for tokens ${addressesToFetchFeesOnchain}`);
            }
            await Promise.all(addressesToFetchFeesOnchain.map((address) => {
                const tokenFee = tokenFeeMap[address];
                const tokenFeeResultExists = tokenFee && (tokenFee.buyFeeBps || tokenFee.sellFeeBps);
                if (tokenFeeResultExists) {
                    // we will leverage the metric to log the token fee result, if it exists
                    // the idea is that the token fee should not differ by too much across tokens,
                    // so that we can accurately log the token fee for a particular quote request (without breaching metrics dimensionality limit)
                    // in the form of metrics.
                    // if we log as logging, given prod traffic volume, the logging volume will be high.
                    metric.putMetric(`TokenPropertiesProviderTokenFeeResultCacheMissExists${tokenFeeResultExists}`, 1, MetricLoggerUnit.Count);
                    const tokenPropertiesResult = {
                        tokenFeeResult: tokenFee,
                        tokenValidationResult: TokenValidationResult.FOT,
                    };
                    tokenToResult[address] = tokenPropertiesResult;
                    metric.putMetric('TokenPropertiesProviderBatchGetCacheMiss', 1, MetricLoggerUnit.Count);
                    // update cache concurrently
                    // at this point, we are confident that the tokens are FOT, so we can hardcode the validation result
                    return this.tokenPropertiesCache.set(this.CACHE_KEY(this.chainId, address), tokenPropertiesResult, this.positiveCacheEntryTTL);
                }
                else {
                    metric.putMetric(`TokenPropertiesProviderTokenFeeResultCacheMissNotExists`, 1, MetricLoggerUnit.Count);
                    const tokenPropertiesResult = {
                        tokenFeeResult: undefined,
                        tokenValidationResult: undefined,
                    };
                    tokenToResult[address] = tokenPropertiesResult;
                    return this.tokenPropertiesCache.set(this.CACHE_KEY(this.chainId, address), tokenPropertiesResult, this.negativeCacheEntryTTL);
                }
            }));
        }
        return tokenToResult;
    }
    buildAddressesRaw(tokens) {
        const addressesRaw = new Set();
        for (const token of tokens) {
            const address = token.address.toLowerCase();
            if (!addressesRaw.has(address)) {
                addressesRaw.add(address);
            }
        }
        return addressesRaw;
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidG9rZW4tcHJvcGVydGllcy1wcm92aWRlci5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbIi4uLy4uLy4uL3NyYy9wcm92aWRlcnMvdG9rZW4tcHJvcGVydGllcy1wcm92aWRlci50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFDQSxPQUFPLEVBQUUsT0FBTyxFQUFTLE1BQU0sbUJBQW1CLENBQUM7QUFFbkQsT0FBTyxFQUFFLEdBQUcsRUFBRSxNQUFNLEVBQUUsZ0JBQWdCLEVBQUUsTUFBTSxTQUFTLENBQUM7QUFJeEQsT0FBTyxFQUNMLHdCQUF3QixHQUl6QixNQUFNLHFCQUFxQixDQUFDO0FBQzdCLE9BQU8sRUFDTCxpQkFBaUIsRUFDakIscUJBQXFCLEdBQ3RCLE1BQU0sNEJBQTRCLENBQUM7QUFFcEMsTUFBTSxDQUFDLE1BQU0sK0JBQStCLEdBQTBCO0lBQ3BFLGNBQWMsRUFBRSx3QkFBd0I7Q0FDekMsQ0FBQztBQUNGLE1BQU0sQ0FBQyxNQUFNLHdCQUF3QixHQUFHLEdBQUcsQ0FBQyxDQUFDLHdCQUF3QjtBQUNyRSxNQUFNLENBQUMsTUFBTSx3QkFBd0IsR0FBRyxHQUFHLENBQUMsQ0FBQyx3QkFBd0I7QUFnQnJFLE1BQU0sT0FBTyx1QkFBdUI7SUFJbEMsWUFDVSxPQUFnQixFQUNoQixvQkFBbUQsRUFDbkQsZUFBaUMsRUFDakMsWUFBWSxpQkFBaUIsRUFDN0Isd0JBQXdCLHdCQUF3QixFQUNoRCx3QkFBd0Isd0JBQXdCO1FBTGhELFlBQU8sR0FBUCxPQUFPLENBQVM7UUFDaEIseUJBQW9CLEdBQXBCLG9CQUFvQixDQUErQjtRQUNuRCxvQkFBZSxHQUFmLGVBQWUsQ0FBa0I7UUFDakMsY0FBUyxHQUFULFNBQVMsQ0FBb0I7UUFDN0IsMEJBQXFCLEdBQXJCLHFCQUFxQixDQUEyQjtRQUNoRCwwQkFBcUIsR0FBckIscUJBQXFCLENBQTJCO1FBVGxELGNBQVMsR0FBRyxDQUFDLE9BQWdCLEVBQUUsT0FBZSxFQUFFLEVBQUUsQ0FDeEQsb0JB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