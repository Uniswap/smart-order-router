"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.StaticV2SubgraphProvider = void 0;
const sdk_core_1 = require("@uniswap/sdk-core");
const v2_sdk_1 = require("@uniswap/v2-sdk");
const lodash_1 = __importDefault(require("lodash"));
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
    [sdk_core_1.ChainId.GOERLI]: [chains_1.WRAPPED_NATIVE_CURRENCY[sdk_core_1.ChainId.GOERLI]],
    [sdk_core_1.ChainId.SEPOLIA]: [chains_1.WRAPPED_NATIVE_CURRENCY[sdk_core_1.ChainId.SEPOLIA]],
    //v2 not deployed on [optimism, arbitrum, polygon, celo, gnosis, moonbeam, bnb, avalanche] and their testnets
    [sdk_core_1.ChainId.OPTIMISM]: [],
    [sdk_core_1.ChainId.ARBITRUM_ONE]: [],
    [sdk_core_1.ChainId.ARBITRUM_GOERLI]: [],
    [sdk_core_1.ChainId.OPTIMISM_GOERLI]: [],
    [sdk_core_1.ChainId.POLYGON]: [],
    [sdk_core_1.ChainId.POLYGON_MUMBAI]: [],
    [sdk_core_1.ChainId.CELO]: [],
    [sdk_core_1.ChainId.CELO_ALFAJORES]: [],
    [sdk_core_1.ChainId.GNOSIS]: [],
    [sdk_core_1.ChainId.MOONBEAM]: [],
    [sdk_core_1.ChainId.BNB]: [],
    [sdk_core_1.ChainId.AVALANCHE]: [],
    [sdk_core_1.ChainId.BASE_GOERLI]: [],
    [sdk_core_1.ChainId.BASE]: [],
    [sdk_core_1.ChainId.OPTIMISM_SEPOLIA]: [],
    [sdk_core_1.ChainId.ARBITRUM_SEPOLIA]: [],
    [sdk_core_1.ChainId.UNREAL]: [],
};
/**
 * Provider that does not get data from an external source and instead returns
 * a hardcoded list of Subgraph pools.
 *
 * Since the pools are hardcoded, the liquidity/price values are dummys and should not
 * be depended on.
 *
 * Useful for instances where other data sources are unavailable. E.g. subgraph not available.
 *
 * @export
 * @class StaticV2SubgraphProvider
 */
class StaticV2SubgraphProvider {
    constructor(chainId) {
        this.chainId = chainId;
    }
    async getPools(tokenIn, tokenOut) {
        log_1.log.info('In static subgraph provider for V2');
        const bases = BASES_TO_CHECK_TRADES_AGAINST[this.chainId];
        const basePairs = lodash_1.default.flatMap(bases, (base) => bases.map((otherBase) => [base, otherBase]));
        if (tokenIn && tokenOut) {
            basePairs.push([tokenIn, tokenOut], ...bases.map((base) => [tokenIn, base]), ...bases.map((base) => [tokenOut, base]));
        }
        const pairs = (0, lodash_1.default)(basePairs)
            .filter((tokens) => Boolean(tokens[0] && tokens[1]))
            .filter(([tokenA, tokenB]) => tokenA.address !== tokenB.address && !tokenA.equals(tokenB))
            .value();
        const poolAddressSet = new Set();
        const subgraphPools = (0, lodash_1.default)(pairs)
            .map(([tokenA, tokenB]) => {
            const poolAddress = v2_sdk_1.Pair.getAddress(tokenA, tokenB);
            if (poolAddressSet.has(poolAddress)) {
                return undefined;
            }
            poolAddressSet.add(poolAddress);
            const [token0, token1] = tokenA.sortsBefore(tokenB)
                ? [tokenA, tokenB]
                : [tokenB, tokenA];
            return {
                id: poolAddress,
                liquidity: '100',
                token0: {
                    id: token0.address,
                },
                token1: {
                    id: token1.address,
                },
                supply: 100,
                reserve: 100,
                reserveUSD: 100,
            };
        })
            .compact()
            .value();
        return subgraphPools;
    }
}
exports.StaticV2SubgraphProvider = StaticV2SubgraphProvider;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoic3RhdGljLXN1YmdyYXBoLXByb3ZpZGVyLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiLi4vLi4vLi4vLi4vc3JjL3Byb3ZpZGVycy92Mi9zdGF0aWMtc3ViZ3JhcGgtcHJvdmlkZXIudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7Ozs7O0FBQUEsZ0RBQW1EO0FBQ25ELDRDQUF1QztBQUN2QyxvREFBdUI7QUFFdkIsOENBQTREO0FBQzVELHdDQUFxQztBQUNyQyxzREFLMkI7QUFRM0IsTUFBTSw2QkFBNkIsR0FBbUI7SUFDcEQsQ0FBQyxrQkFBTyxDQUFDLE9BQU8sQ0FBQyxFQUFFO1FBQ2pCLGdDQUF1QixDQUFDLGtCQUFPLENBQUMsT0FBTyxDQUFDO1FBQ3hDLDRCQUFXO1FBQ1gsNkJBQVk7UUFDWiw2QkFBWTtRQUNaLDZCQUFZO0tBQ2I7SUFDRCxDQUFDLGtCQUFPLENBQUMsTUFBTSxDQUFDLEVBQUUsQ0FBQyxnQ0FBdUIsQ0FBQyxrQkFBTyxDQUFDLE1BQU0sQ0FBQyxDQUFDO0lBQzNELENBQUMsa0JBQU8sQ0FBQyxPQUFPLENBQUMsRUFBRSxDQUFDLGdDQUF1QixDQUFDLGtCQUFPLENBQUMsT0FBTyxDQUFDLENBQUM7SUFDN0QsNkdBQTZHO0lBQzdHLENBQUMsa0JBQU8sQ0FBQyxRQUFRLENBQUMsRUFBRSxFQUFFO0lBQ3RCLENBQUMsa0JBQU8sQ0FBQyxZQUFZLENBQUMsRUFBRSxFQUFFO0lBQzFCLENBQUMsa0JBQU8sQ0FBQyxlQUFlLENBQUMsRUFBRSxFQUFFO0lBQzdCLENBQUMsa0JBQU8sQ0FBQyxlQUFlLENBQUMsRUFBRSxFQUFFO0lBQzdCLENBQUMsa0JBQU8sQ0FBQyxPQUFPLENBQUMsRUFBRSxFQUFFO0lBQ3JCLENBQUMsa0JBQU8sQ0FBQyxjQUFjLENBQUMsRUFBRSxFQUFFO0lBQzVCLENBQUMsa0JBQU8sQ0FBQyxJQUFJLENBQUMsRUFBRSxFQUFFO0lBQ2xCLENBQUMsa0JBQU8sQ0FBQyxjQUFjLENBQUMsRUFBRSxFQUFFO0lBQzVCLENBQUMsa0JBQU8sQ0FBQyxNQUFNLENBQUMsRUFBRSxFQUFFO0lBQ3BCLENBQUMsa0JBQU8sQ0FBQyxRQUFRLENBQUMsRUFBRSxFQUFFO0lBQ3RCLENBQUMsa0JBQU8sQ0FBQyxHQUFHLENBQUMsRUFBRSxFQUFFO0lBQ2pCLENBQUMsa0JBQU8sQ0FBQyxTQUFTLENBQUMsRUFBRSxFQUFFO0lBQ3ZCLENBQUMsa0JBQU8sQ0FBQyxXQUFXLENBQUMsRUFBRSxFQUFFO0lBQ3pCLENBQUMsa0JBQU8sQ0FBQyxJQUFJLENBQUMsRUFBRSxFQUFFO0lBQ2xCLENBQUMsa0JBQU8sQ0FBQyxnQkFBZ0IsQ0FBQyxFQUFFLEVBQUU7SUFDOUIsQ0FBQyxrQkFBTyxDQUFDLGdCQUFnQixDQUFDLEVBQUUsRUFBRTtJQUM5QixDQUFDLGtCQUFPLENBQUMsTUFBTSxDQUFDLEVBQUUsRUFBRTtDQUNyQixDQUFDO0FBRUY7Ozs7Ozs7Ozs7O0dBV0c7QUFDSCxNQUFhLHdCQUF3QjtJQUNuQyxZQUFvQixPQUFnQjtRQUFoQixZQUFPLEdBQVAsT0FBTyxDQUFTO0lBQUcsQ0FBQztJQUVqQyxLQUFLLENBQUMsUUFBUSxDQUNuQixPQUFlLEVBQ2YsUUFBZ0I7UUFFaEIsU0FBRyxDQUFDLElBQUksQ0FBQyxvQ0FBb0MsQ0FBQyxDQUFDO1FBQy9DLE1BQU0sS0FBSyxHQUFHLDZCQUE2QixDQUFDLElBQUksQ0FBQyxPQUFPLENBQUMsQ0FBQztRQUUxRCxNQUFNLFNBQVMsR0FBcUIsZ0JBQUMsQ0FBQyxPQUFPLENBQzNDLEtBQUssRUFDTCxDQUFDLElBQUksRUFBb0IsRUFBRSxDQUFDLEtBQUssQ0FBQyxHQUFHLENBQUMsQ0FBQyxTQUFTLEVBQUUsRUFBRSxDQUFDLENBQUMsSUFBSSxFQUFFLFNBQVMsQ0FBQyxDQUFDLENBQ3hFLENBQUM7UUFFRixJQUFJLE9BQU8sSUFBSSxRQUFRLEVBQUU7WUFDdkIsU0FBUyxDQUFDLElBQUksQ0FDWixDQUFDLE9BQU8sRUFBRSxRQUFRLENBQUMsRUFDbkIsR0FBRyxLQUFLLENBQUMsR0FBRyxDQUFDLENBQUMsSUFBSSxFQUFrQixFQUFFLENBQUMsQ0FBQyxPQUFPLEVBQUUsSUFBSSxDQUFDLENBQUMsRUFDdkQsR0FBRyxLQUFLLENBQUMsR0FBRyxDQUFDLENBQUMsSUFBSSxFQUFrQixFQUFFLENBQUMsQ0FBQyxRQUFRLEVBQUUsSUFBSSxDQUFDLENBQUMsQ0FDekQsQ0FBQztTQUNIO1FBRUQsTUFBTSxLQUFLLEdBQXFCLElBQUEsZ0JBQUMsRUFBQyxTQUFTLENBQUM7YUFDekMsTUFBTSxDQUFDLENBQUMsTUFBTSxFQUE0QixFQUFFLENBQzNDLE9BQU8sQ0FBQyxNQUFNLENBQUMsQ0FBQyxDQUFDLElBQUksTUFBTSxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQ2hDO2FBQ0EsTUFBTSxDQUNMLENBQUMsQ0FBQyxNQUFNLEVBQUUsTUFBTSxDQUFDLEVBQUUsRUFBRSxDQUNuQixNQUFNLENBQUMsT0FBTyxLQUFLLE1BQU0sQ0FBQyxPQUFPLElBQUksQ0FBQyxNQUFNLENBQUMsTUFBTSxDQUFDLE1BQU0sQ0FBQyxDQUM5RDthQUNBLEtBQUssRUFBRSxDQUFDO1FBRVgsTUFBTSxjQUFjLEdBQUcsSUFBSSxHQUFHLEVBQVUsQ0FBQztRQUV6QyxNQUFNLGFBQWEsR0FBcUIsSUFBQSxnQkFBQyxFQUFDLEtBQUssQ0FBQzthQUM3QyxHQUFHLENBQUMsQ0FBQyxDQUFDLE1BQU0sRUFBRSxNQUFNLENBQUMsRUFBRSxFQUFFO1lBQ3hCLE1BQU0sV0FBVyxHQUFHLGFBQUksQ0FBQyxVQUFVLENBQUMsTUFBTSxFQUFFLE1BQU0sQ0FBQyxDQUFDO1lBRXBELElBQUksY0FBYyxDQUFDLEdBQUcsQ0FBQyxXQUFXLENBQUMsRUFBRTtnQkFDbkMsT0FBTyxTQUFTLENBQUM7YUFDbEI7WUFDRCxjQUFjLENBQUMsR0FBRyxDQUFDLFdBQVcsQ0FBQyxDQUFDO1lBRWhDLE1BQU0sQ0FBQyxNQUFNLEVBQUUsTUFBTSxDQUFDLEdBQUcsTUFBTSxDQUFDLFdBQVcsQ0FBQyxNQUFNLENBQUM7Z0JBQ2pELENBQUMsQ0FBQyxDQUFDLE1BQU0sRUFBRSxNQUFNLENBQUM7Z0JBQ2xCLENBQUMsQ0FBQyxDQUFDLE1BQU0sRUFBRSxNQUFNLENBQUMsQ0FBQztZQUVyQixPQUFPO2dCQUNMLEVBQUUsRUFBRSxXQUFXO2dCQUNmLFNBQVMsRUFBRSxLQUFLO2dCQUNoQixNQUFNLEVBQUU7b0JBQ04sRUFBRSxFQUFFLE1BQU0sQ0FBQyxPQUFPO2lCQUNuQjtnQkFDRCxNQUFNLEVBQUU7b0JBQ04sRUFBRSxFQUFFLE1BQU0sQ0FBQyxPQUFPO2lCQUNuQjtnQkFDRCxNQUFNLEVBQUUsR0FBRztnQkFDWCxPQUFPLEVBQUUsR0FBRztnQkFDWixVQUFVLEVBQUUsR0FBRzthQUNoQixDQUFDO1FBQ0osQ0FBQyxDQUFDO2FBQ0QsT0FBTyxFQUFFO2FBQ1QsS0FBSyxFQUFFLENBQUM7UUFFWCxPQUFPLGFBQWEsQ0FBQztJQUN2QixDQUFDO0NBQ0Y7QUFuRUQsNERBbUVDIn0=