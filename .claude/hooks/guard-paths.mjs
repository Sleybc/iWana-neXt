/**
 * PreToolUse (Edit|Write|MultiEdit|NotebookEdit): bloquea ediciones en rutas que la
 * gobernanza reserva a humanos o a generadores. Solo cubre las herramientas de
 * edición; una escritura vía Bash no pasa por aquí.
 */

import { block, readHookInput, toolFilePath } from './lib/hook-input.mjs';

const RULES = [
  [/(^|\/)\.env(?!.*\.example$)[^/]*$/, 'los .env reales se editan a mano; usa .env.example'],
  [/(^|\/)secrets\//, 'secrets/ no se edita desde Claude'],
  [
    /(^|\/)\.claude\/mcp-postgres\.local\.env$/,
    'credencial local: la genera pnpm db:dev:readonly-role',
  ],
  [/(^|\/)pnpm-lock\.yaml$/, 'el lockfile solo cambia con pnpm install/add'],
  [
    /(^|\/)\.(opencode|codex)\/agents\//,
    'archivo generado: edita .claude/agents/ y corre pnpm sync:agents',
  ],
  [
    /(^|\/)\.claude\/skills\//,
    'puntero generado: edita .agents/skills/<skill>/SKILL.md y corre pnpm sync:skills',
  ],
  [/(^|\/)\.mcp\.json$/, 'archivo generado: edita .agents/mcp/servers.json y corre pnpm sync:mcp'],
];

const file = toolFilePath(await readHookInput());
if (!file) process.exit(0);

const hit = RULES.find(([pattern]) => pattern.test(file));
if (hit) block(`Bloqueado: ${hit[1]} (${file})`);

// AGENTS.md → Documentation Rules: ningún prompt fuera de docs/prompts/.
if (/(^|\/)PROMPT-[^/]*\.md$/.test(file) && !file.includes('docs/prompts/')) {
  block(`Bloqueado: los prompts viven solo en docs/prompts/ (${file})`);
}
