export declare const UNSUPPORTED_TOKENS: {
    name: string;
    timestamp: string;
    version: {
        major: number;
        minor: number;
        patch: number;
    };
    tags: {};
    logoURI: string;
    keywords: string[];
    tokens: ({
        name: string;
        address: string;
        symbol: string;
        decimals: number;
        chainId: number;
        logoURI: string;
        tags?: undefined;
    } | {
        chainId: number;
        address: string;
        name: string;
        symbol: string;
        decimals: number;
        logoURI?: undefined;
        tags?: undefined;
    } | {
        chainId: number;
        address: string;
        symbol: string;
        name: string;
        decimals: number;
        logoURI: string;
        tags: string[];
    })[];
};
