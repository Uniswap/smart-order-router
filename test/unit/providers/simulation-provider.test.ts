import { JsonRpcProvider } from '@ethersproject/providers';
import { Trade } from '@uniswap/router-sdk';
import { Percent } from '@uniswap/sdk-core';
import { BigNumber } from 'ethers';
import sinon from 'sinon';
import {
    ChainId,
  CurrencyAmount,
  EthEstimateGasSimulator,
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

const provider = sinon.createStubInstance(JsonRpcProvider);
const v2PoolProvider = sinon.createStubInstance(V2PoolProvider);
const v3PoolProvider = sinon.createStubInstance(V3PoolProvider);
const fromAddress = 'fromAddress';
const amount = sinon.createStubInstance(CurrencyAmount);
const quote = sinon.createStubInstance(CurrencyAmount);
const estimatedGasUsed = BigNumber.from(0);
const trade = sinon.createStubInstance(Trade);
const route: RouteWithValidQuote[] = [];
const blockNumber = BigNumber.from(0);
const swapOptions: SwapOptions = {
    type: SwapType.UNIVERSAL_ROUTER,
    slippageTolerance: new Percent(5, 100),
    deadlineOrPreviousBlockhash: 10000000,
    recipient: '0x0',
};

describe('fallback tenderly simulator', () => {
  let simulator: FallbackTenderlySimulator;
  let tenderlySimulator: sinon.SinonStubbedInstance<TenderlySimulator>;
  let simulateTxStub: sinon.SinonStub;

  const swaproute: SwapRoute = {
    quote: quote,
    quoteGasAdjusted: quote,
    estimatedGasUsed: estimatedGasUsed,
    estimatedGasUsedQuoteToken: quote,
    estimatedGasUsedUSD: quote,
    gasPriceWei: estimatedGasUsed,
    trade: trade,
    route: route,
    blockNumber: blockNumber,
    simulationStatus: SimulationStatus.Succeeded,
  };

  beforeAll(() => {
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
    simulateTxStub.resolves(swaproute);
  });

  afterEach(() => {
    sinon.restore();
  });

  test('simulates when user has sufficient balance', async () => {
    sinon.stub(simulator, <any>'userHasSufficientBalance').resolves(true);
    const swapRoute = await simulator.simulate(
      fromAddress,
      swapOptions,
      swaproute,
      amount,
      quote
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
      fromAddress,
      swapOptions,
      swaproute,
      amount,
      quote
    );
    expect(simulateTxStub.called).toBeFalsy();
    expect(swapRoute.simulationStatus).toEqual(SimulationStatus.Unattempted);
  });
});
describe('Eth estimate gas simulator', () => {
    const chainId = ChainId.MAINNET;
    const simulator = new EthEstimateGasSimulator(chainId, provider, v2PoolProvider, v3PoolProvider);
    let ethEstimateGasStub: sinon.SinonStub;
    let simulateTxStub: sinon.SinonStub;

    const swaproute: SwapRoute = {
        quote: quote,
        quoteGasAdjusted: quote,
        estimatedGasUsed: estimatedGasUsed,
        estimatedGasUsedQuoteToken: quote,
        estimatedGasUsedUSD: quote,
        gasPriceWei: estimatedGasUsed,
        trade: trade,
        route: route,
        blockNumber: blockNumber,
        simulationStatus: SimulationStatus.Succeeded,
    };

    beforeEach(() => {
        simulateTxStub = sinon.stub(simulator, <any>'simulateTransaction');
        simulateTxStub.resolves(swaproute);
        ethEstimateGasStub = sinon.stub(simulator, <any>'ethEstimateGas');
        ethEstimateGasStub.resolves(swaproute)
    });
    
    afterEach(() => {
        sinon.restore();
    });
    test('simulates when user has sufficient balance and token is approved', async () => {
        sinon.stub(simulator, <any>'userHasSufficientBalance').resolves(true);
        sinon.stub(
            simulator,
            <any>'checkTokenApproved',
        ).resolves(true);
        const swapRoute = await simulator.simulate(
            fromAddress,
            swapOptions,
            swaproute,
            amount,
            quote
        );
        expect(simulateTxStub.calledOnce).toBeTruthy();
        expect(ethEstimateGasStub.calledOnce).toBeTruthy();
        expect(swapRoute.simulationStatus).toEqual(SimulationStatus.Succeeded);
    });
    test('does not simulate when user does not have sufficient balance', async () => {
        sinon.stub(
            simulator,
            <any>'userHasSufficientBalance',
        ).resolves(false);
        sinon.stub(
            simulator,
            <any>'checkTokenApproved',
        ).resolves(true);
        const swapRoute = await simulator.simulate(
            fromAddress,
            swapOptions,
            swaproute,
            amount,
            quote
        );
        expect(simulateTxStub.called).toBeFalsy();
        expect(ethEstimateGasStub.calledOnce).toBeFalsy();
        expect(swapRoute.simulationStatus).toEqual(SimulationStatus.Unattempted);
    });

    test('does not simulate when token is not approved', async () => {
        sinon.stub(
            simulator,
            <any>'userHasSufficientBalance',
        ).resolves(true);
        sinon.stub(
            simulator,
            <any>'checkTokenApproved',
        ).resolves(false);
        const swapRoute = await simulator.simulate(
            fromAddress,
            swapOptions,
            swaproute,
            amount,
            quote
        );
        expect(simulateTxStub.called).toBeTruthy();
        expect(ethEstimateGasStub.called).toBeFalsy();
    })
});
