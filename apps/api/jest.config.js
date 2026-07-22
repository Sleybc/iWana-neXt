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
