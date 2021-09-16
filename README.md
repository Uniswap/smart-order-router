# Uniswap Smart Order Router

This repository contains routing logic for the Uniswap V3 protocol.

It searches for the most efficient way to swap token A for token B, considering splitting swaps across multiple routes and gas costs.

## Testing
### Unit Tests

```
npm run test
```

### CLI

The package can be run as a CLI for testing purposes.

First create a `.env` file in the root of the project and configure:

```
JSON_RPC_PROVIDER = '<JSON_RPC_PROVIDER>'
```

Then from the root directory you can execute the CLI.

```
./bin/cli quote --tokenIn 0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48 --tokenOut 0x1f9840a85d5af5bf1d1762f925bdaddc4201f984 --amount 1000 --exactIn --recipient 0xAb5801a7D398351b8bE11C439e05C5B3259aeC9B

Best Route:
100.00% = USDC -- 0.3% --> UNI
	Raw Quote Out:
		35.72
	Gas Adjusted Quote Out:
		34.03

Gas Used Quote Token: 1.691772
Gas Used USD: 47.592951
Calldata: 0x414bf389000000000000...
Value: 0x00

  blockNumber: "13088815"
  estimatedGasUsed: "113000"
  gasPriceWei: "130000000000"


./bin/cli quote-to-ratio --token0 0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48 --token1 0xdac17f958d2ee523a2206206994597c13d831ec7 --feeAmount 3000 --recipient 0xAb5801a7D398351b8bE11C439e05C5B3259aeC9B  --token0Balance 1000 --token1Balance 2000 --tickLower -120 --tickUpper 120

Best Route:
100.00% = USDT -- 0.05% --> USDC
Raw Quote Exact In:
	392.68
Gas Adjusted Quote In}:
	346.13

Gas Used Quote Token: 46.550010
Gas Used USD: 46.342899
Calldata: 0x414bf389000000000000000000000000dac17f958d2ee523a2206206994597c13d831ec7000000000000000000000000a0b86991c6218b36c1d19d4a2e9eb0ce3606eb4800000000000000000000000000000000000000000000000000000000000001f4000000000000000000000000ab5801a7d398351b8be11c439e05c5b3259aec9b000000000000000000000000000000000000000000000000000000000000006400000000000000000000000000000000000000000000000000000000176a736c000000000000000000000000000000000000000000000000000000001764f8650000000000000000000000000000000000000000000000000000000000000000
	Value: 0x00

	blockNumber: "13239188"
	estimatedGasUsed: "113000"
	gasPriceWei: "116690684398"
```
