/** @type {import('jest').Config} */
const baseConfig = require('./jest.config');

module.exports = {
  ...baseConfig,
  testRegex: '.*\.integration\.spec\.ts$',
  testPathIgnorePatterns: [],
};
