/**
 * PostToolUse (Edit|Write|MultiEdit): formatea con Prettier el archivo recién editado
 * en apps/, packages/ o e2e/. ESLint queda en lint-staged y CI: con reglas type-aware
 * correrlo por edición suma segundos a cada cambio.
 */

import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import process from 'node:process';

import { PROJECT_DIR, readHookInput, toolFilePath } from './lib/hook-input.mjs';

const FORMATTABLE = /(^|\/)(apps|packages|e2e)\/.+\.(ts|tsx|json|md|ya?ml)$/;

const file = toolFilePath(await readHookInput());
if (!FORMATTABLE.test(file)) process.exit(0);

try {
  execFileSync(
    process.execPath,
    [
      join(PROJECT_DIR, 'node_modules/prettier/bin/prettier.cjs'),
      '--write',
      '--log-level=warn',
      file,
    ],
    { cwd: PROJECT_DIR, stdio: ['ignore', 'ignore', 'inherit'] },
  );
} catch {
  // Un error de sintaxis lo reporta typecheck; el formato no bloquea la edición.
}
