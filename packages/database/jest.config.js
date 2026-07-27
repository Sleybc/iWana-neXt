/** @type {import('jest').Config} */
module.exports = {
  // 'ts' primero: un .js compilado que quede en src/ NO debe eclipsar al fuente
  // (ver nota en apps/api/jest.config.js).
  moduleFileExtensions: ['ts', 'js', 'json'],
  rootDir: 'src',
  testRegex: '.*\\.spec\\.ts$',
  // Los *.integration.spec.ts de este paquete ejecutan SQL real contra PostgreSQL
  // (p. ej. `up()` de una migración tenant contra un schema de verdad) y corren
  // con `jest.integration.config.js` vía el script `test:integration`.
  // El paso «Unit tests» de ci.yml se ejecuta ANTES de aplicar roles y migraciones
  // y sin credenciales de DB para @iwana/db: si el testRegex los capturara, el
  // gate unitario se pondría rojo por falta de base de datos, no por un defecto.
  testPathIgnorePatterns: ['/node_modules/', '\\.integration\\.spec\\.ts$'],
  transform: {
    '^.+\\.(t|j)s$': [
      'ts-jest',
      {
        tsconfig: {
          strictPropertyInitialization: false,
          types: ['node', 'jest'],
        },
      },
    ],
  },
  collectCoverageFrom: ['**/*.(t|j)s', '!**/*.spec.ts'],
  coverageDirectory: '../coverage',
  testEnvironment: 'node',
  // R-14: sin `maxWorkers` explícito jest usa (cores - 1) — 15 workers en esta
  // máquina para un paquete con pocas suites: puro coste de spawn, y sumaba a la
  // sobresuscripción con los demás paquetes. El presupuesto se acota ARRIBA
  // (`turbo run test --concurrency=1`); ver la nota en apps/api/jest.config.js.
  maxWorkers: '50%',
};
