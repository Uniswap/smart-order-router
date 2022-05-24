import '@nomiclabs/hardhat-ethers';

import * as dotenv from 'dotenv';

dotenv.config();

module.exports = {
  defaultNetwork: 'hardhat',
  networks: {
    hardhat: {
      forking: {
        enabled: true,
        url: `${process.env.ARCHIVE_NODE_RPC}`
      },
    },
  },
}
