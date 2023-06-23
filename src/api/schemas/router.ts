import { gql } from "apollo-server-express";

export const RouterTypeDefs = gql`
  extend type Query {
    getQuote(input: GetQuoteRequest!): Quote!
  }

  input GetQuoteRequest {
    tokenInAddress: String!
    tokenOutAddress: String!
    amount: BigInt!
    chain: Blockchain!
    type: TradeType!
    recipient: String
    slippageTolerance: String
    deadline: String
    algorithm: String
    gasPriceWei: String
    minSplits: Int
    # forceCrossProtocol?: Boolean
    # forceMixedRoutes?: Boolean
    # protocols?: String[] | String
    simulateFromAddress: String
    permitSignature: String
    permitNonce: String
    permitExpiration: String
    permitAmount: String
    permitSigDeadline: String
    enableUniversalRouter: Boolean
  }

  type Quote {
    quoteId: String!
    amount: String!
    amountDecimals: String!
    quote: String!
    quoteDecimals: String!
    quoteGasAdjusted: String!
    quoteGasAdjustedDecimals: String!
    gasUseEstimate: String!
    gasUseEstimateQuote: String!
    gasUseEstimateQuoteDecimals: String!
    gasUseEstimateUSD: String!
    simulationError: Boolean
    simulationStatus: String!
    gasPriceWei: String!
    blockNumber: String!
    route: [[V3PoolInRoute!]]
    routeString: String!
    methodParameters: MethodParameters
  }

  type V3PoolInRoute {
    address: String!
    tokenIn: TokenInRoute!
    tokenOut: TokenInRoute!
    sqrtRatioX96: String!
    liquidity: String!
    tickCurrent: String!
    fee: String!
    amountIn: String
    amountOut: String
  }

  type TokenInRoute {
    address: String!
    chainId: Int!
    symbol: String!
    decimals: String!
  }

  # Generated method parameters for executing a call.
  type MethodParameters {
    # The hex encoded calldata to perform the given operation
    calldata: String
    # The amount of ether (wei) to send in hex.
    value: String
  }

  enum TradeType {
    EXACT_IN
    EXACT_OUT
  }

  enum Blockchain {
    POLYGON,
    POLYGON_MUMBAI,
  }
`;
