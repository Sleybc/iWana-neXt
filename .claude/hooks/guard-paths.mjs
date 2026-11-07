/**
 * PreToolUse (Edit|Write|MultiEdit|NotebookEdit): bloquea ediciones en rutas que la
 * gobernanza reserva a humanos o a generadores. Solo cubre las herramientas de
 * edición; una escritura vía Bash no pasa por aquí.
 */

import { existsSync } from 'node:fs';

import { block, readHookInput, toolFilePath } from './lib/hook-input.mjs';

const RULES = [
  [/(^|\/)\.env(?!.*\.example$)[^/]*$/, 'los .env reales se editan a mano; usa .env.example'],
  [/(^|\/)secrets\//, 'secrets/ no se edita desde Claude'],
  [
    /(^|\/)\.claude\/mcp-[a-z]+\.local\.env$/,
    'credencial local: la generan pnpm db:dev:readonly-role y pnpm dev:redis-readonly-user',
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

// Artefactos versionados: el 12-10 un Write reemplazó el informe T11 que otra sesión
// acababa de crear sobre el mismo checkout. Un Write solo crea; para cambiar, Edit.
const VERSIONED_DOC = /(^|\/)docs\/(adrs|hlds|informes|plans|prds|prompts|specs)\/.+\.md$/;

const input = await readHookInput();
const file = toolFilePath(input);
if (!file) process.exit(0);

const hit = RULES.find(([pattern]) => pattern.test(file));
if (hit) block(`Bloqueado: ${hit[1]} (${file})`);

// AGENTS.md → Documentation Rules: ningún prompt fuera de docs/prompts/.
if (/(^|\/)PROMPT-[^/]*\.md$/.test(file) && !file.includes('docs/prompts/')) {
  block(`Bloqueado: los prompts viven solo en docs/prompts/ (${file})`);
}

if (input.tool_name === 'Write' && VERSIONED_DOC.test(file) && existsSync(file)) {
  block(
    `Bloqueado: ${file} ya existe y Write lo sobrescribiría entero. Usa Edit para cambiarlo, ` +
      'o la siguiente versión libre (-vX.Y) si es un documento nuevo; si otra sesión lo creó, ' +
      'repórtalo al orquestador.',
  );
}
