<<<<<<< HEAD
import { JsonRpcProvider } from "@ethersproject/providers"
import { Trade } from "@uniswap/router-sdk"
import { BigNumber } from "ethers"
import sinon from "sinon";
import { TenderlySimulator, FallbackTenderlySimulator, V2PoolProvider, V3PoolProvider, SwapRoute, CurrencyAmount, RouteWithValidQuote, SimulationStatus } from "../../../src"
=======
import { JsonRpcProvider } from '@ethersproject/providers';
import { Trade } from '@uniswap/router-sdk';
import { Percent } from '@uniswap/sdk-core';
import { BigNumber } from 'ethers';
import sinon from 'sinon';
import {
  CurrencyAmount,
  FallbackTenderlySimulator,
  RouteWithValidQuote,
  SwapOptions,
  SwapRoute,
  TenderlySimulator,
  V2PoolProvider,
  V3PoolProvider,
} from '../../../src';
>>>>>>> 025526b (s)

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

<<<<<<< HEAD
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
        simulationStatus: SimulationStatus.Succeeded
    }

    beforeAll(() => {
        provider = sinon.createStubInstance(JsonRpcProvider)
        v2PoolProvider = sinon.createStubInstance(V2PoolProvider)
        v3PoolProvider = sinon.createStubInstance(V3PoolProvider)
        tenderlySimulator = sinon.createStubInstance(TenderlySimulator)
        simulator = new FallbackTenderlySimulator('base', 'user', 'project', 'key', provider, v2PoolProvider, v3PoolProvider, tenderlySimulator)
    })
    beforeEach(() => {
        simulateTxStub = sinon.stub(simulator, "simulateTransaction")
        simulateTxStub.resolvesArg(1)
    })
    afterEach(() => {
        sinon.restore()
    })
    test('simulates when user has sufficient balance', async () => {
        sinon.stub(simulator, "userHasSufficientBalance").resolves(true)
        const swapRoute = await simulator.simulate(fromAddressMock, swapRouteMock, amountMock, quoteMock)
        expect(simulateTxStub.calledOnce).toBeTruthy()
        expect(swapRoute.simulationStatus).toEqual(SimulationStatus.Succeeded)
    })
    test('does not simulate when user does not have sufficient balance', async () => {
        sinon.replace(simulator, "userHasSufficientBalance", async () => false)
        const swapRoute = await simulator.simulate(fromAddressMock, swapRouteMock, amountMock, quoteMock)
        expect(simulateTxStub.called).toBeFalsy()
        expect(swapRoute.simulationStatus).toEqual(SimulationStatus.Unattempted)
    })
})
=======
  const swapOptionsMock: SwapOptions = {
    slippageTolerance: new Percent(5, 100),
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
  };

  beforeAll(() => {
    provider = sinon.createStubInstance(JsonRpcProvider);
    v2PoolProvider = sinon.createStubInstance(V2PoolProvider);
    v3PoolProvider = sinon.createStubInstance(V3PoolProvider);
    tenderlySimulator = sinon.createStubInstance(TenderlySimulator);
    simulator = new FallbackTenderlySimulator(
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
    simulateTxStub.resolvesArg(2);
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
    expect(swapRoute.simulationError).toBeUndefined();
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
    expect(swapRoute.simulationError).toBeDefined();
  });
});
>>>>>>> 025526b (s)
