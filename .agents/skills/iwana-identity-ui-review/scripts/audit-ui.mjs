#!/usr/bin/env node
/**
 * audit-ui.mjs — auditoría mecánica de reglas duras de identidad iWana.
 *
 * Parte de la skill `.agents/skills/iwana-identity-ui-review`. Detecta con
 * archivo:línea las violaciones grep-ables de la tabla "Reglas duras
 * verificables" del SKILL.md. Reglas [D] = deterministas (evidencia directa);
 * reglas [H] = heurísticas (salen marcadas "revisar" y requieren confirmación
 * manual antes de entrar a un informe — regla anti-falso-positivo 2).
 *
 * Uso:
 *   node .agents/skills/iwana-identity-ui-review/scripts/audit-ui.mjs [rutas...] [--json]
 *   (sin rutas: apps/portal/src, apps/web/src, packages/ui/src)
 *
 * Exit code 1 si hay hallazgos deterministas P0/P1 (útil como gate local).
 */

import { readdirSync, readFileSync, statSync, existsSync } from 'node:fs';
import { join, relative, resolve, sep } from 'node:path';
import process from 'node:process';

const args = process.argv.slice(2).filter((a) => a !== '--json');
const JSON_OUT = process.argv.includes('--json');
const ROOT = process.cwd();
const DEFAULT_PATHS = ['apps/portal/src', 'apps/web/src', 'packages/ui/src'];
const targets = (args.length > 0 ? args : DEFAULT_PATHS).map((p) => resolve(ROOT, p));

const SKIP_DIRS = new Set(['node_modules', '.next', 'dist', 'coverage', '.turbo']);
const EXTS = /\.(tsx|ts|css)$/;
const EXCLUDE_FILE = /(styles[\\/]+globals\.css$|[\\/]tokens[\\/]|\.spec\.|\.test\.)/;

// Hex de marca que deben vivir solo en globals.css / tokens (referencia: references/tokens.md)
const BRAND_HEX = /#(?:17163A|A5C330|F8F8FB|F8FAF5|EDF8CC|6A7A1C|48531D|0F0E24)\b/gi;

/** Reglas por línea. kind: 'D' determinista | 'H' heurística. */
const LINE_RULES = [
  {
    id: 'dark-gray',
    kind: 'D',
    sev: 'P1',
    desc: 'dark:bg-gray-{700-950} prohibido (ADR-056 §2) — usar dark-surface-*/dark-border',
    test: (line) => /dark:bg-gray-(?:700|800|900|950)\b/.test(line),
  },
  {
    id: 'brand-hex',
    kind: 'D',
    sev: 'P2',
    desc: 'Hex de marca sin tokenizar — usar el token de globals.css (ver references/tokens.md)',
    test: (line) => {
      BRAND_HEX.lastIndex = 0;
      return BRAND_HEX.test(line);
    },
  },
  {
    id: 'z-war',
    kind: 'D',
    sev: 'P2',
    desc: 'z-index tipo template (z-999+) — la escala iWana es corta (0/10/20/40/100/1000)',
    test: (line) => /\bz-\[?9{3,}/.test(line),
  },
  {
    id: 'lime-text-aa',
    kind: 'H',
    sev: 'P1',
    desc: 'Texto lima sin sufijo AA (usar text-iwana-secondary-700+ sobre fondo claro)',
    test: (line) => {
      const matches = line.matchAll(/((?:[a-z-]+:)*)text-iwana-secondary(?:-(\d{2,3}))?\b/g);
      for (const m of matches) {
        const variants = m[1] ?? '';
        const step = m[2] ? Number(m[2]) : 500;
        if (!variants.includes('dark:') && step < 700) return true;
      }
      return false;
    },
  },
  {
    id: 'lime-50-surface',
    kind: 'H',
    sev: 'P2',
    desc: 'bg-iwana-secondary-50 — posible fondo base (reservado a acentos; el fondo suave es iwana-surface-soft)',
    test: (line) => /bg-iwana-secondary-50\b/.test(line),
  },
  {
    id: 'gradient-misuse',
    kind: 'H',
    sev: 'P2',
    desc: 'Degradado azul→lima fuera de progreso (es firma de avance, no decoración)',
    test: (line) =>
      /from-iwana-primary\b/.test(line) &&
      /to-iwana-secondary\b/.test(line) &&
      !/progres|progress|avance|meter/i.test(line),
  },
  {
    id: 'spinner-primary',
    kind: 'H',
    sev: 'P3',
    desc: 'animate-spin — si es carga primaria de página/tabla, usar skeleton con forma (PortalSkeletonBlock)',
    test: (line) => /\banimate-spin\b/.test(line),
  },
  {
    id: 'raw-enum',
    kind: 'H',
    sev: 'P1',
    desc: 'Posible enum crudo visible (UPPER_SNAKE_CASE en JSX) — derivar a system-vocabulary-review',
    test: (line) => />[A-Z][A-Z0-9]*(?:_[A-Z0-9]+)+</.test(line),
  },
];

function* walk(dir) {
  for (const entry of readdirSync(dir)) {
    if (SKIP_DIRS.has(entry)) continue;
    const full = join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) yield* walk(full);
    else if (EXTS.test(entry)) yield full;
  }
}

const findings = [];

// Regla [D][P0]: tailwind.config.* presente (el sistema es CSS-first por ADR)
for (const base of ['apps/portal', 'apps/web', 'packages/ui']) {
  for (const name of [
    'tailwind.config.js',
    'tailwind.config.ts',
    'tailwind.config.cjs',
    'tailwind.config.mjs',
  ]) {
    const p = resolve(ROOT, base, name);
    if (existsSync(p)) {
      findings.push({
        rule: 'tailwind-config',
        kind: 'D',
        sev: 'P0',
        file: relative(ROOT, p).split(sep).join('/'),
        line: 1,
        desc: 'tailwind.config.* presente — el sistema es Tailwind v4 CSS-first por ADR; tokens vía @theme en globals.css',
        evidence: name,
      });
    }
  }
}

for (const target of targets) {
  if (!existsSync(target)) continue;
  const files = statSync(target).isDirectory() ? [...walk(target)] : [target];
  for (const file of files) {
    const rel = relative(ROOT, file).split(sep).join('/');
    if (EXCLUDE_FILE.test(rel)) continue;
    const lines = readFileSync(file, 'utf8').split(/\r?\n/);
    lines.forEach((line, i) => {
      for (const rule of LINE_RULES) {
        if (rule.test(line)) {
          findings.push({
            rule: rule.id,
            kind: rule.kind,
            sev: rule.sev,
            file: rel,
            line: i + 1,
            desc: rule.desc,
            evidence: line.trim().slice(0, 160),
          });
        }
      }
    });
  }
}

const ORDER = { P0: 0, P1: 1, P2: 2, P3: 3 };
findings.sort(
  (a, b) => ORDER[a.sev] - ORDER[b.sev] || a.file.localeCompare(b.file) || a.line - b.line,
);

const counts = { P0: 0, P1: 0, P2: 0, P3: 0 };
for (const f of findings) counts[f.sev] += 1;
const detBlocking = findings.filter((f) => f.kind === 'D' && (f.sev === 'P0' || f.sev === 'P1'));

if (JSON_OUT) {
  console.log(JSON.stringify({ counts, findings }, null, 2));
} else {
  if (findings.length === 0) {
    console.log('audit-ui: sin hallazgos en las rutas analizadas.');
  } else {
    let currentSev = '';
    for (const f of findings) {
      if (f.sev !== currentSev) {
        currentSev = f.sev;
        console.log(`\n=== ${f.sev} ===`);
      }
      const tag = f.kind === 'H' ? ' [revisar]' : '';
      console.log(`${f.file}:${f.line} — [${f.sev}][${f.rule}]${tag} ${f.desc}`);
      console.log(`    ${f.evidence}`);
    }
    console.log(
      `\nResumen: P0: ${counts.P0} · P1: ${counts.P1} · P2: ${counts.P2} · P3: ${counts.P3} ` +
        `(deterministas bloqueantes: ${detBlocking.length}; los [revisar] requieren confirmación manual)`,
    );
  }
}

process.exit(detBlocking.length > 0 ? 1 : 0);
