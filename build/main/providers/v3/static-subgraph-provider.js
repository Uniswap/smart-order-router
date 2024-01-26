"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.StaticV3SubgraphProvider = void 0;
/* eslint-disable @typescript-eslint/no-non-null-assertion */
const sdk_core_1 = require("@uniswap/sdk-core");
const v3_sdk_1 = require("@uniswap/v3-sdk");
const jsbi_1 = __importDefault(require("jsbi"));
const lodash_1 = __importDefault(require("lodash"));
const amounts_1 = require("../../util/amounts");
const chains_1 = require("../../util/chains");
const log_1 = require("../../util/log");
const token_provider_1 = require("../token-provider");
const BASES_TO_CHECK_TRADES_AGAINST = {
    [sdk_core_1.ChainId.MAINNET]: [
        chains_1.WRAPPED_NATIVE_CURRENCY[sdk_core_1.ChainId.MAINNET],
        token_provider_1.DAI_MAINNET,
        token_provider_1.USDC_MAINNET,
        token_provider_1.USDT_MAINNET,
        token_provider_1.WBTC_MAINNET,
    ],
    [sdk_core_1.ChainId.GOERLI]: [
        chains_1.WRAPPED_NATIVE_CURRENCY[sdk_core_1.ChainId.GOERLI],
        token_provider_1.USDT_GOERLI,
        token_provider_1.USDC_GOERLI,
        token_provider_1.WBTC_GOERLI,
        token_provider_1.DAI_GOERLI,
    ],
    [sdk_core_1.ChainId.SEPOLIA]: [chains_1.WRAPPED_NATIVE_CURRENCY[sdk_core_1.ChainId.SEPOLIA], token_provider_1.USDC_SEPOLIA],
    [sdk_core_1.ChainId.OPTIMISM]: [
        chains_1.WRAPPED_NATIVE_CURRENCY[sdk_core_1.ChainId.OPTIMISM],
        token_provider_1.USDC_OPTIMISM,
        token_provider_1.DAI_OPTIMISM,
        token_provider_1.USDT_OPTIMISM,
        token_provider_1.WBTC_OPTIMISM,
        token_provider_1.OP_OPTIMISM,
    ],
    [sdk_core_1.ChainId.ARBITRUM_ONE]: [
        chains_1.WRAPPED_NATIVE_CURRENCY[sdk_core_1.ChainId.ARBITRUM_ONE],
        token_provider_1.WBTC_ARBITRUM,
        token_provider_1.DAI_ARBITRUM,
        token_provider_1.USDC_ARBITRUM,
        token_provider_1.USDT_ARBITRUM,
        token_provider_1.ARB_ARBITRUM,
    ],
    [sdk_core_1.ChainId.ARBITRUM_GOERLI]: [
        chains_1.WRAPPED_NATIVE_CURRENCY[sdk_core_1.ChainId.ARBITRUM_GOERLI],
        token_provider_1.USDC_ARBITRUM_GOERLI,
    ],
    [sdk_core_1.ChainId.OPTIMISM_GOERLI]: [
        chains_1.WRAPPED_NATIVE_CURRENCY[sdk_core_1.ChainId.OPTIMISM_GOERLI],
        token_provider_1.USDC_OPTIMISM_GOERLI,
        token_provider_1.DAI_OPTIMISM_GOERLI,
        token_provider_1.USDT_OPTIMISM_GOERLI,
        token_provider_1.WBTC_OPTIMISM_GOERLI,
    ],
    [sdk_core_1.ChainId.POLYGON]: [token_provider_1.USDC_POLYGON, token_provider_1.WETH_POLYGON, token_provider_1.WMATIC_POLYGON],
    [sdk_core_1.ChainId.POLYGON_MUMBAI]: [
        token_provider_1.DAI_POLYGON_MUMBAI,
        chains_1.WRAPPED_NATIVE_CURRENCY[sdk_core_1.ChainId.POLYGON_MUMBAI],
        token_provider_1.WMATIC_POLYGON_MUMBAI,
    ],
    [sdk_core_1.ChainId.CELO]: [token_provider_1.CELO, token_provider_1.CUSD_CELO, token_provider_1.CEUR_CELO, token_provider_1.DAI_CELO],
    [sdk_core_1.ChainId.CELO_ALFAJORES]: [
        token_provider_1.CELO_ALFAJORES,
        token_provider_1.CUSD_CELO_ALFAJORES,
        token_provider_1.CEUR_CELO_ALFAJORES,
        token_provider_1.DAI_CELO_ALFAJORES,
    ],
    [sdk_core_1.ChainId.GNOSIS]: [
        chains_1.WRAPPED_NATIVE_CURRENCY[sdk_core_1.ChainId.GNOSIS],
        token_provider_1.WBTC_GNOSIS,
        token_provider_1.WXDAI_GNOSIS,
        token_provider_1.USDC_ETHEREUM_GNOSIS,
    ],
    [sdk_core_1.ChainId.BNB]: [
        chains_1.WRAPPED_NATIVE_CURRENCY[sdk_core_1.ChainId.BNB],
        token_provider_1.BUSD_BNB,
        token_provider_1.DAI_BNB,
        token_provider_1.USDC_BNB,
        token_provider_1.USDT_BNB,
        token_provider_1.BTC_BNB,
        token_provider_1.ETH_BNB,
    ],
    [sdk_core_1.ChainId.AVALANCHE]: [
        chains_1.WRAPPED_NATIVE_CURRENCY[sdk_core_1.ChainId.AVALANCHE],
        token_provider_1.USDC_AVAX,
        token_provider_1.DAI_AVAX,
    ],
    [sdk_core_1.ChainId.MOONBEAM]: [
        chains_1.WRAPPED_NATIVE_CURRENCY[sdk_core_1.ChainId.MOONBEAM],
        token_provider_1.DAI_MOONBEAM,
        token_provider_1.USDC_MOONBEAM,
        token_provider_1.WBTC_MOONBEAM,
    ],
    [sdk_core_1.ChainId.BASE_GOERLI]: [chains_1.WRAPPED_NATIVE_CURRENCY[sdk_core_1.ChainId.BASE_GOERLI]],
    [sdk_core_1.ChainId.BASE]: [chains_1.WRAPPED_NATIVE_CURRENCY[sdk_core_1.ChainId.BASE], token_provider_1.USDC_BASE],
    [sdk_core_1.ChainId.OPTIMISM_SEPOLIA]: [
        chains_1.WRAPPED_NATIVE_CURRENCY[sdk_core_1.ChainId.OPTIMISM_SEPOLIA],
    ],
    [sdk_core_1.ChainId.ARBITRUM_SEPOLIA]: [
        chains_1.WRAPPED_NATIVE_CURRENCY[sdk_core_1.ChainId.ARBITRUM_SEPOLIA],
    ],
    [sdk_core_1.ChainId.UNREAL]: [chains_1.WRAPPED_NATIVE_CURRENCY[sdk_core_1.ChainId.UNREAL]],
};
/**
 * Provider that uses a hardcoded list of V3 pools to generate a list of subgraph pools.
 *
 * Since the pools are hardcoded and the data does not come from the Subgraph, the TVL values
 * are dummys and should not be depended on.
 *
 * Useful for instances where other data sources are unavailable. E.g. Subgraph not available.
 *
 * @export
 * @class StaticV3SubgraphProvider
 */
class StaticV3SubgraphProvider {
    constructor(chainId, poolProvider) {
        this.chainId = chainId;
        this.poolProvider = poolProvider;
    }
    async getPools(tokenIn, tokenOut, providerConfig) {
        log_1.log.info('In static subgraph provider for V3');
        const bases = BASES_TO_CHECK_TRADES_AGAINST[this.chainId];
        const basePairs = lodash_1.default.flatMap(bases, (base) => bases.map((otherBase) => [base, otherBase]));
        if (tokenIn && tokenOut) {
            basePairs.push([tokenIn, tokenOut], ...bases.map((base) => [tokenIn, base]), ...bases.map((base) => [tokenOut, base]));
        }
        const pairs = (0, lodash_1.default)(basePairs)
            .filter((tokens) => Boolean(tokens[0] && tokens[1]))
            .filter(([tokenA, tokenB]) => tokenA.address !== tokenB.address && !tokenA.equals(tokenB))
            .flatMap(([tokenA, tokenB]) => {
            return [
                [tokenA, tokenB, v3_sdk_1.FeeAmount.LOWEST],
                [tokenA, tokenB, v3_sdk_1.FeeAmount.LOW],
                [tokenA, tokenB, v3_sdk_1.FeeAmount.STABLE],
                [tokenA, tokenB, v3_sdk_1.FeeAmount.MEDIUM],
                [tokenA, tokenB, v3_sdk_1.FeeAmount.HIGH],
            ];
        })
            .value();
        log_1.log.info(`V3 Static subgraph provider about to get ${pairs.length} pools on-chain`);
        const poolAccessor = await this.poolProvider.getPools(pairs, providerConfig);
        const pools = poolAccessor.getAllPools();
        const poolAddressSet = new Set();
        const subgraphPools = (0, lodash_1.default)(pools)
            .map((pool) => {
            const { token0, token1, fee, liquidity } = pool;
            const poolAddress = v3_sdk_1.Pool.getAddress(pool.token0, pool.token1, pool.fee);
            if (poolAddressSet.has(poolAddress)) {
                return undefined;
            }
            poolAddressSet.add(poolAddress);
            const liquidityNumber = jsbi_1.default.toNumber(liquidity);
            return {
                id: poolAddress,
                feeTier: (0, amounts_1.unparseFeeAmount)(fee),
                liquidity: liquidity.toString(),
                token0: {
                    id: token0.address,
                },
                token1: {
                    id: token1.address,
                },
                // As a very rough proxy we just use liquidity for TVL.
                tvlETH: liquidityNumber,
                tvlUSD: liquidityNumber,
            };
        })
            .compact()
            .value();
        return subgraphPools;
    }
}
exports.StaticV3SubgraphProvider = StaticV3SubgraphProvider;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoic3RhdGljLXN1YmdyYXBoLXByb3ZpZGVyLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiLi4vLi4vLi4vLi4vc3JjL3Byb3ZpZGVycy92My9zdGF0aWMtc3ViZ3JhcGgtcHJvdmlkZXIudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7Ozs7O0FBQUEsNkRBQTZEO0FBQzdELGdEQUFtRDtBQUNuRCw0Q0FBa0Q7QUFDbEQsZ0RBQXdCO0FBQ3hCLG9EQUF1QjtBQUV2QixnREFBc0Q7QUFDdEQsOENBQTREO0FBQzVELHdDQUFxQztBQUVyQyxzREFxRDJCO0FBUzNCLE1BQU0sNkJBQTZCLEdBQW1CO0lBQ3BELENBQUMsa0JBQU8sQ0FBQyxPQUFPLENBQUMsRUFBRTtRQUNqQixnQ0FBdUIsQ0FBQyxrQkFBTyxDQUFDLE9BQU8sQ0FBRTtRQUN6Qyw0QkFBVztRQUNYLDZCQUFZO1FBQ1osNkJBQVk7UUFDWiw2QkFBWTtLQUNiO0lBQ0QsQ0FBQyxrQkFBTyxDQUFDLE1BQU0sQ0FBQyxFQUFFO1FBQ2hCLGdDQUF1QixDQUFDLGtCQUFPLENBQUMsTUFBTSxDQUFFO1FBQ3hDLDRCQUFXO1FBQ1gsNEJBQVc7UUFDWCw0QkFBVztRQUNYLDJCQUFVO0tBQ1g7SUFDRCxDQUFDLGtCQUFPLENBQUMsT0FBTyxDQUFDLEVBQUUsQ0FBQyxnQ0FBdUIsQ0FBQyxrQkFBTyxDQUFDLE9BQU8sQ0FBRSxFQUFFLDZCQUFZLENBQUM7SUFDNUUsQ0FBQyxrQkFBTyxDQUFDLFFBQVEsQ0FBQyxFQUFFO1FBQ2xCLGdDQUF1QixDQUFDLGtCQUFPLENBQUMsUUFBUSxDQUFFO1FBQzFDLDhCQUFhO1FBQ2IsNkJBQVk7UUFDWiw4QkFBYTtRQUNiLDhCQUFhO1FBQ2IsNEJBQVc7S0FDWjtJQUNELENBQUMsa0JBQU8sQ0FBQyxZQUFZLENBQUMsRUFBRTtRQUN0QixnQ0FBdUIsQ0FBQyxrQkFBTyxDQUFDLFlBQVksQ0FBRTtRQUM5Qyw4QkFBYTtRQUNiLDZCQUFZO1FBQ1osOEJBQWE7UUFDYiw4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