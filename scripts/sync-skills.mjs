#!/usr/bin/env node
/**
 * sync-skills.mjs — expone el catálogo común de skills a Claude Code (ADR-092).
 *
 * Fuente canónica: .agents/skills/<nombre>/SKILL.md (gobernada por INDEX.md y
 * MANIFEST.json). Claude Code solo descubre skills como `/comando` desde
 * .claude/skills/, así que este script genera ahí un PUNTERO por skill: el mismo
 * frontmatter (para que la descripción dispare la skill) y un cuerpo que remite al
 * SKILL.md canónico. No copia contenido: el catálogo sigue teniendo una sola copia.
 *
 * Uso: node scripts/sync-skills.mjs [--check]
 *   --check  no escribe: falla con exit 1 si hay punteros desactualizados u huérfanos.
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import process from 'node:process';

import { createSurfaceWriter, finish } from './lib/generated-surface.mjs';

const ROOT = join(import.meta.dirname, '..');
const SRC_DIR = join(ROOT, '.agents', 'skills');
const OUT_DIR = join(ROOT, '.claude', 'skills');
const MARKER = 'GENERADO por scripts/sync-skills.mjs';

export function toPointer(skillDir, raw) {
  const match = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n/);
  if (!match) throw new Error(`Frontmatter no encontrado en .agents/skills/${skillDir}/SKILL.md`);
  const frontmatter = match[1].replace(/\r\n/g, '\n');
  const name = frontmatter.match(/^name:\s*["']?([^"'\n]+)["']?\s*$/m)?.[1]?.trim();
  if (name !== skillDir) {
    throw new Error(`.agents/skills/${skillDir}: name "${name}" no coincide con su directorio`);
  }
  const source = `.agents/skills/${skillDir}`;
  return `---
# ${MARKER} desde ${source}/SKILL.md — no editar a mano.
${frontmatter}
---

# ${name}

Esta skill vive en el catálogo común \`.agents/skills/\` (gobernado por \`.agents/skills/INDEX.md\`).

Antes de actuar, lee completo y aplica **\`${source}/SKILL.md\`**. Sus rutas relativas
(\`references/\`, \`scripts/\`, \`assets/\`) se resuelven desde \`${source}/\`.
`;
}

function main() {
  const check = process.argv.includes('--check');
  const writer = createSurfaceWriter({ root: ROOT, check });

  const skills = readdirSync(SRC_DIR, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && existsSync(join(SRC_DIR, entry.name, 'SKILL.md')))
    .map((entry) => entry.name)
    .sort();

  for (const skill of skills) {
    const raw = readFileSync(join(SRC_DIR, skill, 'SKILL.md'), 'utf8');
    writer.emit(join(OUT_DIR, skill, 'SKILL.md'), toPointer(skill, raw));
  }

  // Solo se retiran punteros generados: una skill propia de .claude/skills/ no se toca.
  if (existsSync(OUT_DIR)) {
    for (const entry of readdirSync(OUT_DIR, { withFileTypes: true })) {
      const pointer = join(OUT_DIR, entry.name, 'SKILL.md');
      const generated = existsSync(pointer) && readFileSync(pointer, 'utf8').includes(MARKER);
      if (entry.isDirectory() && generated && !skills.includes(entry.name)) {
        writer.remove(join(OUT_DIR, entry.name));
      }
    }
  }

  finish({
    label: 'sync-skills',
    check,
    drift: writer.drift,
    fixCommand: 'pnpm sync:skills',
    summary: `${skills.length} skills → .claude/skills/`,
  });
}

if (process.argv[1] && import.meta.filename === process.argv[1]) {
  main();
}
