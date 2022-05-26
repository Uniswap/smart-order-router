/** @type {import('@ts-jest/dist/types').InitialOptionsTsJest} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  moduleFileExtensions: ['js', 'jsx', 'ts', 'tsx', 'json', 'node', 'd.ts'],
  setupFilesAfterEnv: ['./setup-jest.ts'],
  // testEnvironment: "@uniswap/jest-environment-hardhat"
};
