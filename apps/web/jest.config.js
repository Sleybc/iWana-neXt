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
    // Suprimir imports de CSS/imágenes en tests
    '\\.(css|less|scss|sass)$': '<rootDir>/__mocks__/fileMock.js',
    '\\.(jpg|jpeg|png|gif|svg|ico|webp)$': '<rootDir>/__mocks__/fileMock.js',
  },
  // Mismo defecto que en apps/portal (corregido el 2026-08-04): '**/*.(t|j)sx?'
  // no matchea nada porque en glob `?` es «exactamente un carácter» y exigía
  // `.tsx` + un carácter extra. `jest --coverage` reportaba `0/0` y «Unknown%».
  collectCoverageFrom: ['**/*.ts', '**/*.tsx', '!**/*.d.ts'],
  coverageDirectory: '../coverage',
  // Gate 4 del protocolo §4 — auditoría por simetría con apps/portal ordenada por
  // el CTO el 2026-08-04 (escalación 3 del
  // INFORME-MOD02-DASHBOARD-PORTAL-AUDITORIA-UIUX-v1.0). apps/web tampoco
  // declaraba umbral: mismo gate fantasma que el portal.
  //
  // MEDIDO el 2026-08-04 sobre 19 suites / 76 tests en verde, con los patrones
  // corregidos de arriba:
  //   statements 37.81% (1322/3496)   branches  30.22% (644/2131)
  //   functions  33.20% (263/792)     lines     38.80% (1269/3270)
  //
  // Trinquete en el suelo medido menos 1 punto, igual que el portal: impide
  // retroceder, no declara la meta. La consola de plataforma parte muy por debajo
  // del portal; el 80% se alcanza subiendo el trinquete conforme suba la
  // cobertura, nunca fijando aquí un número que CI no pueda cumplir hoy.
  coverageThreshold: {
    global: {
      statements: 36,
      branches: 29,
      functions: 32,
      lines: 37,
    },
  },
};
