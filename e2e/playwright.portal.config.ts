import { existsSync, readFileSync } from 'node:fs';
import { platform } from 'node:os';

import { defineConfig, devices } from '@playwright/test';

import { loadWorkspaceEnv } from './load-env';

// Antes de leer cualquier process.env: sin esto las specs que dependen de
// variables de entorno se saltaban siempre (ver load-env.ts).
loadWorkspaceEnv();

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
const markerReporterPath = process.env.E2E_MARKER_REPORTER_PATH;
const jsonReportPath = process.env.PLAYWRIGHT_JSON_OUTPUT_NAME;

export default defineConfig({
  testDir: './tests',
  testMatch: /portal-.*\.spec\.ts/,
  timeout: 30_000,
  expect: {
    timeout: 10_000,
  },
  fullyParallel: false,
  workers: 1,
  reporter:
    markerReporterPath && jsonReportPath
      ? [['list'], ['json', { outputFile: jsonReportPath }], [markerReporterPath]]
      : [['list']],
  use: {
    baseURL: 'http://127.0.0.1:3002',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: useSystemChrome ? 'off' : 'retain-on-failure',
  },
  webServer: {
    // La suite corre contra un build standalone de producción. Así, los mocks
    // page.route no activan el indicador de caché de Next dev en las capturas.
    // El wrapper conserva el bind a loopback y copia los assets al standalone.
    command: 'node ../scripts/next-standalone-e2e.mjs --port 3002',
    url: 'http://127.0.0.1:3002',
    // No se reutiliza un servidor existente: podría ser next dev y contaminar
    // las capturas con el indicador de desarrollo.
    reuseExistingServer: false,
    env: {
      ...process.env,
      NODE_ENV: 'production',
      IWANA_DISABLE_CACHE_COMPONENTS: '0',
      NEXT_PUBLIC_PORTAL_API_URL: '',
    },
    timeout: 300_000,
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
