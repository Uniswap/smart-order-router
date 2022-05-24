require('@nomiclabs/hardhat-ethers')
require('dotenv').config()

module.exports = {
  defaultNetwork: 'hardhat',
  networks: {
    hardhat: {
      forking: {
        enabled: true,
        url: `${process.env.ARCHIVE_NODE_RPC}`,
      },
    },
  },
}
