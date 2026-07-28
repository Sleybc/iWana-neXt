import { defineConfig, devices } from '@playwright/test';

import { loadWorkspaceEnv } from './load-env';

// Carga las variables de entorno del workspace antes de cualquier evaluación.
loadWorkspaceEnv();

export default defineConfig({
  testDir: './tests',
  testMatch: [/api\/.*\.spec\.ts/, /api-.*\.spec\.ts/],
  timeout: 180_000,
  expect: {
    timeout: 15_000,
  },
  fullyParallel: false,
  workers: 1,
  retries: 1,
  reporter: [['list']],
  use: {
    baseURL: process.env.API_BASE_URL || 'http://127.0.0.1:3000',
    trace: 'on-first-retry',
    screenshot: 'off',
  },
  webServer: [
    {
      command: 'pnpm --filter @iwana/api dev',
      url: 'http://127.0.0.1:3000/api/v1/health',
      reuseExistingServer: true,
      timeout: 120_000,
      cwd: process.cwd(),
    },
  ],
  projects: [
    {
      name: 'api-chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});
