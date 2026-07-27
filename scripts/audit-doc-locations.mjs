#!/usr/bin/env node
/**
 * audit-doc-locations.mjs — gate de ubicación documental.
 *
 * Implementa la compuerta encargada en
 * `docs/prompts/PROMPT-TRANSVERSAL-GATE-UBICACION-DOCUMENTAL-v1.0.md`:
 * verifica que cada tipo documental viva en la carpeta que le asigna
 * `AGENTS.md` → Documentation Rules (tabla TIPO → carpeta).
 *
 * Causa raíz del gate: durante meses se depositaron prompts de ejecución en
 * `.github/prompts/` en lugar de `docs/prompts/`. La investigación demostró
 * que no fue descuido sino una norma mal escrita: `AGENTS.md` —la fuente de
 * mayor precedencia— asignaba `.github/prompts/` bajo una fila titulada
 * genéricamente «Prompts», y la ruta correcta solo aparecía como «destino
 * sugerido» en una plantilla en estado «En revisión». El 2026-07-27 se
 * corrigió la norma y se migraron 33 archivos; este gate es la pieza que
 * impide la reincidencia, porque el cumplimiento no puede depender de que
 * nadie se equivoque (eso es exactamente lo que ya falló).
 *
 * Reglas:
 *   [D] cualquier `*.prompt.md` en cualquier ruta            → BLOQUEANTE
 *       (sufijo de la convención suprimida el 2026-07-27)
 *   [D] cualquier `PROMPT-*.md` fuera de `docs/prompts/`     → BLOQUEANTE
 *   [D] cualquier carpeta `prompts/` cuya ruta relativa no
 *       sea exactamente `docs/prompts`                       → BLOQUEANTE
 *   [D] `PRD-*.md` fuera de `docs/prds/`                     → AVISO
 *   [D] `HLD-*.md` fuera de `docs/hlds/`                     → AVISO
 *   [D] `ADR-*.md` fuera de `docs/adrs/`                     → AVISO
 *   [D] `INFORME-*.md` fuera de `docs/informes/`             → AVISO
 *
 * Los AVISO son deuda preexistente o decisiones pendientes: se reportan en el
 * resumen pero NUNCA bloquean (no se convierten en gate rojo sin decisión
 * explícita del orquestador — ver el prompt origen).
 *
 * Exclusiones del barrido: `node_modules/`, `.git/`, `dist/`, `.next/`,
 * `.turbo/`, `coverage/`, `.pnpm-store/` y los archivos
 * `docs/prompts/TEMPLATE-*.md` (plantillas, no documentos).
 *
 * Zona exenta: `docs/archive/`. Es material archivado por decisión
 * documental explícita (`docs/informes/INFORME-SISTEMA-NORMALIZACION-
 * DOCUMENTAL-v1.0.md` §tabla de disposición, 2026-07: archivó
 * `INFORME-MOD01-FRONTEND-TAILADMIN-v1.0.md` en `docs/archive/informes/`).
 * La regla TIPO → carpeta gobierna la documentación VIVA; el archivo es
 * histórico congelado y su ubicación ya fue decidida. Resuelve la deuda
 * reportada en `INFORME-TRANSVERSAL-GATE-UBICACION-DOCUMENTAL-v1.0.md` §5.
 *
 * Guardias anti-vacío (Addendum v1.1 — AI-EM-ARCH, 2026-07-27):
 *   [G] filesScanned === 0 → BLOQUEANTE (exit 2)
 *       Si walk() no encuentra ningún archivo .md —por correr desde un
 *       directorio equivocado, por una entrada mal puesta en SKIP_DIRS, o
 *       por un cambio silencioso de rutas—, la salida «sin hallazgos» es
 *       falsa: no se ha verificado nada. Este gate existe para impedir la
 *       reincidencia de un defecto que ya ocurrió, y no puede fallar por
 *       la misma razón que pretende prevenir (hallazgo A-2, mismo patrón
 *       que busyTagsFound > 0 y el paso 089 de CI).
 *
 * Uso:
 *   node scripts/audit-doc-locations.mjs [--json]
 *
 * Exit code 1 si hay hallazgos BLOQUEANTES; exit code 2 si el barrido no
 * encontró documentación (guardia anti-vacío).
 * Mismo contrato de salida que `scripts/audit-adr-citations.mjs`.
 */

import { readdirSync, statSync } from 'node:fs';
import { join, relative, resolve, sep } from 'node:path';
import process from 'node:process';

const JSON_OUT = process.argv.includes('--json');
const ROOT = process.cwd();

const SKIP_DIRS = new Set([
  'node_modules',
  '.git',
  'dist',
  '.next',
  '.turbo',
  'coverage',
  '.pnpm-store',
]);

/**
 * Zonas exentas del barrido (rutas relativas de directorio). Ver cabecera:
 * `docs/archive/` es histórico congelado por decisión documental explícita,
 * no documentación viva sujeta a la regla TIPO → carpeta.
 */
const EXEMPT_DIRS = new Set(['docs/archive']);

/** Única carpeta de prompts del repo (AGENTS.md → Documentation Rules). */
const PROMPTS_DIR = 'docs/prompts';

/**
 * Tipos documentales con carpeta canónica. PROMPT es BLOQUEANTE: la norma
 * «ningún prompt fuera de docs/prompts/» es la que se corrigió el 2026-07-27
 * y la que este gate protege. El resto son AVISO por diseño: puede existir
 * deuda preexistente (p. ej. `docs/archive/`) que nadie ha decidido pagar.
 */
const TYPE_RULES = [
  { prefix: 'PROMPT-', dir: PROMPTS_DIR, sev: 'BLOQUEANTE', rule: 'prompt-outside-docs-prompts' },
  { prefix: 'PRD-', dir: 'docs/prds', sev: 'AVISO', rule: 'prd-outside-docs-prds' },
  { prefix: 'HLD-', dir: 'docs/hlds', sev: 'AVISO', rule: 'hld-outside-docs-hlds' },
  { prefix: 'ADR-', dir: 'docs/adrs', sev: 'AVISO', rule: 'adr-outside-docs-adrs' },
  {
    prefix: 'INFORME-',
    dir: 'docs/informes',
    sev: 'AVISO',
    rule: 'informe-outside-docs-informes',
  },
];

const rel = (p) => relative(ROOT, p).split(sep).join('/');

/** Plantillas de prompts: no son documentos depositados, no se auditan. */
const isTemplate = (r) => /^docs\/prompts\/TEMPLATE-.*\.md$/.test(r);

const findings = [];
let filesScanned = 0;

function walk(dir) {
  for (const entry of readdirSync(dir)) {
    if (SKIP_DIRS.has(entry)) continue;
    const full = join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) {
      if (EXEMPT_DIRS.has(rel(full))) continue;
      if (entry === 'prompts') {
        const r = rel(full);
        if (r !== PROMPTS_DIR) {
          findings.push({
            rule: 'prompts-dir-forbidden',
            sev: 'BLOQUEANTE',
            file: `${r}/`,
            line: 0,
            desc: `Carpeta "prompts/" fuera de su ubicación canónica — la única carpeta de prompts del repo es docs/prompts/ (AGENTS.md → Documentation Rules); mueve su contenido a docs/prompts/ o elimínala`,
          });
        }
      }
      walk(full);
    } else if (entry.endsWith('.md')) {
      filesScanned += 1;
      const r = rel(full);
      if (isTemplate(r)) continue;

      // (1) Sufijo de la convención suprimida el 2026-07-27.
      if (entry.endsWith('.prompt.md')) {
        findings.push({
          rule: 'prompt-md-suffix',
          sev: 'BLOQUEANTE',
          file: r,
          line: 0,
          desc: `Archivo con sufijo ".prompt.md", de la convención suprimida el 2026-07-27 — renómbralo a PROMPT-{MODULO}-{FASE}-v{VERSION}.md y deposítalo en docs/prompts/ (AGENTS.md → Documentation Rules)`,
        });
        continue;
      }

      // (2) Tipos documentales fuera de su carpeta canónica.
      for (const t of TYPE_RULES) {
        if (!entry.startsWith(t.prefix)) continue;
        const parent = rel(dir);
        if (parent === t.dir) break;
        const accion =
          t.sev === 'BLOQUEANTE'
            ? `muévelo a ${t.dir}/ — es la única carpeta de prompts del repo (AGENTS.md → Documentation Rules)`
            : `su carpeta canónica es ${t.dir}/ (AGENTS.md → Documentation Rules)`;
        findings.push({
          rule: t.rule,
          sev: t.sev,
          file: r,
          line: 0,
          desc: `${t.prefix}*.md fuera de ${t.dir}/ — ${accion}`,
        });
        break;
      }
    }
  }
}

walk(ROOT);

// Guardia anti-vacío (Addendum v1.1): si walk() no encontró ningún .md, la
// salida «sin hallazgos» es falsa — no se ha verificado nada. Mismo patrón que
// expect(busyTagsFound).toBeGreaterThan(0) y el paso 089 de CI.
if (filesScanned === 0) {
  console.error(
    'audit-doc-locations: ERROR — el barrido no encontró ningún archivo .md.',
    'Verifica que el script se ejecute desde la raíz del repositorio',
    '(el directorio de trabajo actual no contiene documentación).',
  );
  process.exit(2);
}

const ORDER = { BLOQUEANTE: 0, AVISO: 1 };
findings.sort((a, b) => ORDER[a.sev] - ORDER[b.sev] || a.file.localeCompare(b.file));

const blocking = findings.filter((f) => f.sev === 'BLOQUEANTE');
const warnings = findings.filter((f) => f.sev === 'AVISO');
const counts = {
  BLOQUEANTE: blocking.length,
  AVISO: warnings.length,
  archivosEscaneados: filesScanned,
};

if (JSON_OUT) {
  console.log(JSON.stringify({ counts, findings }, null, 2));
} else {
  if (findings.length === 0) {
    console.log(`audit-doc-locations: sin hallazgos (${filesScanned} archivos .md escaneados).`);
  } else {
    let currentSev = '';
    for (const f of findings) {
      if (f.sev !== currentSev) {
        currentSev = f.sev;
        console.log(`\n=== ${f.sev} ===`);
      }
      console.log(`${f.file} — [${f.sev}][${f.rule}] ${f.desc}`);
    }
    console.log(
      `\nResumen: BLOQUEANTE: ${counts.BLOQUEANTE} · AVISO: ${counts.AVISO} ` +
        `(${filesScanned} archivos .md escaneados; los AVISO no bloquean)`,
    );
  }
}

process.exit(blocking.length > 0 ? 1 : 0);
