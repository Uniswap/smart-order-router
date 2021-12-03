import { CurrencyAmount, Currency } from '@uniswap/sdk-core';
import { SwapRouter02__factory } from '../types/other';
import { IMulticallProvider } from './multicall-provider';
import { ProviderConfig } from './provider';

type ApprovalTypes = {
	tokenInApproval: number;
	tokenOutApproval: number;
}

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
		// const functionParams: string[][] = [
		// 	[tokenInAmount.currency.wrapped.address, tokenInAmount.quotient.toString()]
		// 	[tokenOutAmount.currency.wrapped.address, tokenOutAmount.quotient.toString()]
		// ]
		console.log(tokenInAmount)
		console.log(tokenOutAmount)

		// this.multicall2Provider.callSameFunctionOnContractWithMultipleParams<
		// 	[string, string],
		// 	[number]
		// >({
		// 	address,
		// 	contractInterface: SwapRouter02__factory.createInterface(),
		// 	functionName: 'getApprovalType',
		// 	functionParams,
		// 	providerConfig,
		// })
		return { tokenInApproval: 1, tokenOutApproval: 1}

  }
}
