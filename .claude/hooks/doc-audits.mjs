/**
 * Stop: si hay cambios en docs/ o AGENTS.md, corre las auditorías del job
 * «Integridad de citas ADR» de CI antes de cerrar el turno. Con hallazgos
 * bloqueantes devuelve el reporte a Claude; stop_hook_active evita el bucle.
 */

import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import process from 'node:process';

import { PROJECT_DIR, block, readHookInput } from './lib/hook-input.mjs';

const AUDITS = ['scripts/audit-doc-locations.mjs', 'scripts/audit-adr-citations.mjs'];

const input = await readHookInput();
if (input.stop_hook_active) process.exit(0);

const changed = execFileSync('git', ['status', '--porcelain', '--', 'docs', 'AGENTS.md'], {
  cwd: PROJECT_DIR,
  encoding: 'utf8',
});
if (!changed.trim()) process.exit(0);

for (const script of AUDITS) {
  try {
    execFileSync(process.execPath, [join(PROJECT_DIR, script)], {
      cwd: PROJECT_DIR,
      encoding: 'utf8',
      stdio: 'pipe',
    });
  } catch (error) {
    block(
      `Auditoría documental con hallazgos bloqueantes (${script}):\n${error.stdout ?? ''}${error.stderr ?? ''}`,
    );
  }
}
