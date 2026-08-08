/** @type {import('jest').Config} */
module.exports = {
  projects: [
    '<rootDir>/apps/api/jest.config.js',
    '<rootDir>/apps/web/jest.config.js',
    '<rootDir>/apps/portal/jest.config.js',
    '<rootDir>/apps/worker/jest.config.js',
    '<rootDir>/packages/database/jest.config.js',
    '<rootDir>/packages/shared/jest.config.js',
  ],
};
