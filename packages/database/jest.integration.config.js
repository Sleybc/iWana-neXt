/**
 * Configuración Jest de la suite de INTEGRACIÓN de `@iwana/db`.
 *
 * Separada de `jest.config.js` a propósito: el paso «Unit tests» de la CI
 * (`pnpm test`) corre antes de que exista base de datos migrada, así que la
 * suite unitaria no puede depender de PostgreSQL. Esta config se invoca con
 * `pnpm --filter @iwana/db test:integration`, después de aplicar los roles
 * least-privilege en el pipeline.
 *
 * @type {import('jest').Config}
 */
module.exports = {
  // 'ts' primero: un .js compilado que quede en src/ NO debe eclipsar al fuente.
  moduleFileExtensions: ['ts', 'js', 'json'],
  rootDir: 'src',
  testRegex: '.*\\.integration\\.spec\\.ts$',
  // Solo `.ts`: el globalSetup es CommonJS puro y no debe pasar por ts-jest.
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
  testEnvironment: 'node',
  // Decide si hay PostgreSQL alcanzable y publica la bandera en process.env.
  globalSetup: '<rootDir>/../test/integration-db-probe.js',
  // Los schemas efímeros tienen nombre fijo: sin paralelismo no hay colisión.
  maxWorkers: 1,
  // 17 × CREATE INDEX CONCURRENTLY + verificaciones sobre catálogo real.
  testTimeout: 180_000,
};
