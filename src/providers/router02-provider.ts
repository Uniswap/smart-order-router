import { CurrencyAmount, Currency } from '@uniswap/sdk-core';
import { SwapRouter02__factory } from '../types/other';
// import { ChainId } from '../util';
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
export interface IRouterProvider {
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
    providerConfig?: ProviderConfig
  ): Promise<ApprovalTypes>;
}

export class RouterProvider implements IRouterProvider {
  constructor(
    protected multicall2Provider: IMulticallProvider
  ) {}

  public async getApprovalType(
    tokenInAmount: CurrencyAmount<Currency>,
    tokenOutAmount: CurrencyAmount<Currency>,
    providerConfig?: ProviderConfig
  ): Promise<ApprovalTypes> {
		const functionParams = [
			[tokenInAmount.currency.wrapped.address, tokenInAmount.quotient.toString()]
			[tokenOutAmount.currency.wrapped.address, tokenOutAmount.quotient.toString()]
		]

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

  }
}
