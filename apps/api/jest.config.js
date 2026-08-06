/** @type {import('jest').Config} */
module.exports = {
  // 'ts' primero: un .js compilado que quede en src/ NO debe eclipsar al fuente.
  // Con 'js' antes, un artefacto stale se resolvía en lugar del .ts y los tests
  // validaban código viejo en silencio (los artefactos están en .gitignore, así
  // que ni siquiera aparecían en git status).
  moduleFileExtensions: ['ts', 'js', 'json'],
  rootDir: 'src',
  testRegex: '.*\\.spec\\.ts$',
  transform: {
    '^.+\\.(t|j)s$': [
      'ts-jest',
      {
        tsconfig: {
          strictPropertyInitialization: false,
          paths: {
            '@iwana/db': ['<rootDir>/../../../packages/database/src/index.ts'],
            '@iwana/shared': ['<rootDir>/../../../packages/shared/src/index.ts'],
            '@iwana/storage': ['<rootDir>/../../../packages/storage/src/index.ts'],
          },
        },
      },
    ],
  },
  moduleNameMapper: {
    '^@iwana/db$': '<rootDir>/../../../packages/database/src/index.ts',
    '^@iwana/db/(.*)$': '<rootDir>/../../../packages/database/src/$1',
    '^@iwana/shared$': '<rootDir>/../../../packages/shared/src/index.ts',
    '^@iwana/shared/(.*)$': '<rootDir>/../../../packages/shared/src/$1',
    '^@iwana/storage$': '<rootDir>/../../../packages/storage/src/index.ts',
    '^@iwana/storage/(.*)$': '<rootDir>/../../../packages/storage/src/$1',
  },
  collectCoverageFrom: ['**/*.(t|j)s'],
  coverageDirectory: '../coverage',
  testEnvironment: 'node',
  setupFiles: ['<rootDir>/test-setup-pii-hash-key.ts'],
  testPathIgnorePatterns: ['\\.postgres\\.integration\\.spec\\.ts$'],
  // R-14 — CAUSA RAÍZ (no subir testTimeout: eso trata el síntoma).
  // Jest ya es un runner paralelo. Ejecutarlo bajo otro planificador paralelo
  // (turbo) es doble planificación: ninguna capa conoce la demanda de la otra y
  // cada paquete reclamaba su propio porcentaje de cores a la vez. Medido antes
  // del arreglo: 6 tareas `test` concurrentes pedían 69 workers sobre 16 cores
  // (4,3x de sobresuscripción); en ubuntu-latest (2 cores) es aritméticamente
  // imposible repartir el presupuesto, porque el mínimo por paquete ya es 1 worker.
  // El presupuesto se acota ARRIBA, no aquí: `pnpm test` = `turbo run test
  // --concurrency=1` (package.json raíz) => una sola tarea `test` viva a la vez.
  // Con eso este '50%' significa de verdad el 50% de la máquina (8/16 local,
  // 1/2 en el runner) y se cumple el invariante: workers concurrentes <= cores.
  // Evidencia de la dilatación que producía los flakes: rfq-pdf.service.spec.ts
  // (pdfkit + JSZip, CPU puro) tardaba 10,3 s aislado y 59,8 s bajo el paralelo
  // anterior — 5,8x. Su test más pesado (1821 ms aislado) proyectaba a ~10,6 s
  // contra un testTimeout de 15 s: de ahí «1 suite / 2 tests» en rojo intermitente.
  // testTimeout queda como margen MEDIDO, no como máscara.
  testTimeout: 15000,
  maxWorkers: '50%',
  // Path-specific (rootDir=src): no umbral global del API — evita romper baseline monorepo.
  coverageThreshold: {
    '**/serialized-asset-useful-life.util.ts': {
      statements: 80,
      branches: 80,
      functions: 80,
      lines: 80,
    },
  },
};
