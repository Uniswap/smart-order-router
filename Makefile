.PHONY: build
-include .env

build:
	npm run build

eth-v4-usdt-weth:
	./bin/cli quote --tokenIn 0xdAC17F958D2ee523a2206206994597C13D831ec7 --tokenOut 0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2 --amount 3500 --exactIn --minSplits 1 --protocols v4 --router alpha --chainId 1 $(p)

eth-v4-tusdc-tusdt:
	./bin/cli quote --tokenIn 0xf975A646FCa589Be9fc4E0C28ea426A75645fB1f --tokenOut 0x88B9Ad010A699Cc0c8C5C5EA8bAF90A0C375df1a --amount 1000 --exactIn --minSplits 1 --protocols v4 --router alpha --chainId 1 $(p)

eth-v4-usdc-weth:
	./bin/cli quote --tokenIn 0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48 --tokenOut 0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2 --amount 3500 --exactIn --minSplits 1 --protocols v4 --router alpha --chainId 1 $(p)

eth-v4-usdc-usdt:
	./bin/cli quote --tokenIn 0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48 --tokenOut 0xdAC17F958D2ee523a2206206994597C13D831ec7 --amount 5000 --exactIn --minSplits 1 --protocols v4 --router alpha --chainId 1 $(p)

eth-v3-usdc-weth:
	./bin/cli quote --tokenIn 0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48 --tokenOut 0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2 --amount 3500 --exactIn --minSplits 1 --protocols v3 --router alpha --chainId 1 $(p)

eth-v3-usdc-usdt:
	./bin/cli quote --tokenIn 0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48 --tokenOut 0xdAC17F958D2ee523a2206206994597C13D831ec7 --amount 5000 --exactIn --minSplits 1 --protocols v3 --router alpha --chainId 1 $(p)
