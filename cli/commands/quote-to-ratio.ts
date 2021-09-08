/// <reference types="./types/bunyan-debug-stream" />
import { Command, flags } from '@oclif/command';
import DEFAULT_TOKEN_LIST from '@uniswap/default-token-list';
import { Currency, Ether, Percent } from '@uniswap/sdk-core';
import { default as bunyan, default as Logger } from 'bunyan';
import bunyanDebugStream from 'bunyan-debug-stream';
import dotenv from 'dotenv';
import { ethers } from 'ethers';
import JSBI from 'jsbi';
import {
  AlphaRouter,
  CachingGasStationProvider,
  CachingPoolProvider,
  CachingSubgraphProvider,
  ChainId,
  CHAIN_IDS_LIST,
  EIP1559GasPriceProvider,
  HeuristicGasModelFactory,
  ID_TO_CHAIN_ID,
  ID_TO_NETWORK_NAME,
  MetricLogger,
  parseAmount,
  PoolProvider,
  QuoteProvider,
  routeAmountsToString,
  setGlobalLogger,
  setGlobalMetric,
  SubgraphProvider,
  SwapRoute,
  TokenListProvider,
  TokenProvider,
  TokenProviderWithFallback,
  UniswapMulticallProvider,
} from '../../src';

dotenv.config();

ethers.utils.Logger.globalLogger();
ethers.utils.Logger.setLogLevel(ethers.utils.Logger.levels.DEBUG);

export class QuoteToRatio extends Command {
  static description = 'Uniswap Smart Order Router CLI';

  static flags = {
    version: flags.version({ char: 'v' }),
    help: flags.help({ char: 'h' }),
    tokenIn: flags.string({ char: 'i', required: true }),
    tokenOut: flags.string({ char: 'o', required: true }),
    feeAmount: flags.integer({ char: 'f', required: true }),
    recipient: flags.string({ required: true }),
    tokenInBalance: flags.string({ required: true }),
    tokenOutBalance: flags.string({ required: true }),
    sqrtPriceX96Lower: flags.string({ required: true }),
    sqrtPriceX96Upper: flags.string({ required: true }),
    topN: flags.integer({
      required: false,
      default: 3,
    }),
    topNTokenInOut: flags.integer({
      required: false,
      default: 2,
    }),
    topNSecondHop: flags.integer({
      required: false,
      default: 0,
    }),
    topNWithEachBaseToken: flags.integer({
      required: false,
      default: 2,
    }),
    topNWithBaseToken: flags.integer({
      required: false,
      default: 6,
    }),
    topNWithBaseTokenInSet: flags.boolean({
      required: false,
      default: false,
    }),
    maxSwapsPerPath: flags.integer({
      required: false,
      default: 3,
    }),
    maxSplits: flags.integer({
      required: false,
      default: 3,
    }),
    distributionPercent: flags.integer({
      required: false,
      default: 5,
    }),
    chainId: flags.integer({
      char: 'c',
      required: false,
      default: ChainId.MAINNET,
      options: CHAIN_IDS_LIST,
    }),
    tokenListURI: flags.string({
      required: false,
    }),
    debug: flags.boolean(),
    debugJSON: flags.boolean(),
  };

  async run() {
    const { flags } = this.parse(QuoteToRatio);
    const {
      tokenIn: tokenInStr,
      tokenOut: tokenOutStr,
      chainId: chainIdNumb,
      tokenInBalance: tokenInBalanceStr,
      tokenOutBalance: tokenOutBalanceStr,
      feeAmount,
      sqrtPriceX96Lower,
      sqrtPriceX96Upper,
      recipient,
      tokenListURI,
      debug,
      debugJSON,
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

    const logLevel = debug || debugJSON ? bunyan.DEBUG : bunyan.INFO;
    const log: Logger = bunyan.createLogger({
      name: 'Uniswap Smart Order Router',
      serializers: bunyan.stdSerializers,
      level: logLevel,
      streams: debugJSON
        ? undefined
        : [
            {
              level: logLevel,
              type: 'stream',
              stream: bunyanDebugStream({
                basepath: __dirname,
                forceColor: false,
                showDate: false,
                showPid: false,
                showLoggerName: false,
                showLevel: !!debug,
              }),
            },
          ],
    });

    if (debug || debugJSON) {
      setGlobalLogger(log);
    }

    const metricLogger: MetricLogger = new MetricLogger();
    setGlobalMetric(metricLogger);

    const chainId = ID_TO_CHAIN_ID(chainIdNumb);
    const chainName = ID_TO_NETWORK_NAME(chainIdNumb);

    const provider = new ethers.providers.JsonRpcProvider(
      process.env.JSON_RPC_PROVIDER!,
      chainName
    );

    let tokenListProvider: TokenListProvider;
    if (tokenListURI) {
      tokenListProvider = await TokenListProvider.fromTokenListURI(
        chainId,
        tokenListURI
      );
    } else {
      tokenListProvider = await TokenListProvider.fromTokenList(
        chainId,
        DEFAULT_TOKEN_LIST
      );
    }
    const multicall2Provider = new UniswapMulticallProvider(provider);

    const tokenProviderOnChain = new TokenProvider(chainId, multicall2Provider);
    const tokenProvider = new TokenProviderWithFallback(
      tokenListProvider,
      tokenProviderOnChain
    );

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

    const tokenInBalance = parseAmount(tokenInBalanceStr, tokenIn);
    const tokenOutBalance = parseAmount(tokenOutBalanceStr, tokenOut);

    const multicall = new UniswapMulticallProvider(provider);
    const poolProvider = new PoolProvider(multicall2Provider);

    const poolAccessor = await poolProvider.getPools([
      [tokenIn.wrapped, tokenOut.wrapped, 3000],
    ]);

    const pool = poolAccessor.getPool(
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

    let router = new AlphaRouter({
      provider,
      chainId,
      subgraphProvider: new CachingSubgraphProvider(
        new SubgraphProvider(undefined, 10000)
      ),
      multicall2Provider: multicall,
      poolProvider: new CachingPoolProvider(poolProvider),
      quoteProvider: new QuoteProvider(
        provider,
        multicall,
        {
          retries: 2,
          minTimeout: 25,
          maxTimeout: 250,
        },
        {
          multicallChunk: 200,
          gasLimitPerCall: 725_000,
          quoteMinSuccessRate: 0.7,
        }
      ),
      gasPriceProvider: new CachingGasStationProvider(
        new EIP1559GasPriceProvider(provider)
      ),
      gasModelFactory: new HeuristicGasModelFactory(),
      tokenProvider: tokenProvider,
    });

    let swapRoutes: SwapRoute<any> | null;
    swapRoutes = await router.routeToAmountsRatio(
      tokenInBalance,
      tokenOutBalance,
      pool,
      JSBI.BigInt(sqrtPriceX96Upper),
      JSBI.BigInt(sqrtPriceX96Lower),
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
    log.info(`Best Route:`);
    log.info(`${routeAmountsToString(routeAmounts)}`);

    log.info(`\tRaw Quote Exact In:`);
    log.info(`\t\t${quote.toFixed(2)}`);
    log.info(`\tGas Adjusted Quote In}:`);
    log.info(`\t\t${quoteGasAdjusted.toFixed(2)}`);
    log.info(``);
    log.info(`Gas Used Quote Token: ${estimatedGasUsedQuoteToken.toFixed(6)}`);
    log.info(`Gas Used USD: ${estimatedGasUsedUSD.toFixed(6)}`);
    log.info(`Calldata: ${methodParameters?.calldata}`);
    log.info(`Value: ${methodParameters?.value}`);
    log.info({
      blockNumber: blockNumber.toString(),
      estimatedGasUsed: estimatedGasUsed.toString(),
      gasPriceWei: gasPriceWei.toString(),
    });
  }
}
