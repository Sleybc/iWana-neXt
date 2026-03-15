import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  // Incluye specs legados con prefijo web- y nuevos specs organizados por carpeta.
  testMatch: [/web-.*\.spec\.ts/, /web\/.*\.spec\.ts/],
  timeout: 30_000,
  expect: {
    timeout: 10_000,
  },
  fullyParallel: false,
  reporter: [['list']],
  use: {
    baseURL: 'http://127.0.0.1:3001',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  webServer: {
    command: 'pnpm --filter @iwana/web dev',
    url: 'http://127.0.0.1:3001',
    reuseExistingServer: true,
    timeout: 120_000,
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});
