# uniswap-smart-order-router

## Setup

Create a `.env` file in the root of the project and configure:

```
INFURA_KEY = '<INFURA_KEY>'
ETH_GAS_STATION_INFO_KEY = '<ETH_GAS_STATION_KEY>'
```

## Sample Usage
```
$ uniswap-smart-order-router -i ETH -o DAI -a 100 --exactIn

Best Route: WETH9 -- 0.3% --> USDT -- 0.05% --> DAI
Best Amount Out: 339946.43
```