/** @type {import('jest').Config} */
const baseConfig = require('./jest.config');

module.exports = {
  ...baseConfig,
  testRegex: '.*\.integration\.spec\.ts$',
  testPathIgnorePatterns: [],
  globalSetup: '<rootDir>/../../../packages/database/test/integration-sweep.js',
};
