/** @type {import('jest').Config} */
module.exports = {
  // 'ts' primero: un .js compilado que quede en src/ NO debe eclipsar al fuente
  // (ver nota en apps/api/jest.config.js).
  moduleFileExtensions: ['ts', 'js', 'json'],
  rootDir: 'src',
  testRegex: '.*\\.spec\\.ts$',
  transform: {
    '^.+\\.(t|j)s$': [
      'ts-jest',
      {
        tsconfig: {
          strictPropertyInitialization: false,
        },
      },
    ],
  },
  collectCoverageFrom: ['**/*.(t|j)s'],
  coverageDirectory: '../coverage',
  testEnvironment: 'node',
};
