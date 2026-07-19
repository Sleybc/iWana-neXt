#!/usr/bin/env node
/**
 * sync-agents.mjs — genera las definiciones de subagentes por proveedor.
 *
 * Fuente canónica: .claude/agents/*.md (la leen nativamente Claude Code, Cursor
 * y VS Code/Copilot). Este script deriva:
 *   - .opencode/agents/<name>.md   (frontmatter de OpenCode: mode/permission)
 *   - .codex/agents/<name>.toml    (formato TOML de Codex CLI)
 *
 * Los directorios generados NO se editan a mano — cualquier cambio se hace en
 * .claude/agents/ y se re-ejecuta `pnpm sync:agents`. Gobernanza: informe vivo
 * de roles (docs/informes/INFORME-ROLES-ECOSISTEMA-MULTIAGENTE-v1.0.md §5.5).
 *
 * Nota Codex: los agentes de proyecto en .codex/agents/ pueden no cargar en
 * sesiones tool-backed (issue openai/codex#15250); en CLI funcionan.
 *
 * Uso: node scripts/sync-agents.mjs [--check]
 *   --check  no escribe: falla con exit 1 si los generados están desactualizados.
 */

import { mkdirSync, readdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, basename } from 'node:path';
import process from 'node:process';

const ROOT = join(import.meta.dirname, '..');
const SRC_DIR = join(ROOT, '.claude', 'agents');
const OPENCODE_DIR = join(ROOT, '.opencode', 'agents');
const CODEX_DIR = join(ROOT, '.codex', 'agents');
const CHECK = process.argv.includes('--check');

const HEADER_NOTE =
  'GENERADO por scripts/sync-agents.mjs desde .claude/agents/ — no editar a mano.';

function parseAgentFile(filePath) {
  const raw = readFileSync(filePath, 'utf8');
  const match = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/);
  if (!match) {
    throw new Error(`Frontmatter no encontrado en ${filePath}`);
  }
  const [, frontmatter, body] = match;
  const meta = {};
  for (const line of frontmatter.split(/\r?\n/)) {
    const kv = line.match(/^(\w[\w-]*):\s*(.*)$/);
    if (kv) {
      let value = kv[2].trim();
      if (value.startsWith('"') && value.endsWith('"')) {
        value = JSON.parse(value);
      }
      meta[kv[1]] = value;
    }
  }
  return {
    name: meta.name ?? basename(filePath, '.md'),
    description: meta.description ?? '',
    readonly: meta.readonly === 'true',
    body: body.trim(),
  };
}

function toOpencode(agent) {
  const permission = agent.readonly ? '\npermission:\n  edit: deny\n  bash: deny' : '';
  return `---
# ${HEADER_NOTE}
description: ${JSON.stringify(agent.description)}
mode: subagent${permission}
---

${agent.body}
`;
}

function tomlEscape(value) {
  return value.replaceAll('\\', '\\\\').replaceAll('"', '\\"');
}

function toCodex(agent) {
  // Cuerpo en multiline literal string; TOML no admite ''' dentro, se degrada a basic string si aparece.
  const body = agent.body.includes("'''")
    ? `"""\n${tomlEscape(agent.body)}\n"""`
    : `'''\n${agent.body}\n'''`;
  return `# ${HEADER_NOTE}
name = "${tomlEscape(agent.name)}"
description = "${tomlEscape(agent.description)}"
sandbox_mode = "${agent.readonly ? 'read-only' : 'workspace-write'}"
developer_instructions = ${body}
`;
}

function emit(dir, fileName, content, drift) {
  const target = join(dir, fileName);
  if (CHECK) {
    const current = existsSync(target) ? readFileSync(target, 'utf8') : null;
    if (current !== content) {
      drift.push(target);
    }
    return;
  }
  mkdirSync(dir, { recursive: true });
  writeFileSync(target, content, 'utf8');
}

const sources = readdirSync(SRC_DIR).filter((f) => f.endsWith('.md'));
if (sources.length === 0) {
  console.error(`Sin fuentes en ${SRC_DIR}`);
  process.exit(1);
}

const drift = [];
for (const file of sources) {
  const agent = parseAgentFile(join(SRC_DIR, file));
  emit(OPENCODE_DIR, `${agent.name}.md`, toOpencode(agent), drift);
  emit(CODEX_DIR, `${agent.name}.toml`, toCodex(agent), drift);
}

if (CHECK) {
  if (drift.length > 0) {
    console.error('Agentes generados desactualizados respecto a .claude/agents/:');
    for (const f of drift) console.error(`  - ${f}`);
    console.error('Ejecuta: pnpm sync:agents');
    process.exit(1);
  }
  console.log(`OK: ${sources.length} agentes sincronizados (opencode + codex).`);
} else {
  console.log(`Generados ${sources.length} agentes → .opencode/agents/ y .codex/agents/`);
}
