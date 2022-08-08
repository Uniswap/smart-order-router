import { BigNumber } from '@ethersproject/bignumber';
import { CurrencyAmount, Token } from '@uniswap/sdk-core';
import { FeeAmount, Pool } from '@uniswap/v3-sdk';
import _ from 'lodash';

import {
  ArbitrumGasData,
  OptimismGasData,
} from '../providers/v3/gas-data-provider';
import { IV3PoolProvider } from '../providers/v3/pool-provider';
import { usdGasTokensByChain } from '../routers';
import { ChainId, log, WRAPPED_NATIVE_CURRENCY } from '../util';

export async function getHighestLiquidityV3NativePool(
  token: Token,
  poolProvider: IV3PoolProvider
): Promise<Pool | null> {
  const nativeCurrency = WRAPPED_NATIVE_CURRENCY[token.chainId as ChainId]!;

  const nativePools = _([FeeAmount.HIGH, FeeAmount.MEDIUM, FeeAmount.LOW])
    .map<[Token, Token, FeeAmount]>((feeAmount) => {
      return [nativeCurrency, token, feeAmount];
    })
    .value();

  const poolAccessor = await poolProvider.getPools(nativePools);

  const pools = _([FeeAmount.HIGH, FeeAmount.MEDIUM, FeeAmount.LOW])
    .map((feeAmount) => {
      return poolAccessor.getPool(nativeCurrency, token, feeAmount);
    })
    .compact()
    .value();

  if (pools.length == 0) {
    log.error(
      { pools },
      `Could not find a ${nativeCurrency.symbol} pool with ${token.symbol} for computing gas costs.`
    );

    return null;
  }

  const maxPool = _.maxBy(pools, (pool) => pool.liquidity) as Pool;

  return maxPool;
}

export async function getHighestLiquidityV3USDPool(
  chainId: ChainId,
  poolProvider: IV3PoolProvider
): Promise<Pool> {
  const usdTokens = usdGasTokensByChain[chainId];
  const wrappedCurrency = WRAPPED_NATIVE_CURRENCY[chainId]!;

  if (!usdTokens) {
    throw new Error(
      `Could not find a USD token for computing gas costs on ${chainId}`
    );
  }

  const usdPools = _([
    FeeAmount.HIGH,
    FeeAmount.MEDIUM,
    FeeAmount.LOW,
    FeeAmount.LOWEST,
  ])
    .flatMap((feeAmount) => {
      return _.map<Token, [Token, Token, FeeAmount]>(usdTokens, (usdToken) => [
        wrappedCurrency,
        usdToken,
        feeAmount,
      ]);
    })
    .value();

  const poolAccessor = await poolProvider.getPools(usdPools);

  const pools = _([
    FeeAmount.HIGH,
    FeeAmount.MEDIUM,
    FeeAmount.LOW,
    FeeAmount.LOWEST,
  ])
    .flatMap((feeAmount) => {
      const pools = [];

      for (const usdToken of usdTokens) {
        const pool = poolAccessor.getPool(wrappedCurrency, usdToken, feeAmount);
        if (pool) {
          pools.push(pool);
        }
      }

      return pools;
    })
    .compact()
    .value();

  if (pools.length == 0) {
    const message = `Could not find a USD/${wrappedCurrency.symbol} pool for computing gas costs.`;
    log.error({ pools }, message);
    throw new Error(message);
  }

  const maxPool = _.maxBy(pools, (pool) => pool.liquidity) as Pool;

  return maxPool;
}

export function getGasCostInUSD(
  nativeCurrency: Token,
  usdPool: Pool,
  costNativeCurrency: CurrencyAmount<Token>
) {
  // convert fee into usd
  const nativeTokenPrice =
    usdPool.token0.address == nativeCurrency.address
      ? usdPool.token0Price
      : usdPool.token1Price;

  const gasCostUSD = nativeTokenPrice.quote(costNativeCurrency);
  return gasCostUSD;
}

export function getGasCostInNativeCurrency(
  nativeCurrency: Token,
  gasCostInWei: BigNumber
) {
  // wrap fee to native currency
  const costNativeCurrency = CurrencyAmount.fromRawAmount(
    nativeCurrency,
    gasCostInWei.toString()
  );
  return costNativeCurrency;
}

export async function getGasCostInQuoteToken(
  quoteToken: Token,
  nativePool: Pool,
  costNativeCurrency: CurrencyAmount<Token>
) {
  const nativeTokenPrice =
    nativePool.token0.address == quoteToken.address
      ? nativePool.token1Price
      : nativePool.token0Price;
  const gasCostQuoteToken = nativeTokenPrice.quote(costNativeCurrency);
  return gasCostQuoteToken;
}

export function calculateArbitrumToL1SecurityFee(
  calldata: string,
  gasData: ArbitrumGasData
): [BigNumber, BigNumber] {
  const { perL2TxFee, perL1CalldataFee } = gasData;
  // calculates gas amounts based on bytes of calldata, use 0 as overhead.
  const l1GasUsed = getL2ToL1GasUsed(calldata, BigNumber.from(0));
  // multiply by the fee per calldata and add the flat l2 fee
  let l1Fee = l1GasUsed.mul(perL1CalldataFee);
  l1Fee = l1Fee.add(perL2TxFee);
  return [l1GasUsed, l1Fee];
}

export function calculateOptimismToL1SecurityFee(
  calldata: string,
  gasData: OptimismGasData
): [BigNumber, BigNumber] {
  const { l1BaseFee, scalar, decimals, overhead } = gasData;

  const l1GasUsed = getL2ToL1GasUsed(calldata, overhead);
  // l1BaseFee is L1 Gas Price on etherscan
  const l1Fee = l1GasUsed.mul(l1BaseFee);
  const unscaled = l1Fee.mul(scalar);
  // scaled = unscaled / (10 ** decimals)
  const scaledConversion = BigNumber.from(10).pow(decimals);
  const scaled = unscaled.div(scaledConversion);
  return [l1GasUsed, scaled];
}

function getL2ToL1GasUsed(data: string, overhead: BigNumber): BigNumber {
  // data is hex encoded
  const dataArr: string[] = data.slice(2).match(/.{1,2}/g)!;
  const numBytes = dataArr.length;
  let count = 0;
  for (let i = 0; i < numBytes; i += 1) {
    const byte = parseInt(dataArr[i]!, 16);
    if (byte == 0) {
      count += 4;
    } else {
      count += 16;
    }
  }
  const unsigned = overhead.add(count);
  const signedConversion = 68 * 16;
  return unsigned.add(signedConversion);
}
