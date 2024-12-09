import { SimulationStatus } from '../providers';

export function breakDownTenderlySimulationError(
  data?: string
): SimulationStatus {
  if (data) {
    switch (data) {
      case '0x739dbe52': // V3TooMuchRequested
      case '0x39d35496': // V3TooLittleReceived
      case '0x849eaf98': // V2TooLittleReceived
      case '0x8ab0bc16': // V2TooMuchRequested
      case '0x08c379a000000000000000000000000000000000000000000000000000000000000000200000000000000000000000000000000000000000000000000000000000000025556e697377617056323a20494e53554646494349454e545f4f55545055545f414d4f554e54000000000000000000000000000000000000000000000000000000': // INSUFFICIENT_OUTPUT_AMOUNT
      case '0x08c379a0000000000000000000000000000000000000000000000000000000000000002000000000000000000000000000000000000000000000000000000000000000034949410000000000000000000000000000000000000000000000000000000000': // IIA
        return SimulationStatus.SlippageTooLow;
      default: // we don't know why onchain execution reverted, just return generic failed.
        return SimulationStatus.Failed;
    }
  }

  return SimulationStatus.Failed;
}
