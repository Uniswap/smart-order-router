import { Token } from '@uniswap/sdk-core';
import Logger from 'bunyan';
import { BigNumber } from 'ethers';
import { CurrencyAmount } from '../../../util/amounts';
import { routeToString } from '../../../util/routes';
import { Route } from '../../router';
import { GasModel } from '../gas-models/gas-model';

export type RouteWithValidQuoteParams = {
  amount: CurrencyAmount;
  rawQuote: BigNumber;
  sqrtPriceX96AfterList: BigNumber[];
  initializedTicksCrossedList: number[];
  gasEstimate: BigNumber;
  percent: number;
  route: Route;
  gasModel: GasModel;
  quoteToken: Token;
  log: Logger;
};

export class RouteWithValidQuote {
  public amount: CurrencyAmount;
  public rawQuote: BigNumber;
  public quote: CurrencyAmount;
  public sqrtPriceX96AfterList: BigNumber[];
  public initializedTicksCrossedList: number[];
  public gasEstimate: BigNumber;
  public percent: number;
  public route: Route;
  public quoteToken: Token;
  public gasModel: GasModel;
  private log: Logger;

  constructor({
    amount,
    rawQuote,
    sqrtPriceX96AfterList,
    initializedTicksCrossedList,
    gasEstimate,
    percent,
    route,
    gasModel,
    quoteToken,
    log,
  }: RouteWithValidQuoteParams) {
    this.amount = amount;
    this.rawQuote = rawQuote;
    this.sqrtPriceX96AfterList = sqrtPriceX96AfterList;
    this.initializedTicksCrossedList = initializedTicksCrossedList;
    this.gasEstimate = gasEstimate;
    this.quote = CurrencyAmount.fromRawAmount(quoteToken, rawQuote.toString());
    this.percent = percent;
    this.route = route;
    this.gasModel = gasModel;
    this.quoteToken = quoteToken;
    this.log = log;
  }

  public get quoteAdjustedForGas(): CurrencyAmount {
    const gasCostInToken = this.gasModel.estimateGasCostInTermsOfToken(this);
    this.log.debug(
      `Route: ${routeToString(this.route)} Percent: ${
        this.percent
      } Quote: ${this.quote.toFixed(4)}, GasCost: ${gasCostInToken.toFixed(4)}`
    );

    return this.quote.subtract(gasCostInToken);
  }
}
