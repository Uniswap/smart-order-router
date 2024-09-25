import { BigNumber } from '@ethersproject/bignumber';
import { Protocol } from '@uniswap/router-sdk';
import { Currency, Token, TradeType } from '@uniswap/sdk-core';
import { Pool as V3Pool } from '@uniswap/v3-sdk';
import { Pool as V4Pool } from '@uniswap/v4-sdk';
import _ from 'lodash';

import { Pair } from '@uniswap/v2-sdk';
import { IV4PoolProvider } from '../../../providers';
import { IV2PoolProvider } from '../../../providers/v2/pool-provider';
import { IV3PoolProvider } from '../../../providers/v3/pool-provider';
import { CurrencyAmount } from '../../../util/amounts';
import { routeToString } from '../../../util/routes';
import {
  MixedRoute,
  SupportedRoutes,
  V2Route,
  V3Route,
  V4Route,
} from '../../router';
import { IGasModel } from '../gas-models/gas-model';

/**
 * Represents a route, a quote for swapping some amount on it, and other
 * metadata used by the routing algorithm.
 *
 * @export
 * @interface IRouteWithValidQuote
 * @template Route
 */
export interface IRouteWithValidQuote<Route extends SupportedRoutes> {
  amount: CurrencyAmount;
  percent: number;
  // If exact in, this is (quote - gasCostInToken). If exact out, this is (quote + gasCostInToken).
  quoteAdjustedForGas: CurrencyAmount;
  quote: CurrencyAmount;
  route: Route;
  gasEstimate: BigNumber;
  // The gas cost in terms of the quote token.
  gasCostInToken: CurrencyAmount;
  gasCostInUSD: CurrencyAmount;
  gasCostInGasToken?: CurrencyAmount;
  tradeType: TradeType;
  poolIdentifiers: string[];
  tokenPath: Currency[];
}

// Discriminated unions on protocol field to narrow types.
export type IV2RouteWithValidQuote = {
  protocol: Protocol.V2;
} & IRouteWithValidQuote<V2Route>;

export type IV3RouteWithValidQuote = {
  protocol: Protocol.V3;
} & IRouteWithValidQuote<V3Route>;

export type IV4RouteWithValidQuote = {
  protocol: Protocol.V4;
} & IRouteWithValidQuote<V4Route>;

export type IMixedRouteWithValidQuote = {
  protocol: Protocol.MIXED;
} & IRouteWithValidQuote<MixedRoute>;

export type RouteWithValidQuote =
  | V2RouteWithValidQuote
  | V3RouteWithValidQuote
  | V4RouteWithValidQuote
  | MixedRouteWithValidQuote;

export type V2RouteWithValidQuoteParams = {
  amount: CurrencyAmount;
  rawQuote: BigNumber;
  percent: number;
  route: V2Route;
  gasModel: IGasModel<V2RouteWithValidQuote>;
  quoteToken: Token;
  tradeType: TradeType;
  v2PoolProvider: IV2PoolProvider;
};
/**
 * Represents a quote for swapping on a V2 only route. Contains all information
 * such as the route used, the amount specified by the user, the type of quote
 * (exact in or exact out), the quote itself, and gas estimates.
 *
 * @export
 * @class V2RouteWithValidQuote
 */
export class V2RouteWithValidQuote implements IV2RouteWithValidQuote {
  public readonly protocol = Protocol.V2;
  public amount: CurrencyAmount;
  // The BigNumber representing the quote.
  public rawQuote: BigNumber;
  public quote: CurrencyAmount;
  public quoteAdjustedForGas: CurrencyAmount;
  public percent: number;
  public route: V2Route;
  public quoteToken: Token;
  public gasModel: IGasModel<V2RouteWithValidQuote>;
  public gasEstimate: BigNumber;
  public gasCostInToken: CurrencyAmount;
  public gasCostInUSD: CurrencyAmount;
  public gasCostInGasToken?: CurrencyAmount;
  public tradeType: TradeType;
  public poolIdentifiers: string[];
  public tokenPath: Token[];

  public toString(): string {
    return `${this.percent.toFixed(
      2
    )}% QuoteGasAdj[${this.quoteAdjustedForGas.toExact()}] Quote[${this.quote.toExact()}] Gas[${this.gasEstimate.toString()}] = ${routeToString(
      this.route
    )}`;
  }

  constructor({
    amount,
    rawQuote,
    percent,
    route,
    gasModel,
    quoteToken,
    tradeType,
    v2PoolProvider,
  }: V2RouteWithValidQuoteParams) {
    this.amount = amount;
    this.rawQuote = rawQuote;
    this.quote = CurrencyAmount.fromRawAmount(quoteToken, rawQuote.toString());
    this.percent = percent;
    this.route = route;
    this.gasModel = gasModel;
    this.quoteToken = quoteToken;
    this.tradeType = tradeType;

    const { gasEstimate, gasCostInToken, gasCostInUSD, gasCostInGasToken } =
      this.gasModel.estimateGasCost(this);

    this.gasCostInToken = gasCostInToken;
    this.gasCostInUSD = gasCostInUSD;
    this.gasEstimate = gasEstimate;
    this.gasCostInGasToken = gasCostInGasToken;

    // If its exact out, we need to request *more* of the input token to account for the gas.
    if (this.tradeType == TradeType.EXACT_INPUT) {
      const quoteGasAdjusted = this.quote.subtract(gasCostInToken);
      this.quoteAdjustedForGas = quoteGasAdjusted;
    } else {
      const quoteGasAdjusted = this.quote.add(gasCostInToken);
      this.quoteAdjustedForGas = quoteGasAdjusted;
    }

    this.poolIdentifiers = _.map(
      route.pairs,
      (p) => v2PoolProvider.getPoolAddress(p.token0, p.token1).poolAddress
    );

    this.tokenPath = this.route.path;
  }
}

export type V3RouteWithValidQuoteParams = {
  amount: CurrencyAmount;
  rawQuote: BigNumber;
  sqrtPriceX96AfterList: BigNumber[];
  initializedTicksCrossedList: number[];
  quoterGasEstimate: BigNumber;
  percent: number;
  route: V3Route;
  gasModel: IGasModel<V3RouteWithValidQuote>;
  quoteToken: Token;
  tradeType: TradeType;
  v3PoolProvider: IV3PoolProvider;
};

/**
 * Represents a quote for swapping on a V3 only route. Contains all information
 * such as the route used, the amount specified by the user, the type of quote
 * (exact in or exact out), the quote itself, and gas estimates.
 *
 * @export
 * @class V3RouteWithValidQuote
 */
export class V3RouteWithValidQuote implements IV3RouteWithValidQuote {
  public readonly protocol = Protocol.V3;
  public amount: CurrencyAmount;
  public rawQuote: BigNumber;
  public quote: CurrencyAmount;
  public quoteAdjustedForGas: CurrencyAmount;
  public sqrtPriceX96AfterList: BigNumber[];
  public initializedTicksCrossedList: number[];
  public quoterGasEstimate: BigNumber;
  public percent: number;
  public route: V3Route;
  public quoteToken: Token;
  public gasModel: IGasModel<V3RouteWithValidQuote>;
  public gasEstimate: BigNumber;
  public gasCostInToken: CurrencyAmount;
  public gasCostInUSD: CurrencyAmount;
  public gasCostInGasToken?: CurrencyAmount;
  public tradeType: TradeType;
  public poolIdentifiers: string[];
  public tokenPath: Token[];

  public toString(): string {
    return `${this.percent.toFixed(
      2
    )}% QuoteGasAdj[${this.quoteAdjustedForGas.toExact()}] Quote[${this.quote.toExact()}] Gas[${this.gasEstimate.toString()}] = ${routeToString(
      this.route
    )}`;
  }

  constructor({
    amount,
    rawQuote,
    sqrtPriceX96AfterList,
    initializedTicksCrossedList,
    quoterGasEstimate,
    percent,
    route,
    gasModel,
    quoteToken,
    tradeType,
    v3PoolProvider,
  }: V3RouteWithValidQuoteParams) {
    this.amount = amount;
    this.rawQuote = rawQuote;
    this.sqrtPriceX96AfterList = sqrtPriceX96AfterList;
    this.initializedTicksCrossedList = initializedTicksCrossedList;
    this.quoterGasEstimate = quoterGasEstimate;
    this.quote = CurrencyAmount.fromRawAmount(quoteToken, rawQuote.toString());
    this.percent = percent;
    this.route = route;
    this.gasModel = gasModel;
    this.quoteToken = quoteToken;
    this.tradeType = tradeType;

    const { gasEstimate, gasCostInToken, gasCostInUSD, gasCostInGasToken } =
      this.gasModel.estimateGasCost(this);

    this.gasCostInToken = gasCostInToken;
    this.gasCostInUSD = gasCostInUSD;
    this.gasEstimate = gasEstimate;
    this.gasCostInGasToken = gasCostInGasToken;

    // If its exact out, we need to request *more* of the input token to account for the gas.
    if (this.tradeType == TradeType.EXACT_INPUT) {
      const quoteGasAdjusted = this.quote.subtract(gasCostInToken);
      this.quoteAdjustedForGas = quoteGasAdjusted;
    } else {
      const quoteGasAdjusted = this.quote.add(gasCostInToken);
      this.quoteAdjustedForGas = quoteGasAdjusted;
    }

    this.poolIdentifiers = _.map(
      route.pools,
      (p) =>
        v3PoolProvider.getPoolAddress(p.token0, p.token1, p.fee).poolAddress
    );

    this.tokenPath = this.route.tokenPath;
  }
}

export type V4RouteWithValidQuoteParams = {
  amount: CurrencyAmount;
  rawQuote: BigNumber;
  sqrtPriceX96AfterList: BigNumber[];
  initializedTicksCrossedList: number[];
  quoterGasEstimate: BigNumber;
  percent: number;
  route: V4Route;
  quoteToken: Token;
  gasModel: IGasModel<V4RouteWithValidQuote>;
  tradeType: TradeType;
  v4PoolProvider: IV4PoolProvider;
};

export class V4RouteWithValidQuote implements IV4RouteWithValidQuote {
  public readonly protocol = Protocol.V4;
  public amount: CurrencyAmount;
  public rawQuote: BigNumber;
  public quote: CurrencyAmount;
  public quoteAdjustedForGas: CurrencyAmount; // TODO: Might be an array in V4 quoter v1
  public sqrtPriceX96AfterList: BigNumber[];
  public initializedTicksCrossedList: number[];
  public quoterGasEstimate: BigNumber; // TODO: not available in v4 quoter v1
  public percent: number;
  public route: V4Route;
  public quoteToken: Token;
  public gasModel: IGasModel<V4RouteWithValidQuote>;
  public gasEstimate: BigNumber;
  public gasCostInToken: CurrencyAmount;
  public gasCostInUSD: CurrencyAmount;
  public gasCostInGasToken?: CurrencyAmount;
  public tradeType: TradeType;
  public poolIdentifiers: string[];
  public tokenPath: Currency[];

  public toString(): string {
    return `${this.percent.toFixed(
      2
    )}% QuoteGasAdj[${this.quoteAdjustedForGas.toExact()}] Quote[${this.quote.toExact()}] Gas[${this.gasEstimate.toString()}] = ${routeToString(
      this.route
    )}`;
  }

  constructor({
    amount,
    rawQuote,
    sqrtPriceX96AfterList,
    initializedTicksCrossedList,
    quoterGasEstimate,
    percent,
    route,
    gasModel,
    quoteToken,
    tradeType,
    v4PoolProvider,
  }: V4RouteWithValidQuoteParams) {
    this.amount = amount;
    this.rawQuote = rawQuote;
    this.sqrtPriceX96AfterList = sqrtPriceX96AfterList;
    this.initializedTicksCrossedList = initializedTicksCrossedList;
    this.quoterGasEstimate = quoterGasEstimate;
    this.quote = CurrencyAmount.fromRawAmount(quoteToken, rawQuote.toString());
    this.percent = percent;
    this.route = route;
    this.gasModel = gasModel;
    this.quoteToken = quoteToken;
    this.tradeType = tradeType;

    const { gasEstimate, gasCostInToken, gasCostInUSD, gasCostInGasToken } =
      this.gasModel.estimateGasCost(this);

    this.gasCostInToken = gasCostInToken;
    this.gasCostInUSD = gasCostInUSD;
    this.gasEstimate = gasEstimate;
    this.gasCostInGasToken = gasCostInGasToken;

    // If its exact out, we need to request *more* of the input token to account for the gas.
    if (this.tradeType == TradeType.EXACT_INPUT) {
      const quoteGasAdjusted = this.quote.subtract(gasCostInToken);
      this.quoteAdjustedForGas = quoteGasAdjusted;
    } else {
      const quoteGasAdjusted = this.quote.add(gasCostInToken);
      this.quoteAdjustedForGas = quoteGasAdjusted;
    }

    this.poolIdentifiers = _.map(
      route.pools,
      (p) =>
        v4PoolProvider.getPoolId(
          p.token0,
          p.token1,
          p.fee,
          p.tickSpacing,
          p.hooks
        ).poolId
    );

    this.tokenPath = this.route.currencyPath;
  }
}

export type MixedRouteWithValidQuoteParams = {
  amount: CurrencyAmount;
  rawQuote: BigNumber;
  sqrtPriceX96AfterList: BigNumber[];
  initializedTicksCrossedList: number[];
  quoterGasEstimate: BigNumber;
  percent: number;
  route: MixedRoute;
  mixedRouteGasModel: IGasModel<MixedRouteWithValidQuote>;
  quoteToken: Token;
  tradeType: TradeType;
  v4PoolProvider: IV4PoolProvider;
  v3PoolProvider: IV3PoolProvider;
  v2PoolProvider: IV2PoolProvider;
};

/**
 * Represents a quote for swapping on a Mixed Route. Contains all information
 * such as the route used, the amount specified by the user, the type of quote
 * (exact in or exact out), the quote itself, and gas estimates.
 *
 * @export
 * @class MixedRouteWithValidQuote
 */
export class MixedRouteWithValidQuote implements IMixedRouteWithValidQuote {
  public readonly protocol = Protocol.MIXED;
  public amount: CurrencyAmount;
  public rawQuote: BigNumber;
  public quote: CurrencyAmount;
  public quoteAdjustedForGas: CurrencyAmount;
  public sqrtPriceX96AfterList: BigNumber[];
  public initializedTicksCrossedList: number[];
  public quoterGasEstimate: BigNumber;
  public percent: number;
  public route: MixedRoute;
  public quoteToken: Token;
  public gasModel: IGasModel<MixedRouteWithValidQuote>;
  public gasEstimate: BigNumber;
  public gasCostInToken: CurrencyAmount;
  public gasCostInUSD: CurrencyAmount;
  public gasCostInGasToken?: CurrencyAmount;
  public tradeType: TradeType;
  public poolIdentifiers: string[];
  public tokenPath: Currency[];

  public toString(): string {
    return `${this.percent.toFixed(
      2
    )}% QuoteGasAdj[${this.quoteAdjustedForGas.toExact()}] Quote[${this.quote.toExact()}] Gas[${this.gasEstimate.toString()}] = ${routeToString(
      this.route
    )}`;
  }

  constructor({
    amount,
    rawQuote,
    sqrtPriceX96AfterList,
    initializedTicksCrossedList,
    quoterGasEstimate,
    percent,
    route,
    mixedRouteGasModel,
    quoteToken,
    tradeType,
    v4PoolProvider,
    v3PoolProvider,
    v2PoolProvider,
  }: MixedRouteWithValidQuoteParams) {
    this.amount = amount;
    this.rawQuote = rawQuote;
    this.sqrtPriceX96AfterList = sqrtPriceX96AfterList;
    this.initializedTicksCrossedList = initializedTicksCrossedList;
    this.quoterGasEstimate = quoterGasEstimate;
    this.quote = CurrencyAmount.fromRawAmount(quoteToken, rawQuote.toString());
    this.percent = percent;
    this.route = route;
    this.gasModel = mixedRouteGasModel;
    this.quoteToken = quoteToken;
    this.tradeType = tradeType;

    const { gasEstimate, gasCostInToken, gasCostInUSD, gasCostInGasToken } =
      this.gasModel.estimateGasCost(this);

    this.gasCostInToken = gasCostInToken;
    this.gasCostInUSD = gasCostInUSD;
    this.gasEstimate = gasEstimate;
    this.gasCostInGasToken = gasCostInGasToken;

    // If its exact out, we need to request *more* of the input token to account for the gas.
    if (this.tradeType == TradeType.EXACT_INPUT) {
      const quoteGasAdjusted = this.quote.subtract(gasCostInToken);
      this.quoteAdjustedForGas = quoteGasAdjusted;
    } else {
      const quoteGasAdjusted = this.quote.add(gasCostInToken);
      this.quoteAdjustedForGas = quoteGasAdjusted;
    }

    this.poolIdentifiers = _.map(route.pools, (p) => {
      if (p instanceof V4Pool) {
        return v4PoolProvider.getPoolId(
          p.token0,
          p.token1,
          p.fee,
          p.tickSpacing,
          p.hooks
        ).poolId;
      } else if (p instanceof V3Pool) {
        return v3PoolProvider.getPoolAddress(p.token0, p.token1, p.fee)
          .poolAddress;
      } else if (p instanceof Pair) {
        return v2PoolProvider.getPoolAddress(p.token0, p.token1).poolAddress;
      } else {
        throw new Error(`Unknown pool type ${JSON.stringify(p)}`);
      }
    });

    this.tokenPath = this.route.path;
  }
}
