/**
 * SessionStart: contexto mínimo del árbol. Lo que sale por stdout entra al contexto de
 * Claude al abrir, reanudar o compactar la sesión. Solo lee; nunca bloquea.
 * Incluye la última corrida de CI de main: el CI estuvo rojo del 12 al 14 de octubre
 * sin que nadie lo viera. Sin gh, sin red o sin remoto, esa línea se omite.
 */

import { execFileSync } from 'node:child_process';
import { readdirSync } from 'node:fs';
import { join } from 'node:path';

import { PROJECT_DIR } from './lib/hook-input.mjs';

const run = (command, args, timeout) => {
  try {
    return execFileSync(command, args, {
      cwd: PROJECT_DIR,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
      timeout,
    }).trim();
  } catch {
    return '';
  }
};
const git = (...args) => run('git', args);

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

let ci = null;
if (upstream) {
  try {
    const [last] = JSON.parse(
      run(
        'gh',
        [
          'run',
          'list',
          '--branch',
          'main',
          '--workflow',
          'CI',
          '--limit',
          '1',
          '--json',
          'status,conclusion,displayTitle,databaseId,headSha',
        ],
        5000,
      ) || '[]',
    );
    if (last) {
      ci = `CI main: ${last.conclusion || last.status} · ${last.headSha.slice(0, 8)} ${last.displayTitle} · run ${last.databaseId}`;
    }
  } catch {
    // Salida inesperada de gh: la línea se omite.
  }
}

console.log(
  [
    `Rama: ${git('branch', '--show-current') || '(desconocida)'} · último commit: ${git('log', '-1', '--format=%h %s')}`,
    upstream ? `Respecto a origin: ${ahead} por delante, ${behind} por detrás` : null,
    `Árbol: ${dirty} rutas con cambios sin commitear`,
    ci,
    plan ? `Plan más reciente: docs/plans/${plan}` : null,
  ]
    .filter(Boolean)
    .join('\n'),
);
