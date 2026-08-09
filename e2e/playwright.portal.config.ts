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
    // Se invoca el wrapper `scripts/next-dev.mjs` en lugar de `next dev` directo
    // para que el servidor de E2E respete el binding a loopback (ADR-078 D2).
    command:
      'pnpm --filter @iwana/portal exec node ../../scripts/next-dev.mjs --webpack --port 3002',
    url: 'http://127.0.0.1:3002',
    reuseExistingServer: !process.env.PW_FORCE_FRESH_SERVER && !process.env.CI,
    // C-4 / OLA1-b: el bundle del navegador debe usar same-origin `/api/v1` para
    // que page.route() intercepte sin CORS/CSP connect-src. Si el shell o
    // `.env.development` definen NEXT_PUBLIC_PORTAL_API_URL absoluta (p. ej.
    // http://127.0.0.1:3000/api/v1), Next la bakea y AuthProvider queda bloqueado
    // por connect-src 'self'. Forzamos vacío en el webServer de la suite.
    env: {
      ...process.env,
      NEXT_PUBLIC_PORTAL_API_URL: '',
    },
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
