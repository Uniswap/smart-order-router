export interface ISimulator {
    simulateTx: (
      chainId: number,
      hexData: string,
      tokenInAddress: string,
      fromAddress: string,
      blockNumber: number
    ) => Promise<TransactionReceipt|Error>
  }