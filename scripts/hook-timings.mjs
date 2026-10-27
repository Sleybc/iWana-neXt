/**
 * Resume .claude/hook-timings.jsonl (lo escribe .claude/hooks/lib/hook-input.mjs):
 * ejecuciones, p50, p95 y máximo por hook, y las ejecuciones más lentas.
 *
 *   pnpm hooks:timings                 todo el registro
 *   pnpm hooks:timings -- --since 24h  solo las últimas 24 h (también 30m, 7d)
 *   pnpm hooks:timings -- --reset      vacía el registro
 */

import { existsSync, readFileSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const LOG = join(dirname(fileURLToPath(import.meta.url)), '..', '.claude', 'hook-timings.jsonl');
const UNITS = { m: 60_000, h: 3_600_000, d: 86_400_000 };
// Umbrales a partir de los cuales el hook frena el ciclo de forma perceptible.
const SLOW_MS = { PreToolUse: 2000, PostToolUse: 2000, SessionStart: 10_000, Stop: 10_000 };

const args = process.argv.slice(2);

if (args.includes('--reset')) {
  for (const file of [LOG, `${LOG}.1`]) rmSync(file, { force: true });
  console.log('Registro de tiempos vaciado.');
  process.exit(0);
}

const sinceArg = args[args.indexOf('--since') + 1];
const sinceMatch = args.includes('--since') ? /^(\d+)([mhd])$/.exec(sinceArg ?? '') : null;
if (args.includes('--since') && !sinceMatch) {
  console.error('--since espera un valor como 30m, 24h o 7d');
  process.exit(1);
}
const since = sinceMatch ? Date.now() - Number(sinceMatch[1]) * UNITS[sinceMatch[2]] : 0;

const entries = [`${LOG}.1`, LOG]
  .filter((file) => existsSync(file))
  .flatMap((file) => readFileSync(file, 'utf8').split('\n'))
  .filter(Boolean)
  .map((line) => {
    try {
      return JSON.parse(line);
    } catch {
      return null;
    }
  })
  .filter((entry) => entry && Date.parse(entry.ts) >= since);

if (entries.length === 0) {
  console.log(`Sin registros en ${LOG}. Se llena a medida que Claude Code ejecuta hooks.`);
  process.exit(0);
}

const percentile = (sorted, p) =>
  sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))];

const groups = Map.groupBy(entries, (entry) => `${entry.hook}\t${entry.event ?? '?'}`);
const rows = [...groups].map(([key, list]) => {
  const [hook, event] = key.split('\t');
  const ms = list.map((entry) => entry.ms).sort((a, b) => a - b);
  const limit = SLOW_MS[event] ?? 2000;
  return {
    hook,
    event,
    runs: ms.length,
    p50: percentile(ms, 0.5),
    p95: percentile(ms, 0.95),
    max: ms.at(-1),
    total_s: Math.round(ms.reduce((sum, value) => sum + value, 0) / 100) / 10,
    lentas: ms.filter((value) => value > limit).length,
    bloqueos: list.filter((entry) => entry.exit === 2).length,
  };
});
rows.sort((a, b) => b.total_s - a.total_s);

console.log(
  `${entries.length} ejecuciones desde ${entries[0].ts.slice(0, 16)} (ms; «lentas» = sobre 2 s en Pre/PostToolUse, 10 s en SessionStart/Stop)`,
);
console.table(rows);

console.log('Las 10 ejecuciones más lentas:');
console.table(
  [...entries]
    .sort((a, b) => b.ms - a.ms)
    .slice(0, 10)
    .map(({ ts, hook, tool, file, ms, exit }) => ({
      ts: ts.slice(0, 19),
      hook,
      tool,
      file,
      ms,
      exit,
    })),
);
