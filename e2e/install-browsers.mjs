/**
 * Instala Chromium de Playwright en la caché canónica del usuario.
 * Ignora PLAYWRIGHT_BROWSERS_PATH del sandbox de Cursor (Temp\cursor-sandbox-cache).
 */
import { spawnSync } from 'node:child_process';
import { homedir } from 'node:os';
import { resolve } from 'node:path';
import process from 'node:process';

const canonical =
  process.platform === 'win32'
    ? resolve(process.env.LOCALAPPDATA || resolve(homedir(), 'AppData', 'Local'), 'ms-playwright')
    : resolve(homedir(), '.cache', 'ms-playwright');

process.env.PLAYWRIGHT_BROWSERS_PATH = canonical;
process.stdout.write(`PLAYWRIGHT_BROWSERS_PATH=${canonical}\n`);

const result = spawnSync('pnpm', ['exec', 'playwright', 'install', 'chromium'], {
  stdio: 'inherit',
  env: process.env,
  shell: true,
});

process.exit(result.status ?? 1);
