/** @type {import('jest').Config} */
module.exports = {
  testEnvironment: 'jsdom',
  rootDir: 'src',
  setupFilesAfterEnv: ['<rootDir>/jest.setup.ts'],
  testRegex: '.*\\.spec\\.tsx?$',
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
  collectCoverageFrom: ['**/*.(t|j)sx?', '!**/*.d.ts'],
  coverageDirectory: '../coverage',
};
