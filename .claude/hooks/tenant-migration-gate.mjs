/**
 * PostToolUse (Edit|Write|MultiEdit): gate «Migrations reversible» de AGENTS.md.
 * Toda migración tenant NNN_*.ts debe tener down() y estar registrada en runner.ts
 * (import + TENANT_MIGRATIONS). La escritura ya ocurrió: el aviso vuelve a Claude
 * para que complete el registro en el mismo turno.
 */

import { readFileSync } from 'node:fs';
import { basename, join } from 'node:path';

import { PROJECT_DIR, block, readHookInput, toolFilePath } from './lib/hook-input.mjs';

const MIGRATION = /packages\/database\/src\/migrations\/tenant\/\d{3}_[a-z0-9_]+\.ts$/;

const file = toolFilePath(await readHookInput());
if (!MIGRATION.test(file)) process.exit(0);

const fileName = basename(file, '.ts');
const source = readFileSync(file, 'utf8');
const runner = readFileSync(
  join(PROJECT_DIR, 'packages/database/src/migrations/tenant/runner.ts'),
  'utf8',
);
const className = source.match(/export class (\w+)/)?.[1];
const registry = runner.slice(runner.indexOf('TENANT_MIGRATIONS'));

const errors = [];
if (!/async\s+down\s*\(/.test(source)) errors.push('falta un down() reversible');
if (!runner.includes(`'./${fileName}'`))
  errors.push(`falta el import './${fileName}' en runner.ts`);
if (!className) errors.push('no exporta ninguna clase de migración');
else if (!new RegExp(`\\b${className}\\b`).test(registry)) {
  errors.push(`${className} no está en TENANT_MIGRATIONS`);
}

if (errors.length > 0) block(`Migración tenant ${fileName}: ${errors.join('; ')}.`);
