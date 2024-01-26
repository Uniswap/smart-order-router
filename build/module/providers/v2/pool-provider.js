import { Token } from '@uniswap/sdk-core';
import { Pair } from '@uniswap/v2-sdk';
import retry from 'async-retry';
import _ from 'lodash';
import { IUniswapV2Pair__factory } from '../../types/v2/factories/IUniswapV2Pair__factory';
import { CurrencyAmount, ID_TO_NETWORK_NAME, metric, MetricLoggerUnit, } from '../../util';
import { log } from '../../util/log';
import { poolToString } from '../../util/routes';
import { TokenValidationResult } from '../token-validator-provider';
export class V2PoolProvider {
    /**
     * Creates an instance of V2PoolProvider.
     * @param chainId The chain id to use.
     * @param multicall2Provider The multicall provider to use to get the pools.
     * @param tokenPropertiesProvider The token properties provider to use to get token properties.
     * @param retryOptions The retry options for each call to the multicall.
     */
    constructor(chainId, multicall2Provider, tokenPropertiesProvider, retryOptions = {
        retries: 2,
        minTimeout: 50,
        maxTimeout: 500,
    }) {
        this.chainId = chainId;
        this.multicall2Provider = multicall2Provider;
        this.tokenPropertiesProvider = tokenPropertiesProvider;
        this.retryOptions = retryOptions;
        // Computing pool addresses is slow as it requires hashing, encoding etc.
        // Addresses never change so can always be cached.
        this.POOL_ADDRESS_CACHE = {};
    }
    async getPools(tokenPairs, providerConfig) {
        var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k;
        const poolAddressSet = new Set();
        const sortedTokenPairs = [];
        const sortedPoolAddresses = [];
        for (const tokenPair of tokenPairs) {
            const [tokenA, tokenB] = tokenPair;
            const { poolAddress, token0, token1 } = this.getPoolAddress(tokenA, tokenB);
            if (poolAddressSet.has(poolAddress)) {
                continue;
            }
            poolAddressSet.add(poolAddress);
            sortedTokenPairs.push([token0, token1]);
            sortedPoolAddresses.push(poolAddress);
        }
        log.debug(`getPools called with ${tokenPairs.length} token pairs. Deduped down to ${poolAddressSet.size}`);
        metric.putMetric('V2_RPC_POOL_RPC_CALL', 1, MetricLoggerUnit.None);
        metric.putMetric('V2GetReservesBatchSize', sortedPoolAddresses.length, MetricLoggerUnit.Count);
        metric.putMetric(`V2GetReservesBatchSize_${ID_TO_NETWORK_NAME(this.chainId)}`, sortedPoolAddresses.length, MetricLoggerUnit.Count);
        const [reservesResults, tokenPropertiesMap] = await Promise.all([
            this.getPoolsData(sortedPoolAddresses, 'getReserves', providerConfig),
            this.tokenPropertiesProvider.getTokensProperties(this.flatten(tokenPairs), providerConfig),
        ]);
        log.info(`Got reserves for ${poolAddressSet.size} pools ${(providerConfig === null || providerConfig === void 0 ? void 0 : providerConfig.blockNumber)
            ? `as of block: ${await (providerConfig === null || providerConfig === void 0 ? void 0 : providerConfig.blockNumber)}.`
            : ``}`);
        const poolAddressToPool = {};
        const invalidPools = [];
        for (let i = 0; i < sortedPoolAddresses.length; i++) {
            const reservesResult = reservesResults[i];
            if (!(reservesResult === null || reservesResult === void 0 ? void 0 : reservesResult.success)) {
                const [token0, token1] = sortedTokenPairs[i];
                invalidPools.push([token0, token1]);
                continue;
            }
            let [token0, token1] = sortedTokenPairs[i];
            if (((_a = tokenPropertiesMap[token0.address.toLowerCase()]) === null || _a === void 0 ? void 0 : _a.tokenValidationResult) === TokenValidationResult.FOT) {
                token0 = new Token(token0.chainId, token0.address, token0.decimals, token0.symbol, token0.name, true, // at this point we know it's valid token address
                (_c = (_b = tokenPropertiesMap[token0.address.toLowerCase()]) === null || _b === void 0 ? void 0 : _b.tokenFeeResult) === null || _c === void 0 ? void 0 : _c.buyFeeBps, (_e = (_d = tokenPropertiesMap[token0.address.toLowerCase()]) === null || _d === void 0 ? void 0 : _d.tokenFeeResult) === null || _e === void 0 ? void 0 : _e.sellFeeBps);
            }
            if (((_f = tokenPropertiesMap[token1.address.toLowerCase()]) === null || _f === void 0 ? void 0 : _f.tokenValidationResult) === TokenValidationResult.FOT) {
                token1 = new Token(token1.chainId, token1.address, token1.decimals, token1.symbol, token1.name, true, // at this point we know it's valid token address
                (_h = (_g = tokenPropertiesMap[token1.address.toLowerCase()]) === null || _g === void 0 ? void 0 : _g.tokenFeeResult) === null || _h === void 0 ? void 0 : _h.buyFeeBps, (_k = (_j = tokenPropertiesMap[token1.address.toLowerCase()]) === null || _j === void 0 ? void 0 : _j.tokenFeeResult) === null || _k === void 0 ? void 0 : _k.sellFeeBps);
            }
            const { reserve0, reserve1 } = reservesResult.result;
            const pool = new Pair(CurrencyAmount.fromRawAmount(token0, reserve0.toString()), CurrencyAmount.fromRawAmount(token1, reserve1.toString()));
            const poolAddress = sortedPoolAddresses[i];
            poolAddressToPool[poolAddress] = pool;
        }
        if (invalidPools.length > 0) {
            log.info({
                invalidPools: _.map(invalidPools, ([token0, token1]) => `${token0.symbol}/${token1.symbol}`),
            }, `${invalidPools.length} pools invalid after checking their slot0 and liquidity results. Dropping.`);
        }
        const poolStrs = _.map(Object.values(poolAddressToPool), poolToString);
        log.debug({ poolStrs }, `Found ${poolStrs.length} valid pools`);
        return {
            getPool: (tokenA, tokenB) => {
                const { poolAddress } = this.getPoolAddress(tokenA, tokenB);
                return poolAddressToPool[poolAddress];
            },
            getPoolByAddress: (address) => poolAddressToPool[address],
            getAllPools: () => Object.values(poolAddressToPool),
        };
    }
    getPoolAddress(tokenA, tokenB) {
        const [token0, token1] = tokenA.sortsBefore(tokenB)
            ? [tokenA, tokenB]
            : [tokenB, tokenA];
        const cacheKey = `${this.chainId}/${token0.address}/${token1.address}`;
        const cachedAddress = this.POOL_ADDRESS_CACHE[cacheKey];
        if (cachedAddress) {
            return { poolAddress: cachedAddress, token0, token1 };
        }
        const poolAddress = Pair.getAddress(token0, token1);
        this.POOL_ADDRESS_CACHE[cacheKey] = poolAddress;
        return { poolAddress, token0, token1 };
    }
    async getPoolsData(poolAddresses, functionName, providerConfig) {
        const { results, blockNumber } = await retry(async () => {
            return this.multicall2Provider.callSameFunctionOnMultipleContracts({
                addresses: poolAddresses,
                contractInterface: IUniswapV2Pair__factory.createInterface(),
                functionName: functionName,
                providerConfig,
            });
        }, this.retryOptions);
        log.debug(`Pool data fetched as of block ${blockNumber}`);
        return results;
    }
    // We are using ES2017. ES2019 has native flatMap support
    flatten(tokenPairs) {
        const tokens = new Array();
        for (const [tokenA, tokenB] of tokenPairs) {
            tokens.push(tokenA);
            tokens.push(tokenB);
        }
        return tokens;
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicG9vbC1wcm92aWRlci5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbIi4uLy4uLy4uLy4uL3NyYy9wcm92aWRlcnMvdjIvcG9vbC1wcm92aWRlci50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFDQSxPQUFPLEVBQVcsS0FBSyxFQUFFLE1BQU0sbUJBQW1CLENBQUM7QUFDbkQsT0FBTyxFQUFFLElBQUksRUFBRSxNQUFNLGlCQUFpQixDQUFDO0FBQ3ZDLE9BQU8sS0FBa0MsTUFBTSxhQUFhLENBQUM7QUFDN0QsT0FBTyxDQUFDLE1BQU0sUUFBUSxDQUFDO0FBRXZCLE9BQU8sRUFBRSx1QkFBdUIsRUFBRSxNQUFNLGtEQUFrRCxDQUFDO0FBQzNGLE9BQU8sRUFDTCxjQUFjLEVBQ2Qsa0JBQWtCLEVBQ2xCLE1BQU0sRUFDTixnQkFBZ0IsR0FDakIsTUFBTSxZQUFZLENBQUM7QUFDcEIsT0FBTyxFQUFFLEdBQUcsRUFBRSxNQUFNLGdCQUFnQixDQUFDO0FBQ3JDLE9BQU8sRUFBRSxZQUFZLEVBQUUsTUFBTSxtQkFBbUIsQ0FBQztBQUlqRCxPQUFPLEVBQUUscUJBQXFCLEVBQUUsTUFBTSw2QkFBNkIsQ0FBQztBQWdEcEUsTUFBTSxPQUFPLGNBQWM7SUFLekI7Ozs7OztPQU1HO0lBQ0gsWUFDWSxPQUFnQixFQUNoQixrQkFBc0MsRUFDdEMsdUJBQWlELEVBQ2pELGVBQW1DO1FBQzNDLE9BQU8sRUFBRSxDQUFDO1FBQ1YsVUFBVSxFQUFFLEVBQUU7UUFDZCxVQUFVLEVBQUUsR0FBRztLQUNoQjtRQVBTLFlBQU8sR0FBUCxPQUFPLENBQVM7UUFDaEIsdUJBQWtCLEdBQWxCLGtCQUFrQixDQUFvQjtRQUN0Qyw0QkFBdUIsR0FBdkIsdUJBQXVCLENBQTBCO1FBQ2pELGlCQUFZLEdBQVosWUFBWSxDQUlyQjtRQW5CSCx5RUFBeUU7UUFDekUsa0RBQWtEO1FBQzFDLHVCQUFrQixHQUE4QixFQUFFLENBQUM7SUFrQnhELENBQUM7SUFFRyxLQUFLLENBQUMsUUFB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