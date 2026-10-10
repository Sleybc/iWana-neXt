/**
 * PostToolUse (Edit|Write|MultiEdit): norma del CTO (2026-10-08) para MOD11↔MOD12.
 * Cada código de INVENTORY_CONSUMPTION_REJECTION_REASON_CODES necesita al menos un
 * *.integration.spec.ts (Postgres + Redis reales) que lo nombre. Comprueba presencia;
 * que el test pase y recorra el flujo completo lo verifica el skill iwana-matriz-motivos.
 */

import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import process from 'node:process';

import { PROJECT_DIR, block, readHookInput, toolFilePath } from './lib/hook-input.mjs';

const CONTRACT = 'packages/shared/src/contracts/operations/execution-orders.ts';

const file = toolFilePath(await readHookInput());
if (!file.endsWith(CONTRACT) && !/\.integration\.spec\.ts$/.test(file)) process.exit(0);

const contractPath = join(PROJECT_DIR, CONTRACT);
if (!existsSync(contractPath)) process.exit(0);

const list =
  readFileSync(contractPath, 'utf8').match(
    /INVENTORY_CONSUMPTION_REJECTION_REASON_CODES\s*=\s*\[([^\]]*)\]/,
  )?.[1] ?? '';
const codes = [...list.matchAll(/'([A-Z_]+)'/g)].map((match) => match[1]);

const specs = execFileSync(
  'git',
  ['ls-files', '--cached', '--others', '--exclude-standard', '*.integration.spec.ts'],
  { cwd: PROJECT_DIR, encoding: 'utf8' },
)
  .split('\n')
  .filter(Boolean)
  .map((path) => readFileSync(join(PROJECT_DIR, path), 'utf8'));

const missing = codes.filter((code) => !specs.some((source) => source.includes(code)));
if (missing.length > 0) {
  block(
    `Motivos de rechazo sin test integrado (Postgres + Redis reales): ${missing.join(', ')}. ` +
      'Norma del CTO 2026-10-08: un *.integration.spec.ts por motivo.',
  );
}
