import { computePoolAddress, Pool } from '@uniswap/v3-sdk';
import retry from 'async-retry';
import _ from 'lodash';
import { IUniswapV3PoolState__factory } from '../../types/v3/factories/IUniswapV3PoolState__factory';
import { V3_CORE_FACTORY_ADDRESSES } from '../../util/addresses';
import { log } from '../../util/log';
import { poolToString } from '../../util/routes';
export class V3PoolProvider {
    /**
     * Creates an instance of V3PoolProvider.
     * @param chainId The chain id to use.
     * @param multicall2Provider The multicall provider to use to get the pools.
     * @param retryOptions The retry options for each call to the multicall.
     */
    constructor(chainId, multicall2Provider, retryOptions = {
        retries: 2,
        minTimeout: 50,
        maxTimeout: 500,
    }) {
        this.chainId = chainId;
        this.multicall2Provider = multicall2Provider;
        this.retryOptions = retryOptions;
        // Computing pool addresses is slow as it requires hashing, encoding etc.
        // Addresses never change so can always be cached.
        this.POOL_ADDRESS_CACHE = {};
    }
    async getPools(tokenPairs, providerConfig) {
        const poolAddressSet = new Set();
        const sortedTokenPairs = [];
        const sortedPoolAddresses = [];
        for (const tokenPair of tokenPairs) {
            const [tokenA, tokenB, feeAmount] = tokenPair;
            const { poolAddress, token0, token1 } = this.getPoolAddress(tokenA, tokenB, feeAmount);
            if (poolAddressSet.has(poolAddress)) {
                continue;
            }
            poolAddressSet.add(poolAddress);
            sortedTokenPairs.push([token0, token1, feeAmount]);
            sortedPoolAddresses.push(poolAddress);
        }
        log.debug(`getPools called with ${tokenPairs.length} token pairs. Deduped down to ${poolAddressSet.size}`);
        const [slot0Results, liquidityResults] = await Promise.all([
            this.getPoolsData(sortedPoolAddresses, 'slot0', providerConfig),
            this.getPoolsData(sortedPoolAddresses, 'liquidity', providerConfig),
        ]);
        log.info(`Got liquidity and slot0s for ${poolAddressSet.size} pools ${(providerConfig === null || providerConfig === void 0 ? void 0 : providerConfig.blockNumber)
            ? `as of block: ${providerConfig === null || providerConfig === void 0 ? void 0 : providerConfig.blockNumber}.`
            : ``}`);
        const poolAddressToPool = {};
        const invalidPools = [];
        for (let i = 0; i < sortedPoolAddresses.length; i++) {
            const slot0Result = slot0Results[i];
            const liquidityResult = liquidityResults[i];
            // These properties tell us if a pool is valid and initialized or not.
            if (!(slot0Result === null || slot0Result === void 0 ? void 0 : slot0Result.success) ||
                !(liquidityResult === null || liquidityResult === void 0 ? void 0 : liquidityResult.success) ||
                slot0Result.result.sqrtPriceX96.eq(0)) {
                const [token0, token1, fee] = sortedTokenPairs[i];
                invalidPools.push([token0, token1, fee]);
                continue;
            }
            const [token0, token1, fee] = sortedTokenPairs[i];
            const slot0 = slot0Result.result;
            const liquidity = liquidityResult.result[0];
            const pool = new Pool(token0, token1, fee, slot0.sqrtPriceX96.toString(), liquidity.toString(), slot0.tick);
            const poolAddress = sortedPoolAddresses[i];
            poolAddressToPool[poolAddress] = pool;
        }
        if (invalidPools.length > 0) {
            log.info({
                invalidPools: _.map(invalidPools, ([token0, token1, fee]) => `${token0.symbol}/${token1.symbol}/${fee / 10000}%`),
            }, `${invalidPools.length} pools invalid after checking their slot0 and liquidity results. Dropping.`);
        }
        const poolStrs = _.map(Object.values(poolAddressToPool), poolToString);
        log.debug({ poolStrs }, `Found ${poolStrs.length} valid pools`);
        return {
            getPool: (tokenA, tokenB, feeAmount) => {
                const { poolAddress } = this.getPoolAddress(tokenA, tokenB, feeAmount);
                return poolAddressToPool[poolAddress];
            },
            getPoolByAddress: (address) => poolAddressToPool[address],
            getAllPools: () => Object.values(poolAddressToPool),
        };
    }
    getPoolAddress(tokenA, tokenB, feeAmount) {
        const [token0, token1] = tokenA.sortsBefore(tokenB)
            ? [tokenA, tokenB]
            : [tokenB, tokenA];
        const cacheKey = `${this.chainId}/${token0.address}/${token1.address}/${feeAmount}`;
        const cachedAddress = this.POOL_ADDRESS_CACHE[cacheKey];
        if (cachedAddress) {
            return { poolAddress: cachedAddress, token0, token1 };
        }
        const poolAddress = computePoolAddress({
            factoryAddress: V3_CORE_FACTORY_ADDRESSES[this.chainId],
            tokenA: token0,
            tokenB: token1,
            fee: feeAmount,
        });
        this.POOL_ADDRESS_CACHE[cacheKey] = poolAddress;
        return { poolAddress, token0, token1 };
    }
    async getPoolsData(poolAddresses, functionName, providerConfig) {
        const { results, blockNumber } = await retry(async () => {
            return this.multicall2Provider.callSameFunctionOnMultipleContracts({
                addresses: poolAddresses,
                contractInterface: IUniswapV3PoolState__factory.createInterface(),
                functionName: functionName,
                providerConfig,
            });
        }, this.retryOptions);
        log.debug(`Pool data fetched as of block ${blockNumber}`);
        return results;
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicG9vbC1wcm92aWRlci5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbIi4uLy4uLy4uLy4uL3NyYy9wcm92aWRlcnMvdjMvcG9vbC1wcm92aWRlci50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFFQSxPQUFPLEVBQUUsa0JBQWtCLEVBQWEsSUFBSSxFQUFFLE1BQU0saUJBQWlCLENBQUM7QUFDdEUsT0FBTyxLQUFrQyxNQUFNLGFBQWEsQ0FBQztBQUM3RCxPQUFPLENBQUMsTUFBTSxRQUFRLENBQUM7QUFFdkIsT0FBTyxFQUFFLDRCQUE0QixFQUFFLE1BQU0sdURBQXVELENBQUM7QUFDckcsT0FBTyxFQUFFLHlCQUF5QixFQUFFLE1BQU0sc0JBQXNCLENBQUM7QUFDakUsT0FBTyxFQUFFLEdBQUcsRUFBRSxNQUFNLGdCQUFnQixDQUFDO0FBQ3JDLE9BQU8sRUFBRSxZQUFZLEVBQUUsTUFBTSxtQkFBbUIsQ0FBQztBQThEakQsTUFBTSxPQUFPLGNBQWM7SUFLekI7Ozs7O09BS0c7SUFDSCxZQUNZLE9BQWdCLEVBQ2hCLGtCQUFzQyxFQUN0QyxlQUFtQztRQUMzQyxPQUFPLEVBQUUsQ0FBQztRQUNWLFVBQVUsRUFBRSxFQUFFO1FBQ2QsVUFBVSxFQUFFLEdBQUc7S0FDaEI7UUFOUyxZQUFPLEdBQVAsT0FBTyxDQUFTO1FBQ2hCLHVCQUFrQixHQUFsQixrQkFBa0IsQ0FBb0I7UUFDdEMsaUJBQVksR0FBWixZQUFZLENBSXJCO1FBakJILHlFQUF5RTtRQUN6RSxrREFBa0Q7UUFDMUMsdUJBQWtCLEdBQThCLEVBQUUsQ0FBQztJQWdCeEQsQ0FBQztJQUVHLEtBQUssQ0FBQyxRQUFRLENBQ25CLFVBQXVDLEVBQ3ZDLGNBQStCO1FBRS9CLE1BQU0sY0FBYyxHQUFnQixJQUFJLEdBQUcsRUFBVSxDQUFDO1FBQ3RELE1BQU0sZ0JBQWdCLEdBQXFDLEVBQUUsQ0FBQztRQUM5RCxNQUFNLG1CQUFtQixHQUFhLEVBQUUsQ0FBQztRQUV6QyxLQUFLLE1BQU0sU0FB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