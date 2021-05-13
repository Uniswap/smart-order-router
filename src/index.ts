import { Command, flags } from '@oclif/command';
import { ChainId, Token } from '@uniswap/sdk-core';
import _ from 'lodash';
import { ethers } from 'ethers';

import {
  CHAIN_IDS_LIST,
  ID_TO_CHAIN_ID,
  ID_TO_NETWORK_NAME,
} from './util/chains';
import { parseAmount } from './util/amounts';
import { getToken } from './util/tokens';
import {
  RouterId,
  ROUTER_IDS_LIST,
  ROUTER_MAPPING,
} from './routers/router-mapping';
import bunyan from 'bunyan';
import Logger from 'bunyan';
import { Multicall2Provider } from './providers/multicall';
import { PoolProvider } from './providers/pool-provider';
import { QuoteProvider } from './providers/quote-provider';
import { routeToString } from './util/routes';
export class UniswapSORCLI extends Command {
  static description = 'Uniswap Smart Order Router CLI';

  static flags = {
    // add --version flag to show CLI version
    version: flags.version({ char: 'v' }),
    help: flags.help({ char: 'h' }),
    tokenIn: flags.string({ char: 'i', required: true }),
    tokenOut: flags.string({ char: 'o', required: true }),
    amountIn: flags.string({ char: 'a', required: true }),
    router: flags.string({
      char: 's',
      required: false,
      default: RouterId.V3Interface,
      options: ROUTER_IDS_LIST,
    }),
    chainId: flags.integer({
      char: 'c',
      required: false,
      default: ChainId.MAINNET,
      options: CHAIN_IDS_LIST,
    }),
    debug: flags.boolean(),
  };

  async run() {
    const { flags } = this.parse(UniswapSORCLI);
    const {
      tokenIn: tokenInStr,
      tokenOut: tokenOutStr,
      chainId: chainIdNumb,
      router: routerStr,
      amountIn: amountInStr,
      debug,
    } = flags;

    const log: Logger = bunyan.createLogger({
      name: 'Uniswap SOR',
      level: debug ? bunyan.DEBUG : bunyan.INFO,
    });

    const chainId = ID_TO_CHAIN_ID(chainIdNumb);
    const chainName = ID_TO_NETWORK_NAME(chainIdNumb);

    const tokenIn: Token = getToken(chainId, tokenInStr);
    const tokenOut: Token = getToken(chainId, tokenOutStr);

    const provider = new ethers.providers.InfuraProvider(
      chainName,
      '791a3ffe36f346b8ae11ca3acba32142'
    );

    const multicall2Provider = new Multicall2Provider(provider, log);
    const poolProvider = new PoolProvider(multicall2Provider, log);
    const quoteProvider = new QuoteProvider(multicall2Provider, log);

    const RouterClass = ROUTER_MAPPING(routerStr);
    const strategy = new RouterClass({
      log,
      chainId,
      poolProvider,
      multicall2Provider,
      quoteProvider,
    });

    const amountIn = parseAmount(amountInStr, tokenIn);

    const routeAndQuote = await strategy.routeExactIn(
      tokenIn,
      tokenOut,
      amountIn
    );

    if (!routeAndQuote) {
      log.info(`Could not find route.`);
      return;
    }

    const { route, quote } = routeAndQuote;

    log.info(`Best Route: ${routeToString(route)}`);
    log.info(`Best Amount Out: ${quote.toFixed(2)}`);
  }
}
