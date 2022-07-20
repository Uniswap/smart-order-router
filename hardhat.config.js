require('@nomiclabs/hardhat-ethers');

const dotenv = require('dotenv');

dotenv.config();

const mainnetFork = {
  url: `${process.env.JSON_RPC_PROVIDER}`,
};

module.exports = {
  networks: {
    hardhat: {
      chainId: 1,
      blockGasLimit: 150_000_000,
      forking: mainnetFork,
      accounts: {
        count: 2,
      },
    },
  },
};
