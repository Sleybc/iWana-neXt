/**
 * PostToolUse (Edit|Write|MultiEdit): al editar una fuente canónica de superficies de
 * IA, regenera sus derivados con el mismo script que su comando pnpm (ADR-092):
 *   .claude/agents/*.md          → scripts/sync-agents.mjs  (.opencode/agents, .codex/agents)
 *   .agents/skills/<x>/SKILL.md  → scripts/sync-skills.mjs  (.claude/skills)
 *   .agents/mcp/servers.json     → scripts/sync-mcp.mjs     (.mcp.json, .opencode/opencode.json)
 */

import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import process from 'node:process';

import { PROJECT_DIR, block, readHookInput, toolFilePath } from './lib/hook-input.mjs';

const SOURCES = [
  [/(^|\/)\.claude\/agents\/[^/]+\.md$/, 'scripts/sync-agents.mjs'],
  [/(^|\/)\.agents\/skills\/[^/]+\/SKILL\.md$/, 'scripts/sync-skills.mjs'],
  [/(^|\/)\.agents\/mcp\/servers\.json$/, 'scripts/sync-mcp.mjs'],
];

const file = toolFilePath(await readHookInput());
const script = SOURCES.find(([pattern]) => pattern.test(file))?.[1];
if (!script) process.exit(0);

try {
  execFileSync(process.execPath, [join(PROJECT_DIR, script)], {
    cwd: PROJECT_DIR,
    encoding: 'utf8',
    stdio: 'pipe',
  });
} catch (error) {
  block(`${script} falló tras editar ${file}:\n${error.stdout ?? ''}${error.stderr ?? ''}`);
}
