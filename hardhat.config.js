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
      forking: mainnetFork,
      accounts: {
        count: 2,
      },
    },
  },
};
