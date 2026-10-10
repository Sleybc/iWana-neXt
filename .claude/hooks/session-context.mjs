/**
 * SessionStart: contexto mínimo del árbol. Lo que sale por stdout entra al contexto de
 * Claude al abrir, reanudar o compactar la sesión. Solo lee; nunca bloquea.
 */

import { execFileSync } from 'node:child_process';
import { readdirSync } from 'node:fs';
import { join } from 'node:path';

import { PROJECT_DIR } from './lib/hook-input.mjs';

const git = (...args) => {
  try {
    return execFileSync('git', args, { cwd: PROJECT_DIR, encoding: 'utf8' }).trim();
  } catch {
    return '';
  }
};

let plan = '';
try {
  plan =
    readdirSync(join(PROJECT_DIR, 'docs/plans'))
      .filter((name) => /^\d{4}-\d{2}-\d{2}-.+\.md$/.test(name))
      .sort()
      .at(-1) ?? '';
} catch {
  // Sin docs/plans no hay plan que reportar.
}

const dirty = git('status', '--porcelain').split('\n').filter(Boolean).length;
const upstream = git('rev-list', '--left-right', '--count', '@{upstream}...HEAD');
const [behind, ahead] = upstream ? upstream.split(/\s+/) : [];

console.log(
  [
    `Rama: ${git('branch', '--show-current') || '(desconocida)'} · último commit: ${git('log', '-1', '--format=%h %s')}`,
    upstream ? `Respecto a origin: ${ahead} por delante, ${behind} por detrás` : null,
    `Árbol: ${dirty} rutas con cambios sin commitear`,
    plan ? `Plan más reciente: docs/plans/${plan}` : null,
  ]
    .filter(Boolean)
    .join('\n'),
);
