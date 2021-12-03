import { CurrencyAmount, Currency } from '@uniswap/sdk-core';
import { SwapRouter02__factory } from '../types/other';
import { IMulticallProvider } from './multicall-provider';
import { ProviderConfig } from './provider';

type ApprovalTypes = {
	approvalTokenIn: number;
	approvalTokenOut: number;
}

const SWAP_ROUTER_ADDRESS = '0x075B36dE1Bd11cb361c5B3B1E80A9ab0e7aa8a60'

/**
 * Provider for accessing the SwapRouter02 Contract .
 *
 * @export
 * @interface IRouterProvider
 */
export interface ISwapRouterProvider {
  /**
   * Gets the token at each address. Any addresses that are not valid ERC-20 are ignored.
   *
   * @param addresses The token addresses to get.
   * @param [providerConfig] The provider config.
   * @returns A token accessor with methods for accessing the tokens.
   */
  getApprovalType(
		tokenInAmount: CurrencyAmount<Currency>,
    tokenOutAmount: CurrencyAmount<Currency>,
  ): Promise<ApprovalTypes>;
}

export class SwapRouterProvider implements ISwapRouterProvider {
  constructor(
    protected multicall2Provider: IMulticallProvider
  ) {}

  public async getApprovalType(
    tokenInAmount: CurrencyAmount<Currency>,
    tokenOutAmount: CurrencyAmount<Currency>,
  ): Promise<ApprovalTypes> {
		const functionParams: [string, string][] = [
			[tokenInAmount.currency.wrapped.address, tokenInAmount.quotient.toString()],
			[tokenOutAmount.currency.wrapped.address, tokenOutAmount.quotient.toString()],
		]

		const tx = await this.multicall2Provider.callSameFunctionOnContractWithMultipleParams<
			[string, string],
			number
		>({
			address: SWAP_ROUTER_ADDRESS,
			contractInterface: SwapRouter02__factory.createInterface(),
			functionName: 'getApprovalType',
			functionParams,
		})

		if (tx.results[0]?.success && tx.results[1]?.success) {
			const resultTokenIn = tx.results![0]
			const resultTokenOut = tx.results![1]
			// TODO: Dealing with return values.
			// return { approvalTokenIn: resultTokenIn?.result![0]!, approvalTokenOut: resultTokenOut?.result![0]!}
		}
		return { approvalTokenIn: 1, approvalTokenOut: 1}
  }
}
