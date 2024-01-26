"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.CachingTokenProviderWithFallback = exports.CACHE_SEED_TOKENS = void 0;
const sdk_core_1 = require("@uniswap/sdk-core");
const lodash_1 = __importDefault(require("lodash"));
const util_1 = require("../util");
const token_provider_1 = require("./token-provider");
// These tokens will added to the Token cache on initialization.
exports.CACHE_SEED_TOKENS = {
    [sdk_core_1.ChainId.MAINNET]: {
        WETH: util_1.WRAPPED_NATIVE_CURRENCY[sdk_core_1.ChainId.MAINNET],
        USDC: token_provider_1.USDC_MAINNET,
        USDT: token_provider_1.USDT_MAINNET,
        WBTC: token_provider_1.WBTC_MAINNET,
        DAI: token_provider_1.DAI_MAINNET,
        // This token stores its symbol as bytes32, therefore can not be fetched on-chain using
        // our token providers.
        // This workaround adds it to the cache, so we won't try to fetch it on-chain.
        RING: new sdk_core_1.Token(sdk_core_1.ChainId.MAINNET, '0x9469D013805bFfB7D3DEBe5E7839237e535ec483', 18, 'RING', 'RING'),
    },
    [sdk_core_1.ChainId.SEPOLIA]: {
        USDC: token_provider_1.USDC_SEPOLIA,
    },
    [sdk_core_1.ChainId.OPTIMISM]: {
        USDC: token_provider_1.USDC_OPTIMISM,
        USDT: token_provider_1.USDT_OPTIMISM,
        WBTC: token_provider_1.WBTC_OPTIMISM,
        DAI: token_provider_1.DAI_OPTIMISM,
    },
    [sdk_core_1.ChainId.OPTIMISM_GOERLI]: {
        USDC: token_provider_1.USDC_OPTIMISM_GOERLI,
        USDT: token_provider_1.USDT_OPTIMISM_GOERLI,
        WBTC: token_provider_1.WBTC_OPTIMISM_GOERLI,
        DAI: token_provider_1.DAI_OPTIMISM_GOERLI,
    },
    [sdk_core_1.ChainId.ARBITRUM_ONE]: {
        USDC: token_provider_1.USDC_ARBITRUM,
        USDT: token_provider_1.USDT_ARBITRUM,
        WBTC: token_provider_1.WBTC_ARBITRUM,
        DAI: token_provider_1.DAI_ARBITRUM,
    },
    [sdk_core_1.ChainId.ARBITRUM_GOERLI]: {
        USDC: token_provider_1.USDC_ARBITRUM_GOERLI,
    },
    [sdk_core_1.ChainId.POLYGON]: {
        WMATIC: token_provider_1.WMATIC_POLYGON,
        USDC: token_provider_1.USDC_POLYGON,
    },
    [sdk_core_1.ChainId.POLYGON_MUMBAI]: {
        WMATIC: token_provider_1.WMATIC_POLYGON_MUMBAI,
        DAI: token_provider_1.DAI_POLYGON_MUMBAI,
    },
    [sdk_core_1.ChainId.CELO]: {
        CELO: token_provider_1.CELO,
        CUSD: token_provider_1.CUSD_CELO,
        CEUR: token_provider_1.CEUR_CELO,
        DAI: token_provider_1.DAI_CELO,
    },
    [sdk_core_1.ChainId.CELO_ALFAJORES]: {
        CELO: token_provider_1.CELO_ALFAJORES,
        CUSD: token_provider_1.CUSD_CELO_ALFAJORES,
        CEUR: token_provider_1.CUSD_CELO_ALFAJORES,
        DAI: token_provider_1.DAI_CELO_ALFAJORES,
    },
    [sdk_core_1.ChainId.GNOSIS]: {
        WXDAI: util_1.WRAPPED_NATIVE_CURRENCY[sdk_core_1.ChainId.GNOSIS],
        USDC_ETHEREUM_GNOSIS: token_provider_1.USDC_ETHEREUM_GNOSIS,
    },
    [sdk_core_1.ChainId.MOONBEAM]: {
        USDC: token_provider_1.USDC_MOONBEAM,
        DAI: token_provider_1.DAI_MOONBEAM,
        WBTC: token_provider_1.WBTC_MOONBEAM,
        WGLMR: util_1.WRAPPED_NATIVE_CURRENCY[sdk_core_1.ChainId.MOONBEAM],
    },
    [sdk_core_1.ChainId.BNB]: {
        USDC: token_provider_1.USDC_BNB,
        USDT: token_provider_1.USDT_BNB,
        BUSD: token_provider_1.BUSD_BNB,
        ETH: token_provider_1.ETH_BNB,
        DAI: token_provider_1.DAI_BNB,
        BTC: token_provider_1.BTC_BNB,
        WBNB: util_1.WRAPPED_NATIVE_CURRENCY[sdk_core_1.ChainId.BNB],
    },
    [sdk_core_1.ChainId.AVALANCHE]: {
        USDC: token_provider_1.USDC_AVAX,
        DAI: token_provider_1.DAI_AVAX,
        WAVAX: util_1.WRAPPED_NATIVE_CURRENCY[sdk_core_1.ChainId.AVALANCHE],
    },
    [sdk_core_1.ChainId.BASE]: {
        USDC: token_provider_1.USDC_BASE,
        WETH: util_1.WRAPPED_NATIVE_CURRENCY[sdk_core_1.ChainId.BASE],
    },
    // Currently we do not have providers for Moonbeam mainnet or Gnosis testnet
};
/**
 * Provider for getting token metadata that falls back to a different provider
 * in the event of failure.
 *
 * @export
 * @class CachingTokenProviderWithFallback
 */
class CachingTokenProviderWithFallback {
    constructor(chainId, 
    // Token metadata (e.g. symbol and decimals) don't change so can be cached indefinitely.
    // Constructing a new token object is slow as sdk-core does checksumming.
    tokenCache, primaryTokenProvider, fallbackTokenProvider) {
        this.chainId = chainId;
        this.tokenCache = tokenCache;
        this.primaryTokenProvider = primaryTokenProvider;
        this.fallbackTokenProvider = fallbackTokenProvider;
        this.CACHE_KEY = (chainId, address) => `token-${chainId}-${address}`;
    }
    async getTokens(_addresses) {
        const seedTokens = exports.CACHE_SEED_TOKENS[this.chainId];
        if (seedTokens) {
            for (const token of Object.values(seedTokens)) {
                await this.tokenCache.set(this.CACHE_KEY(this.chainId, token.address.toLowerCase()), token);
            }
        }
        const addressToToken = {};
        const symbolToToken = {};
        const addresses = (0, lodash_1.default)(_addresses)
            .map((address) => address.toLowerCase())
            .uniq()
            .value();
        const addressesToFindInPrimary = [];
        const addressesToFindInSecondary = [];
        for (const address of addresses) {
            if (await this.tokenCache.has(this.CACHE_KEY(this.chainId, address))) {
                addressToToken[address.toLowerCase()] = (await this.tokenCache.get(this.CACHE_KEY(this.chainId, address)));
                symbolToToken[addressToToken[address].symbol] =
                    (await this.tokenCache.get(this.CACHE_KEY(this.chainId, address)));
            }
            else {
                addressesToFindInPrimary.push(address);
            }
        }
        util_1.log.info({ addressesToFindInPrimary }, `Found ${addresses.length - addressesToFindInPrimary.length} out of ${addresses.length} tokens in local cache. ${addressesToFindInPrimary.length > 0
            ? `Checking primary token provider for ${addressesToFindInPrimary.length} tokens`
            : ``}
      `);
        if (addressesToFindInPrimary.length > 0) {
            const primaryTokenAccessor = await this.primaryTokenProvider.getTokens(addressesToFindInPrimary);
            for (const address of addressesToFindInPrimary) {
                const token = primaryTokenAccessor.getTokenByAddress(address);
                if (token) {
                    addressToToken[address.toLowerCase()] = token;
                    symbolToToken[addressToToken[address].symbol] = token;
                    await this.tokenCache.set(this.CACHE_KEY(this.chainId, address.toLowerCase()), addressToToken[address]);
                }
                else {
                    addressesToFindInSecondary.push(address);
                }
            }
            util_1.log.info({ addressesToFindInSecondary }, `Found ${addressesToFindInPrimary.length - addressesToFindInSecondary.length} tokens in primary. ${this.fallbackTokenProvider
                ? `Checking secondary token provider for ${addressesToFindInSecondary.length} tokens`
                : `No fallback token provider specified. About to return.`}`);
        }
        if (this.fallbackTokenProvider && addressesToFindInSecondary.length > 0) {
            const secondaryTokenAccessor = await this.fallbackTokenProvider.getTokens(addressesToFindInSecondary);
            for (const address of addressesToFindInSecondary) {
                const token = secondaryTokenAccessor.getTokenByAddress(address);
                if (token) {
                    addressToToken[address.toLowerCase()] = token;
                    symbolToToken[addressToToken[address].symbol] = token;
                    await this.tokenCache.set(this.CACHE_KEY(this.chainId, address.toLowerCase()), addressToToken[address]);
                }
            }
        }
        return {
            getTokenByAddress: (address) => {
                return addressToToken[address.toLowerCase()];
            },
            getTokenBySymbol: (symbol) => {
                return symbolToToken[symbol.toLowerCase()];
            },
            getAllTokens: () => {
                return Object.values(addressToToken);
            },
        };
    }
}
exports.CachingTokenProviderWithFallback = CachingTokenProviderWithFallback;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY2FjaGluZy10b2tlbi1wcm92aWRlci5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbIi4uLy4uLy4uL3NyYy9wcm92aWRlcnMvY2FjaGluZy10b2tlbi1wcm92aWRlci50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiOzs7Ozs7QUFBQSxnREFBbUQ7QUFDbkQsb0RBQXVCO0FBRXZCLGtDQUF1RDtBQUd2RCxxREE2QzBCO0FBRTFCLGdFQUFnRTtBQUNuRCxRQUFBLGlCQUFpQixHQUUxQjtJQUNGLENBQUMsa0JBQU8sQ0FBQyxPQUFPLENBQUMsRUFBRTtRQUNqQixJQUFJLEVBQUUsOEJBQXVCLENBQUMsa0JBQU8sQ0FBQyxPQUFPLENBQUU7UUFDL0MsSUFBSSxFQUFFLDZCQUFZO1FBQ2xCLElBQUksRUFBRSw2QkFBWTtRQUNsQixJQUFJLEVBQUUsNkJBQVk7UUFDbEIsR0FBRyxFQUFFLDRCQUFXO1FBQ2hCLHVGQUF1RjtRQUN2Rix1QkFBdUI7UUFDdkIsOEVBQThFO1FBQzlFLElBQUksRUFBRSxJQUFJLGdCQUFLLENBQ2Isa0JBQU8sQ0FBQyxPQUFPLEVBQ2YsNENBQTRDLEVBQzVDLEVBQUUsRUFDRixNQUFNLEVBQ04sTUFBTSxDQUNQO0tBQ0Y7SUFDRCxDQUFDLGtCQUFPLENBQUMsT0FBTyxDQUFDLEVBQUU7UUFDakIsSUFBSSxFQUFFLDZCQUFZO0tBQ25CO0lBQ0QsQ0FBQyxrQkFBTyxDQUFDLFFBQVEsQ0FBQyxFQUFFO1FBQ2xCLElBQUksRUFBRSw4QkFBYTtRQUNuQixJQUFJLEVBQUUsOEJBQWE7UUFDbkIsSUFBSSxFQUFFLDhCQUFhO1FBQ25CLEdBQUcsRUFBRSw2QkFBWTtLQUNsQjtJQUNELENBQUMsa0JBQU8sQ0FBQyxlQUFlLENBQUMsRUFBRTtRQUN6QixJQUFJLEVBQUUscUNBQW9CO1FBQzFCLElBQUksRUFBRSxxQ0FBb0I7UUFDMUIsSUFBSSxFQUFFLHFDQUFvQjtRQUMxQixHQUFHLEVBQUUsb0NBQW1CO0tBQ3pCO0lBQ0QsQ0FBQyxrQkFB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