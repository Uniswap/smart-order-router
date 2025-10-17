import { Token } from '@uniswap/sdk-core';

import { SimulationStatus, VIRTUAL_BASE } from '../providers';

export function breakDownTenderlySimulationError(
  tokenIn: Token,
  tokenOut: Token,
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
      case '0x08c379a0000000000000000000000000000000000000000000000000000000000000002000000000000000000000000000000000000000000000000000000000000000145452414e534645525f46524f4d5f4641494c4544000000000000000000000000': // TRANSFER_FROM_FAILED
        return SimulationStatus.TransferFromFailed;
      case '0x675cae38': // InsufficientToken
        if (
          tokenIn.address.toLowerCase() ===
            VIRTUAL_BASE.address.toLowerCase() ||
          tokenOut.address.toLowerCase() === VIRTUAL_BASE.address.toLowerCase()
        ) {
          // if this is from virtual, we'd guess it's due to slippage too low, although it might be due to something else
          return SimulationStatus.SlippageTooLow;
        }

        // Otherwise we don't wanna guess, just return generic failed.
        return SimulationStatus.Failed;
      default: // we don't know why onchain execution reverted, just return generic failed.
        return SimulationStatus.Failed;
    }
  }

  return SimulationStatus.Failed;
}
