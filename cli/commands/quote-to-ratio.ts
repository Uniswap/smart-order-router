/// <reference types="./types/bunyan-debug-stream" />
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
    tokenIn: flags.string({ char: 'i', required: true }),
    tokenOut: flags.string({ char: 'o', required: true }),
    feeAmount: flags.integer({ char: 'f', required: true }),
    recipient: flags.string({ required: true }),
    tokenInBalance: flags.string({ required: true }),
    tokenOutBalance: flags.string({ required: true }),
    tickLower: flags.integer({ required: true }),
    tickUpper: flags.integer({ required: true }),
  };

  async run() {
    const { flags } = this.parse(QuoteToRatio);
    const {
      chainId: chainIdNumb,
      tokenIn: tokenInStr,
      tokenOut: tokenOutStr,
      tokenInBalance: tokenInBalanceStr,
      tokenOutBalance: tokenOutBalanceStr,
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
    const router = this.router;
    const tokenAccessor = this.tokenAccessor;

    if (!router) {
      log.error('router not initialized');
      return;
    }
    if (!tokenAccessor) {
      log.error('tokenAccessor not initialized');
      return;
    }

    const chainId = ID_TO_CHAIN_ID(chainIdNumb);
    const tokenIn: Currency =
      tokenInStr == 'ETH'
        ? Ether.onChain(chainId)
        : tokenAccessor.getTokenByAddress(tokenInStr)!;
    const tokenOut: Currency =
      tokenOutStr == 'ETH'
        ? Ether.onChain(chainId)
        : tokenAccessor.getTokenByAddress(tokenOutStr)!;

    const tokenInBalance = parseAmount(tokenInBalanceStr, tokenIn);
    const tokenOutBalance = parseAmount(tokenOutBalanceStr, tokenOut);

    const poolAccessor = await this.poolProvider?.getPools([
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
    swapRoutes = await router?.routeToAmountsRatio(
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
