require('@nomiclabs/hardhat-ethers')

const dotenv = require('dotenv');

dotenv.config();

const mainnetFork = {
    url: `${process.env.JSON_RPC_PROVIDER}`,
    blockNumber: 14390000,
}

module.exports = {
    networks: {
        hardhat: {
            blockGasLimit: 150_000_000,
            chainId: 1,
            forking: mainnetFork,
            accounts: {
                count: 2,
            },
        },
    },
}