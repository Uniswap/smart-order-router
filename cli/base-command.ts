import { Command, flags } from '@oclif/command';
import { ParserOutput } from '@oclif/parser/lib/parse';
import DEFAULT_TOKEN_LIST from '@uniswap/default-token-list';
import { Currency, CurrencyAmount } from '@uniswap/sdk-core';
import { MethodParameters } from '@uniswap/v3-sdk';
import { default as bunyan, default as Logger } from 'bunyan';
import bunyanDebugStream from 'bunyan-debug-stream';
import { BigNumber, ethers } from 'ethers';
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
  IPoolProvider,
  IRouter,
  LegacyRouter,
  MetricLogger,
  PoolProvider,
  QuoteProvider,
  routeAmountsToString,
  RouteWithValidQuote,
  setGlobalLogger,
  setGlobalMetric,
  SubgraphProvider,
  TokenListProvider,
  ITokenProvider,
  TokenProvider,
  TokenProviderWithFallback,
  UniswapMulticallProvider,
} from '../src';

export abstract class BaseCommand extends Command {
  static flags = {
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
    router: flags.string({
      char: 's',
      required: false,
      default: 'alpha',
    }),
    debug: flags.boolean(),
    debugJSON: flags.boolean(),
  };

  private _log: Logger | null = null;
  private _router: IRouter<any> | null = null;
  private _tokenProvider: ITokenProvider | null = null;
  private _poolProvider: IPoolProvider | null = null;

  get logger() {
    return this._log
      ? this._log
      : bunyan.createLogger({
          name: 'Default Logger',
        });
  }

  get router() {
    return this._router;
  }

  get tokenProvider() {
    return this._tokenProvider;
  }

  get poolProvider() {
    return this._poolProvider;
  }

  async init() {
    const query: ParserOutput<any, any> = this.parse();
    const {
      chainId: chainIdNumb,
      router: routerStr,
      debug,
      debugJSON,
      tokenListURI,
    } = query.flags;

    // initialize logger
    const logLevel = debug || debugJSON ? bunyan.DEBUG : bunyan.INFO;
    this._log = bunyan.createLogger({
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
      setGlobalLogger(this.logger);
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

    const multicall = new UniswapMulticallProvider(provider);
    const multicall2Provider = new UniswapMulticallProvider(provider);
    this._poolProvider = new PoolProvider(multicall2Provider);
    if (!this.poolProvider) {
      this.log('could not initialize poolProvider');
      return;
    }

	   // initialize tokenProvider
    const tokenProviderOnChain = new TokenProvider(chainId, multicall2Provider);
    this._tokenProvider = new TokenProviderWithFallback(
      tokenListProvider,
      tokenProviderOnChain
    );
    if (!this.tokenProvider) {
      this.log('could not initialize tokenProvider');
      return;
    }

    // initialize router
    if (routerStr == 'legacy') {
      this._router = new LegacyRouter({
        chainId,
        multicall2Provider,
        poolProvider: new PoolProvider(multicall2Provider),
        quoteProvider: new QuoteProvider(provider, multicall2Provider),
        tokenProvider: this.tokenProvider,
      });
    } else {
      this._router = new AlphaRouter({
        provider,
        chainId,
        subgraphProvider: new CachingSubgraphProvider(
          new SubgraphProvider(undefined, 10000)
        ),
        multicall2Provider: multicall,
        poolProvider: new CachingPoolProvider(
          new PoolProvider(multicall2Provider)
        ),
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
        tokenProvider: this.tokenProvider,
      });
    }
  }

  logSwapResults(
    routeAmounts: RouteWithValidQuote[],
    quote: CurrencyAmount<Currency>,
    quoteGasAdjusted: CurrencyAmount<Currency>,
    estimatedGasUsedQuoteToken: CurrencyAmount<Currency>,
    estimatedGasUsedUSD: CurrencyAmount<Currency>,
    methodParameters: MethodParameters | undefined,
    blockNumber: BigNumber,
    estimatedGasUsed: BigNumber,
    gasPriceWei: BigNumber
  ) {
    this.logger.info(`Best Route:`);
    this.logger.info(`${routeAmountsToString(routeAmounts)}`);

    this.logger.info(`\tRaw Quote Exact In:`);
    this.logger.info(`\t\t${quote.toFixed(2)}`);
    this.logger.info(`\tGas Adjusted Quote In}:`);
    this.logger.info(`\t\t${quoteGasAdjusted.toFixed(2)}`);
    this.logger.info(``);
    this.logger.info(
      `Gas Used Quote Token: ${estimatedGasUsedQuoteToken.toFixed(6)}`
    );
    this.logger.info(`Gas Used USD: ${estimatedGasUsedUSD.toFixed(6)}`);
    this.logger.info(`Calldata: ${methodParameters?.calldata}`);
    this.logger.info(`Value: ${methodParameters?.value}`);
    this.logger.info({
      blockNumber: blockNumber.toString(),
      estimatedGasUsed: estimatedGasUsed.toString(),
      gasPriceWei: gasPriceWei.toString(),
    });
  }
}
