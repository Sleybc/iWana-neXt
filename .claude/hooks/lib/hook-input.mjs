/**
 * Utilidades compartidas por los hooks de Claude Code del repo.
 *
 * Claude Code entrega el evento como JSON por stdin. Un hook bloquea con exit 2:
 * el texto de stderr vuelve a Claude como motivo. Exit 0 deja pasar.
 *
 * Cada hook deja al salir una línea en .claude/hook-timings.jsonl (gitignored) con su
 * duración desde el arranque del proceso: Claude Code no persiste la duración de los
 * hooks que terminan bien y sin salida. `pnpm hooks:timings` la resume;
 * CLAUDE_HOOK_TIMINGS=off la apaga.
 */

import { appendFileSync, renameSync, statSync } from 'node:fs';
import { basename, join, relative } from 'node:path';
import process from 'node:process';

export const PROJECT_DIR = process.env.CLAUDE_PROJECT_DIR ?? process.cwd();

const TIMINGS_LOG = join(PROJECT_DIR, '.claude', 'hook-timings.jsonl');
const TIMINGS_MAX_BYTES = 1024 * 1024;

let hookInput = {};

process.on('exit', (code) => {
  if (process.env.CLAUDE_HOOK_TIMINGS === 'off') return;
  const file = toolFilePath(hookInput);
  const entry = {
    ts: new Date().toISOString(),
    hook: basename(process.argv[1] ?? '?', '.mjs'),
    event: hookInput.hook_event_name ?? null,
    tool: hookInput.tool_name ?? null,
    file: file ? relative(PROJECT_DIR, file).replaceAll('\\', '/') : null,
    ms: Math.round(performance.now()),
    exit: code,
  };
  try {
    if (statSync(TIMINGS_LOG, { throwIfNoEntry: false })?.size > TIMINGS_MAX_BYTES) {
      renameSync(TIMINGS_LOG, `${TIMINGS_LOG}.1`);
    }
    appendFileSync(TIMINGS_LOG, `${JSON.stringify(entry)}\n`);
  } catch {
    // Medir nunca debe hacer fallar al hook.
  }
});

export async function readHookInput() {
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  const raw = Buffer.concat(chunks).toString('utf8').trim();
  hookInput = raw ? JSON.parse(raw) : {};
  return hookInput;
}

/** Ruta del archivo que toca la herramienta, normalizada a barras `/`. */
export function toolFilePath(input) {
  const tool = input.tool_input ?? {};
  return String(tool.file_path ?? tool.notebook_path ?? '').replaceAll('\\', '/');
}

export function block(message) {
  process.stderr.write(`${message}\n`);
  process.exit(2);
}
