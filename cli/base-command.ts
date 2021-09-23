/// <reference types="./types/bunyan-debug-stream" />
import { Command, flags } from '@oclif/command';
import { ParserOutput } from '@oclif/parser/lib/parse';
import DEFAULT_TOKEN_LIST from '@uniswap/default-token-list';
import { MethodParameters, Pool } from '@uniswap/v3-sdk';
import { BigNumber, ethers } from 'ethers';
import { Currency, CurrencyAmount, Token } from '@uniswap/sdk-core';
import { default as bunyan, default as Logger } from 'bunyan';
import bunyanDebugStream from 'bunyan-debug-stream';
import NodeCache from 'node-cache';
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
  ISwapToRatio,
  ITokenProvider,
  LegacyRouter,
  MetricLogger,
  PoolProvider,
  QuoteProvider,
  routeAmountsToString,
  RouteWithValidQuote,
  setGlobalLogger,
  setGlobalMetric,
  TokenProvider,
  CachingTokenListProvider,
  UniswapMulticallProvider,
  NodeJSCache,
  SubgraphPool,
  GasPrice,
  CachingTokenProviderWithFallback,
  URISubgraphProvider,
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
    minSplits: flags.integer({
      required: false,
      default: 1,
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
  private _swapToRatioRouter: ISwapToRatio<any> | null = null;
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
    if (this._router) {
      return this._router;
    } else {
      throw 'router not initialized';
    }
  }

  get swapToRatioRouter() {
    if (this._swapToRatioRouter) {
      return this._swapToRatioRouter;
    } else {
      throw 'swapToRatioRouter not initialized';
    }
  }

  get tokenProvider() {
    if (this._tokenProvider) {
      return this._tokenProvider;
    } else {
      throw 'tokenProvider not initialized';
    }
  }

  get poolProvider() {
    if (this._poolProvider) {
      return this._poolProvider;
    } else {
      throw 'poolProvider not initialized';
    }
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
      chainId == ChainId.MAINNET ? process.env.JSON_RPC_PROVIDER! : process.env.JSON_RPC_PROVIDER_RINKEBY!,
      chainName
    );
    
    const tokenCache = new NodeJSCache<Token>(new NodeCache({ stdTTL: 3600, useClones: false }));

    let tokenListProvider: CachingTokenListProvider;
    if (tokenListURI) {
      tokenListProvider = await CachingTokenListProvider.fromTokenListURI(
        chainId,
        tokenListURI,
        tokenCache
      );
    } else {
      tokenListProvider = await CachingTokenListProvider.fromTokenList(
        chainId,
        DEFAULT_TOKEN_LIST,
        tokenCache
      );
    }

    const multicall2Provider = new UniswapMulticallProvider(chainId, provider);
    this._poolProvider = new PoolProvider(chainId, multicall2Provider);

    // initialize tokenProvider
    const tokenProviderOnChain = new TokenProvider(chainId, multicall2Provider);
    this._tokenProvider = new CachingTokenProviderWithFallback(
      chainId,
      tokenCache,
      tokenListProvider,
      tokenProviderOnChain
    );

    if (routerStr == 'legacy') {
      this._router = new LegacyRouter({
        chainId,
        multicall2Provider,
        poolProvider: new PoolProvider(chainId, multicall2Provider),
        quoteProvider: new QuoteProvider(chainId, provider, multicall2Provider),
        tokenProvider: this.tokenProvider,
      });
    } else {
      const subgraphCache = new NodeJSCache<SubgraphPool[]>(new NodeCache({ stdTTL: 900, useClones: true }));
      const poolCache = new NodeJSCache<Pool>(new NodeCache({ stdTTL: 900, useClones: true }));
      const gasPriceCache = new NodeJSCache<GasPrice>(new NodeCache({ stdTTL: 15, useClones: true }));
      
      const router = new AlphaRouter({
        provider,
        chainId,
        subgraphProvider: new CachingSubgraphProvider(chainId, 
          new URISubgraphProvider(chainId, 'https://ipfs.io/ipfs/QmfArMYESGVJpPALh4eQXnjF8HProSF1ky3v8RmuYLJZT4'),
          subgraphCache
        ),
        multicall2Provider: multicall2Provider,
        poolProvider: new CachingPoolProvider(chainId,
          new PoolProvider(chainId, multicall2Provider),
          poolCache
        ),
        quoteProvider: new QuoteProvider(
          chainId,
          provider,
          multicall2Provider,
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
        gasPriceProvider: new CachingGasStationProvider(chainId,
          new EIP1559GasPriceProvider(provider),
          gasPriceCache
        ),
        gasModelFactory: new HeuristicGasModelFactory(),
        tokenProvider: this.tokenProvider,
      });

      this._swapToRatioRouter = router;
      this._router = router;
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
    this.logger.info(`\tGas Adjusted Quote In:`);
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
