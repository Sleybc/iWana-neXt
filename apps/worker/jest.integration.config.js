/** @type {import('jest').Config} */
const baseConfig = require('./jest.config');

module.exports = {
  ...baseConfig,
  testRegex: '.*\.integration\.spec\.ts$',
  testPathIgnorePatterns: [],
  globalSetup: '<rootDir>/../../../packages/database/test/integration-sweep.js',
  // B(a): ninguna prueba registra empresas fuera de `test` o de un clon iwana_it_*.
  setupFiles: [
    ...(baseConfig.setupFiles ?? []),
    '<rootDir>/../../../packages/database/test/integration-tenant-guard.js',
  ],
};
