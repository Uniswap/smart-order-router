require('@nomiclabs/hardhat-ethers');
require('dotenv').config();

const mainnetFork = {
  url: `${process.env.JSON_RPC_PROVIDER}`,
};

module.exports = {
  networks: {
    hardhat: {
      chainId: 1,
      forking: mainnetFork,
      accounts: {
        count: 2,
      },
    },
  },
};
