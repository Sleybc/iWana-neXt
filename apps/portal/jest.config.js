/** @type {import('jest').Config} */
module.exports = {
  testEnvironment: 'jsdom',
  rootDir: 'src',
  setupFilesAfterEnv: ['<rootDir>/jest.setup.ts'],
  testRegex: '.*\\.spec\\.tsx?$',
  // R-14: el presupuesto de CPU se acota ARRIBA — `pnpm test` = `turbo run test
  // --concurrency=1` (package.json raíz), una sola tarea `test` viva a la vez.
  // Ver la nota extensa con la medición en apps/api/jest.config.js.
  // Sin esa serialización, este '50%' se sumaba al '50%' de los demás paquetes.
  testTimeout: 15000,
  maxWorkers: '50%',
  transform: {
    '^.+\\.(t|j)sx?$': [
      'ts-jest',
      {
        tsconfig: {
          jsx: 'react-jsx',
          types: ['jest', '@testing-library/jest-dom'],
        },
      },
    ],
  },
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/$1',
    '^@iwana/ui$': '<rootDir>/../../../packages/ui/src/index.ts',
    '^@iwana/ui/(.*)$': '<rootDir>/../../../packages/ui/src/$1',
    '^@iwana/shared$': '<rootDir>/../../../packages/shared/src/index.ts',
    '^@iwana/shared/(.*)$': '<rootDir>/../../../packages/shared/src/$1',
    '\\.(css|less|scss|sass)$': '<rootDir>/__mocks__/fileMock.js',
    '\\.(jpg|jpeg|png|gif|svg|ico|webp)$': '<rootDir>/__mocks__/fileMock.js',
  },
  // El patrón anterior era '**/*.(t|j)sx?' y NO matcheaba ningún archivo: en glob
  // `?` es «exactamente un carácter», así que exigía `.tsx` + un carácter extra.
  // Resultado medido el 2026-08-04: `jest --coverage` reportaba `0/0` y
  // «Unknown%» — cobertura vacía presentada como una corrida válida. Los patrones
  // van explícitos para que el denominador sea verificable a simple vista.
  collectCoverageFrom: ['**/*.ts', '**/*.tsx', '!**/*.d.ts'],
  coverageDirectory: '../coverage',
  // Gate 4 del protocolo §4 (cobertura ≥80% en módulos core) — escalación 3 del
  // INFORME-MOD02-DASHBOARD-PORTAL-AUDITORIA-UIUX-v1.0, aprobada por el CTO el
  // 2026-08-04. Hasta esa fecha el portal no declaraba umbral alguno: el gate
  // existía en el protocolo pero era inexigible mecánicamente en toda la
  // superficie frontend del tenant, el patrón de compuerta fantasma que ADR-056
  // persigue.
  //
  // MEDIDO el 2026-08-04 sobre 169 suites / 1080 tests en verde, con los patrones
  // corregidos de arriba:
  //   statements 56.94% (13896/24402)   branches  48.57% (8383/17259)
  //   functions  50.59% (3007/5943)     lines     58.09% (13451/23155)
  //
  // El umbral se fija en el suelo medido menos 1 punto: es un TRINQUETE que impide
  // retroceder, no la meta. El 80% es el destino y se sube cuando la cobertura
  // suba — nunca al revés. Fijarlo en el 80% aspiracional dejaría CI en rojo desde
  // el primer push sin ninguna regresión real (ADR-056 §Prevención: un validador
  // construido sobre supuestos en vez de sobre una medición).
  // El punto de margen absorbe la varianza de un archivo nuevo sin tests; una
  // regresión mayor que eso sigue siendo roja.
  coverageThreshold: {
    global: {
      statements: 55,
      branches: 47,
      functions: 49,
      lines: 57,
    },
  },
};
