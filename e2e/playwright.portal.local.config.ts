import { defineConfig, devices } from '@playwright/test';

import { loadWorkspaceEnv } from './load-env';

// Antes de leer cualquier process.env: sin esto las specs que dependen de
// variables de entorno se saltaban siempre (ver load-env.ts).
loadWorkspaceEnv();
import baseConfig from './playwright.portal.config';

export default defineConfig({
  ...baseConfig,
  use: {
    ...baseConfig.use,
    video: 'off',
  },
  webServer: {
    command: 'IWANA_DISABLE_CACHE_COMPONENTS=1 pnpm --filter @iwana/portal dev',
    url: 'http://127.0.0.1:3002',
    reuseExistingServer: true,
    timeout: 120_000,
  },
  projects: [
    {
      name: 'google-chrome-local',
      use: {
        ...devices['Desktop Chrome'],
        channel: 'chrome',
      },
    },
  ],
});
