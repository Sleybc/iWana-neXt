import { existsSync, readFileSync } from 'node:fs';
import { platform } from 'node:os';

import { defineConfig, devices } from '@playwright/test';

const browserOverride = process.env.IWANA_PORTAL_E2E_BROWSER;

function shouldUseSystemChrome(): boolean {
  if (browserOverride === 'chrome') {
    return true;
  }

  if (browserOverride === 'chromium') {
    return false;
  }

  if (process.env.CI === 'true' || platform() !== 'linux') {
    return false;
  }

  const hasGoogleChrome =
    existsSync('/usr/bin/google-chrome') || existsSync('/usr/bin/google-chrome-stable');

  if (!hasGoogleChrome || !existsSync('/etc/os-release')) {
    return false;
  }

  const osRelease = readFileSync('/etc/os-release', 'utf8');
  const isUbuntu = /^ID=ubuntu$/m.test(osRelease);
  const isUnsupportedUbuntu = /^VERSION_ID="?26\.04"?$/m.test(osRelease);

  return isUbuntu && isUnsupportedUbuntu;
}

const useSystemChrome = shouldUseSystemChrome();

export default defineConfig({
  testDir: './tests',
  testMatch: /portal-.*\.spec\.ts/,
  timeout: 30_000,
  expect: {
    timeout: 10_000,
  },
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  use: {
    baseURL: 'http://127.0.0.1:3002',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: useSystemChrome ? 'off' : 'retain-on-failure',
  },
  webServer: {
    // Turbopack dev hangs compiling /dashboard/assurance on Windows in this suite.
    // Webpack dev matches the production build result and keeps E2E navigation stable.
    command: 'pnpm --filter @iwana/portal exec next dev --webpack --port 3002',
    url: 'http://127.0.0.1:3002',
    reuseExistingServer: true,
    timeout: 120_000,
  },
  projects: [
    {
      name: useSystemChrome ? 'google-chrome-local' : 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        ...(useSystemChrome ? { channel: 'chrome' as const } : {}),
      },
    },
  ],
});
