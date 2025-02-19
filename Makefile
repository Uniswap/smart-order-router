.PHONY: build
-include .env

build:
	npm run build

eth-v4-usdt-weth:
	./bin/cli quote --tokenIn 0xdAC17F958D2ee523a2206206994597C13D831ec7 --tokenOut 0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2 --amount 3500 --exactIn --minSplits 1 --protocols v4 --router alpha --chainId 1 $(p)

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
