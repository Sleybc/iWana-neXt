import { defineConfig, devices } from '@playwright/test';

import { loadWorkspaceEnv } from './load-env';

// Antes de leer cualquier process.env: sin esto las specs que dependen de
// variables de entorno se saltaban siempre (ver load-env.ts).
loadWorkspaceEnv();
import baseConfig from './playwright.web.config';

export default defineConfig({
  ...baseConfig,
  use: {
    ...baseConfig.use,
    video: 'off',
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
