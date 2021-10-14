import { flags } from '@oclif/command';
import { Currency, Ether, Percent } from '@uniswap/sdk-core';
import { Route } from '@uniswap/v2-sdk';
import dotenv from 'dotenv';
import { ethers } from 'ethers';
import _ from 'lodash';
import { ChainId, ID_TO_CHAIN_ID, parseAmount, SwapRoute, USDC_MAINNET, V2QuoteProvider, V2SubgraphProvider } from '../../src';
import { V2PoolProvider } from '../../src/providers/v2/pool-provider';
import { Protocol, TO_PROTOCOL } from '../../src/util/protocols';
import { BaseCommand } from '../base-command';

dotenv.config();

ethers.utils.Logger.globalLogger();
ethers.utils.Logger.setLogLevel(ethers.utils.Logger.levels.DEBUG);

export class Quote extends BaseCommand {
  static description = 'Uniswap Smart Order Router CLI';

  static flags = {
    ...BaseCommand.flags,
    version: flags.version({ char: 'v' }),
    help: flags.help({ char: 'h' }),
    tokenIn: flags.string({ char: 'i', required: true }),
    tokenOut: flags.string({ char: 'o', required: true }),
    recipient: flags.string({ required: true }),
    amount: flags.string({ char: 'a', required: true }),
    exactIn: flags.boolean({ required: false }),
    exactOut: flags.boolean({ required: false }),
    protocols: flags.string({ required: false })
  };

  async run() {
    const { flags } = this.parse(Quote);
    const {
      tokenIn: tokenInStr,
      tokenOut: tokenOutStr,
      amount: amountStr,
      exactIn,
      exactOut,
      recipient,
      debug,
      topN,
      topNTokenInOut,
      topNSecondHop,
      topNWithEachBaseToken,
      topNWithBaseToken,
      topNWithBaseTokenInSet,
      maxSwapsPerPath,
      minSplits,
      maxSplits,
      distributionPercent,
      chainId: chainIdNumb,
      protocols: protocolsStr,
    } = flags;

    if ((exactIn && exactOut) || (!exactIn && !exactOut)) {
      throw new Error('Must set either --exactIn or --exactOut.');
    }

    let protocols: Protocol[] = [];
    if (protocolsStr) {
      try {
        protocols = _.map(protocolsStr.split(','), protocolStr => TO_PROTOCOL(protocolStr));
      } catch (err) {
        throw new Error(`Protocols invalid. Valid options: ${Object.values(Protocol)}`);
      }
    }

    const chainId = ID_TO_CHAIN_ID(chainIdNumb);

    const log = this.logger;
    const tokenProvider = this.tokenProvider;
    const router = this.router;

    const tokenAccessor = await tokenProvider.getTokens([
      tokenInStr,
      tokenOutStr,
    ]);

    const tokenIn: Currency =
      tokenInStr == 'ETH'
        ? Ether.onChain(chainId)
        : tokenAccessor.getTokenByAddress(tokenInStr)!;
    const tokenOut: Currency =
      tokenOutStr == 'ETH'
        ? Ether.onChain(chainId)
        : tokenAccessor.getTokenByAddress(tokenOutStr)!;


    if (protocols.includes(Protocol.V2)) {
      const v2PoolP = new V2PoolProvider(ChainId.MAINNET, this.multicall2Provider);
      const acc = await v2PoolP.getPools([
        [tokenIn.wrapped, tokenOut.wrapped], 
        [tokenIn.wrapped, USDC_MAINNET], 
        [USDC_MAINNET, tokenOut.wrapped]
      ]);
      const h1 = acc.getPool(tokenIn.wrapped, USDC_MAINNET); 
      const h2 = acc.getPool(USDC_MAINNET, tokenOut.wrapped);

      const r = new Route([h1!, h2!], tokenIn.wrapped, tokenOut.wrapped);

      const v2QuoteP = new V2QuoteProvider();
      const amountIn = parseAmount(amountStr, tokenIn);
      const quotes = await v2QuoteP.getQuotesManyExactIn([amountIn], [r]);

      log.info({ quotes }, 'Quotes');

      const v2Sub = new V2SubgraphProvider(ChainId.MAINNET);
      const v2Subpools = await v2Sub.getPools();

      log.info({ ps: acc.getAllPools(), sps: v2Subpools.slice(0, 5) });

      return;
    }

    let swapRoutes: SwapRoute<any> | null;
    if (exactIn) {
      const amountIn = parseAmount(amountStr, tokenIn);
      swapRoutes = await router.routeExactIn(
        tokenIn,
        tokenOut,
        amountIn,
        {
          deadline: 100,
          recipient,
          slippageTolerance: new Percent(5, 10_000),
        },
        {
          topN,
          topNTokenInOut,
          topNSecondHop,
          topNWithEachBaseToken,
          topNWithBaseToken,
          topNWithBaseTokenInSet,
          maxSwapsPerPath,
          minSplits,
          maxSplits,
          distributionPercent,
          protocols
        }
      );
    } else {
      const amountOut = parseAmount(amountStr, tokenOut);
      swapRoutes = await router.routeExactOut(
        tokenIn,
        tokenOut,
        amountOut,
        {
          deadline: 100,
          recipient,
          slippageTolerance: new Percent(5, 10_000),
        },
        {
          topN,
          topNTokenInOut,
          topNSecondHop,
          topNWithEachBaseToken,
          topNWithBaseToken,
          topNWithBaseTokenInSet,
          maxSwapsPerPath,
          minSplits,
          maxSplits,
          distributionPercent,
          protocols
        }
      );
    }

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
