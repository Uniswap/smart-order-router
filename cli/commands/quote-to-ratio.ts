import { flags } from '@oclif/command';
import { Currency, Ether, Percent } from '@uniswap/sdk-core';
import { Position } from '@uniswap/v3-sdk';
import dotenv from 'dotenv';
import { ethers } from 'ethers';
import { ID_TO_CHAIN_ID, parseAmount, SwapRoute } from '../../src';
import { BaseCommand } from '../base-command';

dotenv.config();

ethers.utils.Logger.globalLogger();
ethers.utils.Logger.setLogLevel(ethers.utils.Logger.levels.DEBUG);

export class QuoteToRatio extends BaseCommand {
  static description = 'Uniswap Smart Order Router CLI';

  static flags = {
    ...BaseCommand.flags,
    version: flags.version({ char: 'v' }),
    help: flags.help({ char: 'h' }),
    token0: flags.string({ char: 'i', required: true }),
    token1: flags.string({ char: 'o', required: true }),
    feeAmount: flags.integer({ char: 'f', required: true }),
    token0Balance: flags.string({ required: true }),
    token1Balance: flags.string({ required: true }),
    recipient: flags.string({ required: true }),
    tickLower: flags.integer({ required: true }),
    tickUpper: flags.integer({ required: true }),
  };

  async run() {
    const { flags } = this.parse(QuoteToRatio);
    const {
      chainId: chainIdNumb,
      token0: token0Str,
      token1: token1Str,
      token0Balance: token0BalanceStr,
      token1Balance: token1BalanceStr,
      feeAmount,
      tickLower,
      tickUpper,
      recipient,
      debug,
      topN,
      topNTokenInOut,
      topNSecondHop,
      topNWithEachBaseToken,
      topNWithBaseToken,
      topNWithBaseTokenInSet,
      maxSwapsPerPath,
      maxSplits,
      distributionPercent,
    } = flags;

    const log = this.logger;
    const router = this.swapToRatioRouter;
    const tokenProvider = this.tokenProvider;

    const tokenAccessor = await tokenProvider.getTokens([
      token0Str,
      token1Str,
    ]);

    const chainId = ID_TO_CHAIN_ID(chainIdNumb);
    const tokenIn: Currency =
      token0Str == 'ETH'
        ? Ether.onChain(chainId)
        : tokenAccessor.getTokenByAddress(token0Str)!;
    const tokenOut: Currency =
      token1Str == 'ETH'
        ? Ether.onChain(chainId)
        : tokenAccessor.getTokenByAddress(token1Str)!;

    const tokenInBalance = parseAmount(token0BalanceStr, tokenIn);
    const tokenOutBalance = parseAmount(token1BalanceStr, tokenOut);

    const poolAccessor = await this.poolProvider.getPools([
      [tokenIn.wrapped, tokenOut.wrapped, 3000],
    ]);

    const pool = poolAccessor?.getPool(
      tokenIn.wrapped,
      tokenOut.wrapped,
      feeAmount
    );
    if (!pool) {
      log.error(
        `Could not find pool. ${
          debug ? '' : 'Run in debug mode for more info'
        }.`
      );
      return;
    }

    const position = new Position({
      pool,
      tickUpper,
      tickLower,
      liquidity: 1,
    });

    let swapRoutes: SwapRoute<any> | null;
    swapRoutes = await router?.routeToRatio(
      tokenInBalance,
      tokenOutBalance,
      position,
      {
        deadline: 100,
        recipient,
        slippageTolerance: new Percent(5, 10_000),
      },
      {
        topN,
        topNDirectSwaps: 2,
        topNTokenInOut,
        topNSecondHop,
        topNWithEachBaseToken,
        topNWithBaseToken,
        topNWithBaseTokenInSet,
        maxSwapsPerPath,
        maxSplits,
        distributionPercent,
      }
    );

    if (!swapRoutes) {
      log.error(
        `Could not find route. ${
          debug ? '' : 'Run in debug mode for more info'
        }.`
      );
      return;
    }

    const {
      blockNumber,
      estimatedGasUsed,
      estimatedGasUsedQuoteToken,
      estimatedGasUsedUSD,
      gasPriceWei,
      methodParameters,
      quote,
      quoteGasAdjusted,
      route: routeAmounts,
    } = swapRoutes;

    this.logSwapResults(
      routeAmounts,
      quote,
      quoteGasAdjusted,
      estimatedGasUsedQuoteToken,
      estimatedGasUsedUSD,
      methodParameters,
      blockNumber,
      estimatedGasUsed,
      gasPriceWei
    );
  }
}
