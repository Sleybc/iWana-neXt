import { defineConfig, devices } from '@playwright/test';

import { loadWorkspaceEnv } from './load-env';

// Antes de leer cualquier process.env: sin esto las specs que dependen de
// variables de entorno se saltaban siempre (ver load-env.ts).
loadWorkspaceEnv();

const chromiumExecutablePath = process.env['PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH'];

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
    video: chromiumExecutablePath ? 'off' : 'retain-on-failure',
    ...(chromiumExecutablePath
      ? { launchOptions: { executablePath: chromiumExecutablePath } }
      : {}),
  },
  webServer: {
    command: 'pnpm --filter @iwana/web dev',
    url: 'http://127.0.0.1:3001',
    reuseExistingServer: true,
    // Misma razón que portal (OLA1-b C-4): same-origin `/api/v1` en E2E.
    env: {
      ...process.env,
      NEXT_PUBLIC_WEB_API_URL: '',
    },
    timeout: 120_000,
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});
