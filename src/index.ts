import { Command, flags } from '@oclif/command';
import { ChainId, Token } from '@uniswap/sdk-core';
import _ from 'lodash';
import { ethers } from 'ethers';
import DEFAULT_TOKEN_LIST from '@uniswap/default-token-list';

import {
  CHAIN_IDS_LIST,
  ID_TO_CHAIN_ID,
  ID_TO_NETWORK_NAME,
} from './util/chains';
import { parseAmount } from './util/amounts';
import { TokenProvider } from './util/tokens';
import {
  RouterId,
  ROUTER_IDS_LIST,
  RouterFactory,
} from './routers/router-factory';
import bunyan from 'bunyan';
import Logger from 'bunyan';
import { routeToString } from './util/routes';
export class UniswapSORCLI extends Command {
  static description = 'Uniswap Smart Order Router CLI';

  static flags = {
    // add --version flag to show CLI version
    version: flags.version({ char: 'v' }),
    help: flags.help({ char: 'h' }),
    tokenIn: flags.string({ char: 'i', required: true }),
    tokenOut: flags.string({ char: 'o', required: true }),
    amount: flags.string({ char: 'a', required: true }),
    exactIn: flags.boolean({ required: false }),
    exactOut: flags.boolean({ required: false }),
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
    tokenListUrl: flags.string({
      required: false,
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
      amount: amountStr,
      exactIn,
      exactOut,
      tokenListUrl,
      debug,
    } = flags;

    if ((exactIn && exactOut) || (!exactIn && !exactOut)) {
      throw new Error('Must set --exactIn or --exactOut.');
    }

    const log: Logger = bunyan.createLogger({
      name: 'Uniswap Smart Order Router',
      level: debug ? bunyan.DEBUG : bunyan.INFO,
    });

    const chainId = ID_TO_CHAIN_ID(chainIdNumb);
    const chainName = ID_TO_NETWORK_NAME(chainIdNumb);

    const provider = new ethers.providers.InfuraProvider(
      chainName,
      '791a3ffe36f346b8ae11ca3acba32142'
    );

    let tokenProvider: TokenProvider;
    if (tokenListUrl) {
      tokenProvider = await TokenProvider.fromTokenListUrl(tokenListUrl, log);
    } else {
      tokenProvider = await TokenProvider.fromTokenList(
        DEFAULT_TOKEN_LIST,
        log
      );
    }

    const tokenIn: Token = tokenProvider.getToken(chainId, tokenInStr);
    const tokenOut: Token = tokenProvider.getToken(chainId, tokenOutStr);

    const router = RouterFactory(
      routerStr,
      chainId,
      provider,
      tokenProvider,
      log
    );

    let routeAndQuote;
    if (exactIn) {
      const amountIn = parseAmount(amountStr, tokenIn);
      routeAndQuote = await router.routeExactIn(tokenIn, tokenOut, amountIn);
    } else {
      const amountOut = parseAmount(amountStr, tokenOut);
      routeAndQuote = await router.routeExactOut(tokenIn, tokenOut, amountOut);
    }

    if (!routeAndQuote) {
      log.error(
        `Could not find route. ${
          debug ? '' : 'Run in debug mode for more info'
        }.`
      );
      return;
    }

    const { route, quote } = routeAndQuote;

    log.info(`Best Route: ${routeToString(route)}`);
    log.info(`Best Amount Out: ${quote.toFixed(2)}`);
  }
}
