/** @type {import('jest').Config} */
module.exports = {
  // 'ts' primero: un .js compilado que quede en src/ NO debe eclipsar al fuente
  // (ver nota en apps/api/jest.config.js).
  moduleFileExtensions: ['ts', 'js', 'json'],
  rootDir: 'src',
  testRegex: '.*\.spec\.ts$',
  transform: {
    '^.+\.(t|j)s$': [
      'ts-jest',
      {
        // Mantener el mismo baseline estricto que el typecheck de worker.
        tsconfig: '<rootDir>/../tsconfig.typecheck.json',
      },
    ],
  },
  moduleNameMapper: {
    '^@iwana/db$': '<rootDir>/../../../packages/database/src/index.ts',
    '^@iwana/db/(.*)$': '<rootDir>/../../../packages/database/src/$1',
    '^@iwana/shared$': '<rootDir>/../../../packages/shared/src/index.ts',
    '^@iwana/shared/(.*)$': '<rootDir>/../../../packages/shared/src/$1',
  },
  collectCoverageFrom: ['**/*.(t|j)s'],
  coverageDirectory: '../coverage',
  testEnvironment: 'node',
  // R-14: sin `maxWorkers` explícito jest usa (cores - 1) — 15 workers en esta
  // máquina para un paquete con pocas suites: puro coste de spawn, y sumaba a la
  // sobresuscripción con los demás paquetes. El presupuesto se acota ARRIBA
  // (`turbo run test --concurrency=1`); ver la nota en apps/api/jest.config.js.
  maxWorkers: '50%',
};
