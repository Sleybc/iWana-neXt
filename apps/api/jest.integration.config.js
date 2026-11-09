const { resolveIntegrationWorkers } = require('../../packages/database/test/integration-worker-db');

// IWANA_IT_WORKERS > 1: un worker por base, con clones de
// scripts/db/clone-integration-dbs.sh (spec 2026-11-09-plat-ops-ci-integracion-api-tiempo).
// Sin la variable: un worker y una base, como antes.
const integrationWorkers = resolveIntegrationWorkers();

/** @type {import('jest').Config} */
module.exports = {
  moduleFileExtensions: ['ts', 'js', 'json'],
  rootDir: 'src',
  testRegex: '.*\\.postgres\\.integration\\.spec\\.ts$',
  transform: {
    '^.+\\.ts$': [
      'ts-jest',
      {
        tsconfig: {
          strictPropertyInitialization: false,
          types: ['node', 'jest'],
        },
      },
    ],
  },
  moduleNameMapper: {
    '^@iwana/db$': '<rootDir>/../../../packages/database/src/index.ts',
    '^@iwana/db/(.*)$': '<rootDir>/../../../packages/database/src/$1',
    '^@iwana/shared$': '<rootDir>/../../../packages/shared/src/index.ts',
    '^@iwana/shared/(.*)$': '<rootDir>/../../../packages/shared/src/$1',
  },
  testEnvironment: 'node',
  globalSetup: '<rootDir>/../../../packages/database/test/integration-db-probe.js',
  setupFiles: ['<rootDir>/../../../packages/database/test/integration-worker-db.js'],
  maxWorkers: integrationWorkers,
  testTimeout: 180_000,
};
