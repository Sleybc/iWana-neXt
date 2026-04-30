import { defineConfig, devices } from '@playwright/test';
import baseConfig from './playwright.portal.config';

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
