import { Token, TradeType } from '@uniswap/sdk-core';
import Logger from 'bunyan';
import { BigNumber } from 'ethers';
import { CurrencyAmount } from '../../../util/amounts';
import { routeToString } from '../../../util/routes';
import { RouteSOR } from '../../router';
import { GasModel } from '../gas-models/gas-model';

export type RouteWithValidQuoteParams = {
  amount: CurrencyAmount;
  rawQuote: BigNumber;
  sqrtPriceX96AfterList: BigNumber[];
  initializedTicksCrossedList: number[];
  quoterGasEstimate: BigNumber;
  percent: number;
  route: RouteSOR;
  gasModel: GasModel;
  quoteToken: Token;
  tradeType: TradeType;
  log: Logger;
};

export class RouteWithValidQuote {
  public amount: CurrencyAmount;
  public rawQuote: BigNumber;
  public quote: CurrencyAmount;
  public quoteAdjustedForGas: CurrencyAmount;
  public sqrtPriceX96AfterList: BigNumber[];
  public initializedTicksCrossedList: number[];
  public quoterGasEstimate: BigNumber;
  public percent: number;
  public route: RouteSOR;
  public quoteToken: Token;
  public gasModel: GasModel;
  public gasEstimate: BigNumber;
  public gasCostInToken: CurrencyAmount;
  public tradeType: TradeType;

  private log: Logger;

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
    log,
  }: RouteWithValidQuoteParams) {
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
    this.log = log;

    const { gasEstimate, gasCostInToken } =
      this.gasModel.estimateGasCostInTermsOfToken(this);

    this.gasCostInToken = gasCostInToken;
    this.gasEstimate = gasEstimate;

    this.log.debug(
      `Route: ${routeToString(this.route)} Percent: ${
        this.percent
      } Quote: ${this.quote.toFixed(4)}, GasCost: ${gasCostInToken.toFixed(4)}`
    );

    // If its exact out, we need to request *more* of the input token to account for the gas.
    if (this.tradeType == TradeType.EXACT_INPUT) {
      const quoteGasAdjusted = this.quote.subtract(gasCostInToken);
      this.quoteAdjustedForGas = quoteGasAdjusted;
      //  this.quoteAdjustedForGas = quoteGasAdjusted.greaterThan(0)
      //   ? quoteGasAdjusted
      //   : CurrencyAmount.fromRawAmount(this.quoteToken, 0);
    } else {
      const quoteGasAdjusted = this.quote.add(gasCostInToken);
      this.quoteAdjustedForGas = quoteGasAdjusted;
      // this.quoteAdjustedForGas = quoteGasAdjusted.greaterThan(0)
      //   ? quoteGasAdjusted
      //   : CurrencyAmount.fromRawAmount(this.quoteToken, 0);
    }
  }
}
