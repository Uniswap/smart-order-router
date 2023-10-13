import { JsonRpcProvider } from '@ethersproject/providers';
import { Trade } from '@uniswap/router-sdk';
import { ChainId, Percent, TradeType } from '@uniswap/sdk-core';
import { BigNumber } from 'ethers';
import sinon from 'sinon';
import {
  CurrencyAmount,
  EthEstimateGasSimulator,
  FallbackTenderlySimulator,
  IV2PoolProvider,
  IV3PoolProvider,
  nativeOnChain,
  RouteWithValidQuote,
  SimulationStatus,
  SwapOptions,
  SwapRoute,
  SwapType,
  TenderlySimulator,
  USDC_MAINNET,
  V2PoolProvider,
} from '../../../src';
import { IPortionProvider, PortionProvider } from '../../../src/providers/portion-provider';
import { Erc20 } from '../../../src/types/other/Erc20';
import { Permit2 } from '../../../src/types/other/Permit2';

let tokenContract: Erc20;
let permit2Contract: Permit2;

jest.mock('../../../src/types/other/factories/Erc20__factory', () => ({
  Erc20__factory: {
    connect: () => tokenContract,
  },
}));
jest.mock('../../../src/types/other/factories/Permit2__factory', () => ({
  Permit2__factory: {
    connect: () => permit2Contract,
  },
}));
jest.mock('../../../src/util/gas-factory-helpers', () => ({
  calculateGasUsed: () => {
    return {
      estimatedGasUsedUSD: jest.fn(),
      estimatedGasUsedQuoteToken: jest.fn(),
      quoteGasAdjusted: jest.fn(),
    };
  },
  initSwapRouteFromExisting: (
    swapRoute: SwapRoute,
    _v2PoolProvider: IV2PoolProvider,
    _v3PoolProvider: IV3PoolProvider,
    _portionProvider: IPortionProvider,
    quoteGasAdjusted: CurrencyAmount,
    estimatedGasUsed: BigNumber,
    estimatedGasUsedQuoteToken: CurrencyAmount,
    estimatedGasUsedUSD: CurrencyAmount,
    _swapOptions?: SwapOptions,
  ): SwapRoute => {
    return {
      ...swapRoute,
      estimatedGasUsed,
      estimatedGasUsedQuoteToken,
      estimatedGasUsedUSD,
      quoteGasAdjusted,
    };
  },
}));

const provider = new JsonRpcProvider();
const v2PoolProvider = sinon.createStubInstance(V2PoolProvider);
const v3PoolAccessor = {
  getPool: () => undefined,
};
const v3PoolProvider = {
  getPools: jest.fn().mockImplementation(() => Promise.resolve(v3PoolAccessor)),
} as unknown as IV3PoolProvider;
const portionProvider = new PortionProvider();
const fromAddress = 'fromAddress';
const amount = CurrencyAmount.fromRawAmount(USDC_MAINNET, 300);
const trade = { inputAmount: amount, tradeType: TradeType.EXACT_INPUT };
const route: RouteWithValidQuote[] = [];
const quote = {
  currency: USDC_MAINNET,
} as unknown as CurrencyAmount;
const blockNumber = BigNumber.from(0);
const swapOptions: SwapOptions = {
  type: SwapType.UNIVERSAL_ROUTER,
  slippageTolerance: new Percent(5, 100),
  deadlineOrPreviousBlockhash: 10000000,
  recipient: '0x0',
};
const chainId = ChainId.MAINNET;

describe('Fallback Tenderly simulator', () => {
  let simulator: FallbackTenderlySimulator;
  let ethEstimateGasSimulator: sinon.SinonStubbedInstance<EthEstimateGasSimulator>;
  let tenderlySimulator: sinon.SinonStubbedInstance<TenderlySimulator>;
  const swaproute: SwapRoute = {
    quote: quote,
    quoteGasAdjusted: quote,
    estimatedGasUsed: BigNumber.from(100),
    estimatedGasUsedQuoteToken: quote,
    estimatedGasUsedUSD: quote,
    gasPriceWei: BigNumber.from(0),
    trade: trade as Trade<any, any, any>,
    route: route,
    blockNumber: blockNumber,
    simulationStatus: SimulationStatus.Succeeded,
    methodParameters: {
      calldata: '0x0',
      value: '0x0',
      to: '0x0',
    },
  };
  beforeEach(() => {
    sinon.stub(provider, 'estimateGas').resolves(BigNumber.from(100));
    ethEstimateGasSimulator = sinon.createStubInstance(
      EthEstimateGasSimulator,
      {
        ethEstimateGas: Promise.resolve(swaproute),
      }
    );
    tenderlySimulator = sinon.createStubInstance(TenderlySimulator, {
      simulateTransaction: Promise.resolve(swaproute),
    });
    simulator = new FallbackTenderlySimulator(
      chainId,
      provider,
      portionProvider,
      tenderlySimulator,
      ethEstimateGasSimulator
    );
    permit2Contract = {
      allowance: async () => {
        return {
          amount: BigNumber.from(325),
          expiration: 2147483647,
        };
      },
    } as unknown as Permit2;
  });

  afterEach(() => {
    sinon.restore();
  });
  test('simulates through eth estimate gas when user has sufficient balance and allowance', async () => {
    tokenContract = {
      balanceOf: async () => {
        return BigNumber.from(325);
      },
      allowance: async () => {
        return BigNumber.from(325);
      },
    } as unknown as Erc20;
    const swapRouteWithGasEstimate = await simulator.simulate(
      fromAddress,
      swapOptions,
      swaproute,
      amount,
      quote
    );
    expect(ethEstimateGasSimulator.ethEstimateGas.called).toBeTruthy();
    expect(tenderlySimulator.simulateTransaction.called).toBeFalsy();
    expect(swapRouteWithGasEstimate.simulationStatus).toEqual(
      SimulationStatus.Succeeded
    );
  });
  test('simulates through tenderly when user has sufficient balance but not allowance', async () => {
    tokenContract = {
      balanceOf: async () => {
        return BigNumber.from(325);
      },
      allowance: async () => {
        return BigNumber.from(0);
      },
    } as unknown as Erc20;
    const swapRouteWithGasEstimate = await simulator.simulate(
      fromAddress,
      swapOptions,
      swaproute,
      amount,
      quote
    );
    expect(ethEstimateGasSimulator.ethEstimateGas.called).toBeFalsy();
    expect(tenderlySimulator.simulateTransaction.called).toBeTruthy();
    expect(swapRouteWithGasEstimate.simulationStatus).toEqual(
      SimulationStatus.Succeeded
    );
  });
  test('does not simulate when user has insufficient balance', async () => {
    tokenContract = {
      balanceOf: async () => {
        return BigNumber.from(0);
      },
      allowance: async () => {
        return BigNumber.from(325);
      },
    } as unknown as Erc20;
    const swapRouteWithGasEstimate = await simulator.simulate(
      fromAddress,
      swapOptions,
      swaproute,
      amount,
      quote
    );
    expect(ethEstimateGasSimulator.ethEstimateGas.called).toBeFalsy();
    expect(tenderlySimulator.simulateTransaction.called).toBeFalsy();
    expect(swapRouteWithGasEstimate.simulationStatus).toEqual(
      SimulationStatus.InsufficientBalance
    );
  });
  test('when tenderly simulator throws', async () => {
    tokenContract = {
      balanceOf: async () => {
        return BigNumber.from(325);
      },
      allowance: async () => {
        return BigNumber.from(0);
      },
    } as unknown as Erc20;
    tenderlySimulator.simulateTransaction.throwsException();
    const swapRouteWithGasEstimate = await simulator.simulate(
      fromAddress,
      swapOptions,
      swaproute,
      amount,
      quote
    );
    expect(tenderlySimulator.simulateTransaction.called).toBeTruthy();
    expect(swapRouteWithGasEstimate.simulationStatus).toEqual(
      SimulationStatus.Failed
    );
  });
  test('when eth estimate gas simulator throws', async () => {
    tokenContract = {
      balanceOf: async () => {
        return BigNumber.from(325);
      },
      allowance: async () => {
        return BigNumber.from(325);
      },
    } as unknown as Erc20;
    ethEstimateGasSimulator.ethEstimateGas.throwsException();
    const swapRouteWithGasEstimate = await simulator.simulate(
      fromAddress,
      swapOptions,
      swaproute,
      amount,
      quote
    );
    expect(ethEstimateGasSimulator.ethEstimateGas.called).toBeTruthy();
    expect(swapRouteWithGasEstimate.simulationStatus).toEqual(
      SimulationStatus.Failed
    );
  });
});

describe('Eth estimate gas simulator', () => {
  let simulator: EthEstimateGasSimulator;

  const swaproute: SwapRoute = {
    quote: quote,
    quoteGasAdjusted: quote,
    estimatedGasUsed: BigNumber.from(100),
    estimatedGasUsedQuoteToken: quote,
    estimatedGasUsedUSD: quote,
    gasPriceWei: BigNumber.from(0),
    trade: trade as Trade<any, any, any>,
    route: route,
    blockNumber: blockNumber,
    simulationStatus: SimulationStatus.Succeeded,
    methodParameters: {
      calldata: '0x0',
      value: '0x0',
      to: '0x0',
    },
  };

  beforeEach(() => {
    simulator = new EthEstimateGasSimulator(
      chainId,
      provider,
      v2PoolProvider,
      v3PoolProvider,
      portionProvider
    );
    permit2Contract = {
      allowance: async () => {
        return {
          amount: BigNumber.from(325),
          expiration: 2147483647,
        };
      },
    } as unknown as Permit2;
    sinon.stub(provider, 'estimateGas').resolves(BigNumber.from(100));
  });

  afterEach(() => {
    sinon.restore();
  });
  test('simulates when user has sufficient balance and token is approved', async () => {
    tokenContract = {
      balanceOf: async () => {
        return BigNumber.from(3250000);
      },
      allowance: async () => {
        return BigNumber.from(3250000);
      },
    } as unknown as Erc20;
    const swapRouteWithGasEstimate = await simulator.simulate(
      fromAddress,
      swapOptions,
      swaproute,
      amount,
      quote
    );

    expect(swapRouteWithGasEstimate.simulationStatus).toEqual(
      SimulationStatus.Succeeded
    );
    expect(swapRouteWithGasEstimate.estimatedGasUsed).toEqual(
      BigNumber.from(120)
    );
  });
  test('simulates when user has sufficient balance and currency is native', async () => {
    tokenContract = {
      balanceOf: async () => {
        return BigNumber.from(0);
      },
      allowance: async () => {
        return BigNumber.from(0);
      },
    } as unknown as Erc20;
    sinon
      .stub(provider, <any>'getBalance')
      .resolves(BigNumber.from(325));
    const swapRouteWithGasEstimate = await simulator.simulate(
      fromAddress,
      swapOptions,
      {
        ...swaproute,
        trade: {
          tradeType: TradeType.EXACT_INPUT,
          inputAmount: CurrencyAmount.fromRawAmount(nativeOnChain(1), 0),
        } as Trade<any, any, any>,
      },
      CurrencyAmount.fromRawAmount(nativeOnChain(1), 1),
      quote
    );
    expect(swapRouteWithGasEstimate.simulationStatus).toEqual(
      SimulationStatus.Succeeded
    );
    expect(swapRouteWithGasEstimate.estimatedGasUsed).toEqual(
      BigNumber.from(120)
    );
  });
  test('does not simulate when user has sufficient balance and token is not approved', async () => {
    tokenContract = {
      balanceOf: async () => {
        return BigNumber.from(325);
      },
      allowance: async () => {
        return BigNumber.from(0);
      },
    } as unknown as Erc20;
    permit2Contract = {
      allowance: async () => {
        return {
          amount: BigNumber.from(0),
          expiration: 2147483647,
        };
      },
    } as unknown as Permit2;
    const swapRouteWithGasEstimate = await simulator.simulate(
      fromAddress,
      swapOptions,
      swaproute,
      amount,
      quote
    );
    expect(swapRouteWithGasEstimate.simulationStatus).toEqual(
      SimulationStatus.NotApproved
    );
    expect(swapRouteWithGasEstimate.estimatedGasUsed).toEqual(
      BigNumber.from(100)
    );
  });
  test('does not simulate when user has does not have sufficient balance', async () => {
    tokenContract = {
      balanceOf: async () => {
        return BigNumber.from(0);
      },
    } as unknown as Erc20;
    const swapRouteWithGasEstimate = await simulator.simulate(
      fromAddress,
      swapOptions,
      swaproute,
      amount,
      quote
    );
    expect(swapRouteWithGasEstimate.simulationStatus).toEqual(
      SimulationStatus.InsufficientBalance
    );
    expect(swapRouteWithGasEstimate.estimatedGasUsed).toEqual(
      BigNumber.from(100)
    );
  });
  test('when provider.estimateGas throws', async () => {
    sinon
      .stub(provider, <any>'getBalance')
      .resolves(BigNumber.from(325));
    sinon.replace(provider, 'estimateGas', () => {throw new Error()})
    const swapRouteWithGasEstimate = await simulator.simulate(
      fromAddress,
      swapOptions,
      {
        ...swaproute,
        trade: {
          tradeType: TradeType.EXACT_INPUT,
          inputAmount: CurrencyAmount.fromRawAmount(nativeOnChain(1), 0),
        } as Trade<any, any, any>,
      },
      CurrencyAmount.fromRawAmount(nativeOnChain(1), 1),
      quote
    );
    expect(swapRouteWithGasEstimate.simulationStatus).toEqual(
      SimulationStatus.Failed
    );
    expect(swapRouteWithGasEstimate.estimatedGasUsed).toEqual(
      BigNumber.from(100)
    );
  });
});
