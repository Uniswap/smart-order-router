.PHONY: build
-include .env

build:
	npm run build

mainnet-v4-usdt-usdc:
	./bin/cli quote --tokenIn 0xdAC17F958D2ee523a2206206994597C13D831ec7 --tokenOut 0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48 --amount 3500 --exactIn --minSplits 1 --protocols v4 --router alpha --chainId 1 $(p)

mainnet-v4-tusdt-tusdc:
	./bin/cli quote --tokenIn 0x561A87303005D9C83FbD94dDEb80D63528fCD448 --tokenOut 0xcc331eC1d6CF4542F9eB988B49249cfa163081dc --amount 3500 --exactIn --minSplits 1 --protocols v4 --router alpha --chainId 1 $(p)

sepolia-v4-wbtc-weth:
	./bin/cli quote --tokenIn 0x29f2D40B0605204364af54EC677bD022dA425d03 --tokenOut 0xC558DBdd856501FCd9aaF1E62eae57A9F0629a3c --amount 1 --exactIn --minSplits 1 --protocols v4 --router alpha --chainId 11155111 $(p)	

sepolia-v4-usdt-usdc:
	./bin/cli quote --tokenIn 0xaA8E23Fb1079EA71e0a56F48a2aA51851D8433D0 --tokenOut 0x94a9D9AC8a22534E3FaCa9F4e7F2E2cf85d5E4C8 --amount 3500 --exactIn --minSplits 1 --protocols v4 --router alpha --chainId 11155111 $(p)

sepolia-v4-usdc-weth:
	./bin/cli quote --tokenIn 0x94a9D9AC8a22534E3FaCa9F4e7F2E2cf85d5E4C8 --tokenOut 0xC558DBdd856501FCd9aaF1E62eae57A9F0629a3c --amount 3500 --exactIn --minSplits 1 --protocols v4 --router alpha --chainId 11155111 $(p)	

sepolia-v4-aave-wbtc:
	./bin/cli quote --tokenIn 0x88541670E55cC00bEEFD87eB59EDd1b7C511AC9a --tokenOut 0x29f2D40B0605204364af54EC677bD022dA425d03 --amount 2 --exactIn --minSplits 1 --protocols v4 --router alpha --chainId 11155111 $(p)	

sepolia-v4-tweth-twbtc:
	./bin/cli quote --tokenIn 0x6F556945544761e8384Fa36c76a7D1e360194cE6 --tokenOut 0xf21aD4869f024B48d7DE8F9348Ae72f0c82e40c8 --amount 1 --exactIn --minSplits 1 --protocols v4 --router alpha --chainId 11155111 $(p)

sepolia-v3-usdc-weth:
	./bin/cli quote --tokenIn 0x94a9D9AC8a22534E3FaCa9F4e7F2E2cf85d5E4C8 --tokenOut 0xC558DBdd856501FCd9aaF1E62eae57A9F0629a3c --amount 3500 --exactIn --minSplits 1 --protocols v3 --router alpha --chainId 11155111 $(p)		

eth-v4-usdt-weth:
	./bin/cli quote --tokenIn 0xdAC17F958D2ee523a2206206994597C13D831ec7 --tokenOut 0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2 --amount 3500 --exactIn --minSplits 1 --protocols v4 --router alpha --chainId 1 $(p)

eth-v4-wbtc-weth:
	./bin/cli quote --tokenIn 0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599 --tokenOut 0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2 --amount 1 --exactIn --minSplits 1 --protocols v4 --router alpha --chainId 1 $(p)

eth-v4-tusdc-tusdt:
	./bin/cli quote --tokenIn 0x39826E09f8efb9df4C56Aeb9eEC0D2B8164d3B36 --tokenOut 0xACB5b53F9F193b99bcd8EF8544ddF4c398DE24a3 --amount 1000 --exactIn --minSplits 1 --protocols v4 --router alpha --chainId 1 $(p)

eth-v4-usdc-weth:
	./bin/cli quote --tokenIn 0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48 --tokenOut 0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2 --amount 3500 --exactIn --minSplits 1 --protocols v4 --router alpha --chainId 1 $(p)

eth-v4-usdc-usdt:
	./bin/cli quote --tokenIn 0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48 --tokenOut 0xdAC17F958D2ee523a2206206994597C13D831ec7 --amount 5000 --exactIn --minSplits 1 --protocols v4 --router alpha --chainId 1 $(p)

eth-v3-usdc-weth:
	./bin/cli quote --tokenIn 0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48 --tokenOut 0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2 --amount 3500 --exactIn --minSplits 1 --protocols v3 --router alpha --chainId 1 $(p)

eth-v3-usdc-usdt:
	./bin/cli quote --tokenIn 0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48 --tokenOut 0xdAC17F958D2ee523a2206206994597C13D831ec7 --amount 5000 --exactIn --minSplits 1 --protocols v3 --router alpha --chainId 1 $(p)
