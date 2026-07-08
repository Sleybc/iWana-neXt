/** @type {import('jest').Config} */
module.exports = {
  moduleFileExtensions: ['js', 'json', 'ts'],
  rootDir: 'src',
  testRegex: '.*\.spec\.ts$',
  transform: {
    '^.+\.(t|j)s$': [
      'ts-jest',
      {
        tsconfig: {
          strictPropertyInitialization: false,
          types: ['jest', 'node'],
          paths: {
            '@iwana/db': ['<rootDir>/../../../packages/database/src/index.ts'],
            '@iwana/shared': ['<rootDir>/../../../packages/shared/src/index.ts'],
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
  },
  collectCoverageFrom: ['**/*.(t|j)s'],
  coverageDirectory: '../coverage',
  testEnvironment: 'node',
};
