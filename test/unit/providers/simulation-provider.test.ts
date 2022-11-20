import { JsonRpcProvider } from '@ethersproject/providers';
import { Trade } from '@uniswap/router-sdk';
import { Percent } from '@uniswap/sdk-core';
import { BigNumber } from 'ethers';
import sinon from 'sinon';
import {
  CurrencyAmount,
  FallbackTenderlySimulator,
  RouteWithValidQuote,
  SimulationStatus,
  SwapOptions,
  SwapRoute,
  SwapType,
  TenderlySimulator,
  V2PoolProvider,
  V3PoolProvider,
} from '../../../src';

describe('fallback tenderly simulator', () => {
  const fromAddressMock = 'fromAddress';
  const amountMock = sinon.createStubInstance(CurrencyAmount);
  const quoteMock = sinon.createStubInstance(CurrencyAmount);
  const estimatedGasUsedMock = BigNumber.from(0);
  const tradeMock = sinon.createStubInstance(Trade);
  const routeMock: RouteWithValidQuote[] = [];
  const blockNumberMock = BigNumber.from(0);

  let simulator: FallbackTenderlySimulator;
  let provider: sinon.SinonStubbedInstance<JsonRpcProvider>;
  let v2PoolProvider: sinon.SinonStubbedInstance<V2PoolProvider>;
  let v3PoolProvider: sinon.SinonStubbedInstance<V3PoolProvider>;
  let tenderlySimulator: sinon.SinonStubbedInstance<TenderlySimulator>;
  let simulateTxStub: sinon.SinonStub;

  const swapOptionsMock: SwapOptions = {
    type: SwapType.UNIVERSAL_ROUTER,
    slippageTolerance: new Percent(5, 100),
    deadlineOrPreviousBlockhash: 10000000,
    recipient: '0x0',
  };

  const swapRouteMock: SwapRoute = {
    quote: quoteMock,
    quoteGasAdjusted: quoteMock,
    estimatedGasUsed: estimatedGasUsedMock,
    estimatedGasUsedQuoteToken: quoteMock,
    estimatedGasUsedUSD: quoteMock,
    gasPriceWei: estimatedGasUsedMock,
    trade: tradeMock,
    route: routeMock,
    blockNumber: blockNumberMock,
    simulationStatus: SimulationStatus.Succeeded,
  };

  beforeAll(() => {
    provider = sinon.createStubInstance(JsonRpcProvider);
    v2PoolProvider = sinon.createStubInstance(V2PoolProvider);
    v3PoolProvider = sinon.createStubInstance(V3PoolProvider);
    tenderlySimulator = sinon.createStubInstance(TenderlySimulator);
    simulator = new FallbackTenderlySimulator(
      1,
      'base',
      'user',
      'project',
      'key',
      provider,
      v2PoolProvider,
      v3PoolProvider,
      tenderlySimulator
    );
  });

  beforeEach(() => {
    simulateTxStub = sinon.stub(simulator, <any>'simulateTransaction');
    simulateTxStub.resolves(swapRouteMock);
  });

  afterEach(() => {
    sinon.restore();
  });

  test('simulates when user has sufficient balance', async () => {
    sinon.stub(simulator, <any>'userHasSufficientBalance').resolves(true);
    const swapRoute = await simulator.simulate(
      fromAddressMock,
      swapOptionsMock,
      swapRouteMock,
      amountMock,
      quoteMock
    );
    expect(simulateTxStub.calledOnce).toBeTruthy();
    expect(swapRoute.simulationStatus).toEqual(SimulationStatus.Succeeded);
  });

  test('does not simulate when user does not have sufficient balance', async () => {
    sinon.replace(
      simulator,
      <any>'userHasSufficientBalance',
      async () => false
    );
    const swapRoute = await simulator.simulate(
      fromAddressMock,
      swapOptionsMock,
      swapRouteMock,
      amountMock,
      quoteMock
    );
    expect(simulateTxStub.called).toBeFalsy();
    expect(swapRoute.simulationStatus).toEqual(SimulationStatus.Unattempted);
  });
});
