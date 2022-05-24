import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers'
import { Currency, CurrencyAmount } from '@uniswap/sdk-core'
import hre from 'hardhat'
import { Erc20 } from '../../src/types/other/Erc20'
import { Erc20__factory } from '../../src/types/other/factories/Erc20__factory';

const WHALES = [
  '0xBE0eB53F46cd790Cd13851d5EFf43D12404d33E8',
  '0x6555e1cc97d3cba6eaddebbcd7ca51d75771e0b8',
  '0x08638ef1a205be6762a8b935f5da9b700cf7322c',
  '0xe8e8f41ed29e46f34e206d7d2a7d6f735a3ff2cb',
  '0x72a53cdbbcc1b9efa39c834a540550e23463aacb',
  '0xbebc44782c7db0a1a60cb6fe97d0b483032ff1c7',
  '0x40ec5b33f54e0e8a33a975908c5ba1c14e5bbbdf',
  '0x1e3d6eab4bcf24bcd04721caa11c478a2e59852d',
  '0x28C6c06298d514Db089934071355E5743bf21d60',
  '0xF977814e90dA44bFA03b6295A0616a897441aceC',
  '0x5d3a536e4d6dbd6114cc1ead35777bab948e3643',
  '0x2775b1c75658be0f640272ccb8c72ac986009e38',
  '0x28c6c06298d514db089934071355e5743bf21d60',
  '0x47ac0fb4f2d84898e4d9e7b4dab3c24507a6d503',
]

const { ethers } = hre

export const resetAndFundAtBlock = async (
  alice: SignerWithAddress,
  blockNumber: number,
  currencyAmounts: CurrencyAmount<Currency>[]
): Promise<SignerWithAddress> => {
  await hre.network.provider.request({
    method: 'hardhat_reset',
    params: [
      {
        forking: {
          jsonRpcUrl: process.env.ARCHIVE_NODE_RPC,
          blockNumber,
        },
      },
    ],
  })

  for (const whale of WHALES) {
    await hre.network.provider.request({
      method: 'hardhat_impersonateAccount',
      params: [whale],
    })
  }

  for (const currencyAmount of currencyAmounts) {
    const currency = currencyAmount.currency
    const amount = currencyAmount.toExact()

    if (currency.isNative) {
      // Requested funding was for ETH. Hardhat prefunds Alice with 1000 Eth.
      return alice
    }

    for (let i = 0; i < WHALES.length; i++) {
      const whale = WHALES[i]
      const whaleAccount = ethers.provider.getSigner(whale)
      try {
        const whaleToken: Erc20 = Erc20__factory.connect(currency.wrapped.address, whaleAccount)

        await whaleToken.transfer(alice.address, ethers.utils.parseUnits(amount, currency.decimals))

        break
      } catch (err) {
        if (i == WHALES.length - 1) {
          throw new Error(`Could not fund ${amount} ${currency.symbol} from any whales.`)
        }
      }
    }
  }

  return alice
}
