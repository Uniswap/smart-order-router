"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.TokenPropertiesProvider = exports.NEGATIVE_CACHE_ENTRY_TTL = exports.POSITIVE_CACHE_ENTRY_TTL = exports.DEFAULT_TOKEN_PROPERTIES_RESULT = void 0;
const sdk_core_1 = require("@uniswap/sdk-core");
const util_1 = require("../util");
const token_fee_fetcher_1 = require("./token-fee-fetcher");
const token_validator_provider_1 = require("./token-validator-provider");
exports.DEFAULT_TOKEN_PROPERTIES_RESULT = {
    tokenFeeResult: token_fee_fetcher_1.DEFAULT_TOKEN_FEE_RESULT,
};
exports.POSITIVE_CACHE_ENTRY_TTL = 600; // 10 minutes in seconds
exports.NEGATIVE_CACHE_ENTRY_TTL = 600; // 10 minutes in seconds
class TokenPropertiesProvider {
    constructor(chainId, tokenPropertiesCache, tokenFeeFetcher, allowList = token_validator_provider_1.DEFAULT_ALLOWLIST, positiveCacheEntryTTL = exports.POSITIVE_CACHE_ENTRY_TTL, negativeCacheEntryTTL = exports.NEGATIVE_CACHE_ENTRY_TTL) {
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
            this.chainId !== sdk_core_1.ChainId.MAINNET) {
            return tokenToResult;
        }
        const addressesToFetchFeesOnchain = [];
        const addressesRaw = this.buildAddressesRaw(tokens);
        const tokenProperties = await this.tokenPropertiesCache.batchGet(addressesRaw);
        // Check if we have cached token validation results for any tokens.
        for (const address of addressesRaw) {
            const cachedValue = tokenProperties[address];
            if (cachedValue) {
                util_1.metric.putMetric('TokenPropertiesProviderBatchGetCacheHit', 1, util_1.MetricLoggerUnit.Count);
                const tokenFee = cachedValue.tokenFeeResult;
                const tokenFeeResultExists = tokenFee && (tokenFee.buyFeeBps || tokenFee.sellFeeBps);
                if (tokenFeeResultExists) {
                    util_1.metric.putMetric(`TokenPropertiesProviderCacheHitTokenFeeResultExists${tokenFeeResultExists}`, 1, util_1.MetricLoggerUnit.Count);
                }
                else {
                    util_1.metric.putMetric(`TokenPropertiesProviderCacheHitTokenFeeResultNotExists`, 1, util_1.MetricLoggerUnit.Count);
                }
                tokenToResult[address] = cachedValue;
            }
            else if (this.allowList.has(address)) {
                tokenToResult[address] = {
                    tokenValidationResult: token_validator_provider_1.TokenValidationResult.UNKN,
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
                util_1.log.error({ err }, `Error fetching fees for tokens ${addressesToFetchFeesOnchain}`);
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
                    util_1.metric.putMetric(`TokenPropertiesProviderTokenFeeResultCacheMissExists${tokenFeeResultExists}`, 1, util_1.MetricLoggerUnit.Count);
                    const tokenPropertiesResult = {
                        tokenFeeResult: tokenFee,
                        tokenValidationResult: token_validator_provider_1.TokenValidationResult.FOT,
                    };
                    tokenToResult[address] = tokenPropertiesResult;
                    util_1.metric.putMetric('TokenPropertiesProviderBatchGetCacheMiss', 1, util_1.MetricLoggerUnit.Count);
                    // update cache concurrently
                    // at this point, we are confident that the tokens are FOT, so we can hardcode the validation result
                    return this.tokenPropertiesCache.set(this.CACHE_KEY(this.chainId, address), tokenPropertiesResult, this.positiveCacheEntryTTL);
                }
                else {
                    util_1.metric.putMetric(`TokenPropertiesProviderTokenFeeResultCacheMissNotExists`, 1, util_1.MetricLoggerUnit.Count);
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
exports.TokenPropertiesProvider = TokenPropertiesProvider;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidG9rZW4tcHJvcGVydGllcy1wcm92aWRlci5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbIi4uLy4uLy4uL3NyYy9wcm92aWRlcnMvdG9rZW4tcHJvcGVydGllcy1wcm92aWRlci50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiOzs7QUFDQSxnREFBbUQ7QUFFbkQsa0NBQXdEO0FBSXhELDJEQUs2QjtBQUM3Qix5RUFHb0M7QUFFdkIsUUFBQSwrQkFBK0IsR0FBMEI7SUFDcEUsY0FBYyxFQUFFLDRDQUF3QjtDQUN6QyxDQUFDO0FBQ1csUUFBQSx3QkFBd0IsR0FBRyxHQUFHLENBQUMsQ0FBQyx3QkFBd0I7QUFDeEQsUUFBQSx3QkFBd0IsR0FBRyxHQUFHLENBQUMsQ0FBQyx3QkFBd0I7QUFnQnJFLE1BQWEsdUJBQXVCO0lBSWxDLFlBQ1UsT0FBZ0IsRUFDaEIsb0JBQW1ELEVBQ25ELGVBQWlDLEVBQ2pDLFlBQVksNENBQWlCLEVBQzdCLHdCQUF3QixnQ0FBd0IsRUFDaEQsd0JBQXdCLGdDQUF3QjtRQUxoRCxZQUFPLEdBQVAsT0FBTyxDQUFTO1FBQ2hCLHlCQUFvQixHQUFwQixvQkFBb0IsQ0FBK0I7UUFDbkQsb0JBQWUsR0FBZixlQUFlLENBQWtCO1FBQ2pDLGNBQVMsR0FBVCxTQUFTLENBQW9CO1FBQzdCLDBCQUFxQixHQUFyQixxQkFBcUIsQ0FBMkI7UUFDaEQsMEJBQXFCLEdBQXJCLHFCQUFxQixDQUEyQjtRQVRsRCxjQUFTLEdBQUcsQ0FBQyxPQUFnQixFQUFFLE9BQWUsRUFBRSxFQUFFLENBQ3hELG9CQUFvQixPQUFPLElBQUksT0FBTyxFQUFFLENBQUM7SUFTeEMsQ0FBQztJQUVHLEtBQUssQ0FBQyxtQkFBbUIsQ0FDOUIsTUFBZSxFQUNmLGNBQStCO1FBRS9CLE1BQU0sYUFBYSxHQUF1QixFQUFFLENBQUM7UUFFN0MsSUFDRSxDQUFDLENBQUEsY0FBYyxhQUFkLGNBQWMsdUJBQWQsY0FBYyxDQUFFLDhCQUE4QixDQUFBO1lBQy9DLElBQUks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