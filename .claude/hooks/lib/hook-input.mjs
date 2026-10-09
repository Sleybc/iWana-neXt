/**
 * Utilidades compartidas por los hooks de Claude Code del repo.
 *
 * Claude Code entrega el evento como JSON por stdin. Un hook bloquea con exit 2:
 * el texto de stderr vuelve a Claude como motivo. Exit 0 deja pasar.
 */

import process from 'node:process';

export const PROJECT_DIR = process.env.CLAUDE_PROJECT_DIR ?? process.cwd();

export async function readHookInput() {
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  const raw = Buffer.concat(chunks).toString('utf8').trim();
  return raw ? JSON.parse(raw) : {};
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
