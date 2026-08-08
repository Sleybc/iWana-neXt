#!/usr/bin/env node
/**
 * Purga de backups por politica de retencion.
 *
 * Los dumps viven en BACKUP_DIR (default <repo>/.backups, ignorado por git).
 * Sin purga, el backup se convierte en el problema que resolvia: ocupa
 * espacio y acumula PII sin fecha de eliminacion. Este script aplica una
 * politica de retencion operativa conservando los backups recientes.
 *
 * Politica por defecto (configurable por argumento):
 *   - Conservar SIEMPRE los ultimos KEEP_COUNT dumps (default 10).
 *   - De los anteriores, purgar los que tengan mas de KEEP_DAYS dias
 *     (default 14). Nunca se borra el unico dump que existe.
 *
 * Fail-closed: sin --execute el script solo informa lo que purgaria
 * (dry-run). La purga real exige --execute explicito, mismo criterio que
 * restore.mjs con --yes.
 *
 * Uso:
 *   node scripts/db/purge-backups.mjs [--keep-count=<n>] [--keep-days=<n>] [--execute]
 *
 * Parametrizacion por env (misma familia que backup.mjs):
 *   BACKUP_DIR          Carpeta con los dumps (default: <repo>/.backups)
 */
import { readdirSync, rmSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import process from 'node:process';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptDir, '../..');
const backupDir = process.env.BACKUP_DIR
  ? resolve(process.env.BACKUP_DIR)
  : join(repoRoot, '.backups');

export const USAGE = `
Purga de backups por politica de retencion (scripts/db/purge-backups.mjs)

  node scripts/db/purge-backups.mjs [--keep-count=<n>] [--keep-days=<n>] [--execute]

OPCIONES
  --keep-count=<n>   Conservar siempre los ultimos <n> dumps (default 10).
  --keep-days=<n>    De los que excedan <n>, purgar los de mas de <n> dias
                     (default 14).
  --execute          Aplica la purga. Sin el, solo informa (dry-run).
  -h, --help         Esta ayuda.

POLITICA
  Conservar SIEMPRE los ultimos KEEP_COUNT dumps; de los anteriores, purgar
  los que superen KEEP_DAYS dias. Nunca se borra el unico dump existente.
  Sin --execute no se borra nada.
`;

const DAY_MS = 24 * 60 * 60 * 1000;

function parseArgs(argv) {
  const parsed = {
    keepCount: 10,
    keepDays: 14,
    execute: false,
    help: false,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];

    if (arg === '-h' || arg === '--help') {
      parsed.help = true;
    } else if (arg === '--execute') {
      parsed.execute = true;
    } else if (arg.startsWith('--keep-count=')) {
      parsed.keepCount = Number(arg.slice('--keep-count='.length));
      if (!Number.isInteger(parsed.keepCount) || parsed.keepCount < 1) {
        throw new Error('--keep-count debe ser un entero >= 1.');
      }
    } else if (arg.startsWith('--keep-days=')) {
      parsed.keepDays = Number(arg.slice('--keep-days='.length));
      if (!Number.isInteger(parsed.keepDays) || parsed.keepDays < 1) {
        throw new Error('--keep-days debe ser un entero >= 1.');
      }
    } else {
      throw new Error(`Argumento no reconocido: "${arg}". Use --help.`);
    }
  }

  return parsed;
}

/** Dumps -Fc ordenados por mtime descendente (mas reciente primero). */
function listDumps() {
  let entries;
  try {
    entries = readdirSync(backupDir, { withFileTypes: true });
  } catch {
    console.error(`[PURGE] no se pudo leer BACKUP_DIR: ${backupDir}`);
    process.exit(1);
  }

  const dumps = entries
    .filter((entry) => entry.isFile() && entry.name.endsWith('.dump'))
    .map((entry) => {
      const full = join(backupDir, entry.name);
      const stat = statSync(full);
      return { name: entry.name, full, mtimeMs: stat.mtimeMs, size: stat.size };
    })
    .sort((a, b) => b.mtimeMs - a.mtimeMs);

  return dumps;
}

function main() {
  let args;
  try {
    args = parseArgs(process.argv.slice(2));
  } catch (err) {
    console.error(`[PURGE] ${err.message}`);
    process.exit(2);
  }

  if (args.help) {
    console.log(USAGE);
    process.exit(0);
  }

  const dumps = listDumps();

  if (dumps.length === 0) {
    console.log(`[PURGE] no hay dumps en ${backupDir}.`);
    process.exit(0);
  }

  const now = Date.now();
  const toPurge = [];
  const kept = [];

  for (let i = 0; i < dumps.length; i += 1) {
    const dump = dumps[i];
    const ageDays = (now - dump.mtimeMs) / DAY_MS;

    // Los primeros KEEP_COUNT se conservan siempre (son el rango de operacion).
    const isInKeepWindow = i < args.keepCount;
    // De los que exceden la ventana, solo se purgan los que superan KEEP_DAYS.
    const isOlderThanRetention = ageDays > args.keepDays;

    if (isInKeepWindow || !isOlderThanRetention) {
      kept.push(dump);
    } else {
      toPurge.push(dump);
    }
  }

  // Nunca dejar el directorio sin ningun dump: protege contra politicas
  // mal escritas (p. ej. --keep-count enorme no borra nada; un keep-days=1
  // con dumps frescos tampoco). Si todo lo demas purgara el unico, se conserva.
  if (kept.length === 0 && toPurge.length > 0) {
    const oldest = toPurge.pop();
    kept.push(oldest);
  }

  const line = (dump) =>
    `  ${dump.name}  (${(dump.size / 1024).toFixed(1)} KiB, ` +
    `${((now - dump.mtimeMs) / DAY_MS).toFixed(1)} d)`;

  console.log(
    `[PURGE] ${backupDir}: ${dumps.length} dump(s) — conservar ${kept.length}, ` +
      `purgar ${toPurge.length} (keep-count=${args.keepCount}, keep-days=${args.keepDays}).`,
  );

  if (kept.length > 0) {
    console.log('Conservados:');
    kept.forEach((dump) => console.log(line(dump)));
  }

  if (toPurge.length === 0) {
    console.log('[PURGE] nada que purgar.');
    process.exit(0);
  }

  console.log('Se purgaran:');
  toPurge.forEach((dump) => console.log(line(dump)));

  if (!args.execute) {
    console.log('[PURGE] Dry-run: no se borro nada. Anada --execute para aplicar la purga.');
    process.exit(0);
  }

  for (const dump of toPurge) {
    rmSync(dump.full, { force: true });
  }
  console.log(`[PURGE] ${toPurge.length} dump(s) eliminados.`);
  process.exit(0);
}

main();
