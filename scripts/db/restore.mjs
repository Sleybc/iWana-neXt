#!/usr/bin/env node
/**
 * Restaura un backup PostgreSQL en formato custom (-Fc) en una base destino
 * nombrada explicitamente (--target). Nunca toca la base por defecto.
 *
 * Por defecto ejecuta pg_restore dentro del contenedor Docker
 * (POSTGRES_CONTAINER); con DB_BACKUP_MODE=host usa los binarios del host
 * contra DB_HOST:DB_PORT.
 *
 * El restore es DESTRUCTIVO: la base destino es reemplazada por el contenido
 * del backup. Guarda principal: confirmacion interactiva tecleando el nombre
 * exacto del archivo de backup (mismo patron que cli/tenant-revert.ts). Sin
 * TTY no se confirma; --yes es obligatorio en CI/scripts.
 *
 * Uso:
 *   node scripts/db/restore.mjs --list --from <archivo>
 *   node scripts/db/restore.mjs --target <base> --from <archivo> [--yes]
 *
 * Parametrizacion por env (defaults dev coherentes):
 *   POSTGRES_CONTAINER  Contenedor postgres (default: iwana_postgres_dev)
 *   DB_USER             Rol de restore. Por defecto el rol bootstrap (superuser
 *                       en dev) para crear la base y restaurar todos los schemas.
 *   DB_PASSWORD         Password del rol. Nunca por linea de comandos visible.
 *   DB_HOST / DB_PORT   Conexion en modo host (defaults localhost:5432)
 *   DB_BACKUP_MODE      docker (default) | host
 */
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { createInterface } from 'node:readline/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import process from 'node:process';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptDir, '../..');

export const USAGE = `
Restore de backup PostgreSQL (-Fc) (scripts/db/restore.mjs)

  node scripts/db/restore.mjs --target=<base> --from=<archivo> [--yes]
  node scripts/db/restore.mjs --list --from=<archivo>

OPCIONES
  --from=<archivo>   OBLIGATORIO. Ruta al dump -Fc generado por db:backup.
  --target=<base>    OBLIGATORIO para restore. Base destino (p. ej.
                     dbiw_restore_test). Nunca restaura sobre la base por
                     defecto.
  --list, --dry-run  Muestra el contenido del backup con pg_restore --list
                     sin tocar la base.
  --yes              Omite la confirmacion interactiva. Obligatorio cuando no
                     hay TTY (CI, scripts).
  --keep-owner       Conserva el owner del dump. Por defecto se restaura con
                     --no-owner.
  -h, --help         Esta ayuda.

CONFIRMACION
  Con TTY y sin --yes se pide teclear el nombre exacto del archivo de backup.
  Es la unica guarda que obliga a leer sobre que se esta operando.

ADVERTENCIA
  El restore es destructivo: los objetos de la base destino se reemplazan por
  el contenido del backup. La base destino se crea si no existe.
`;

const TARGET_RE = /^[a-z_][a-z0-9_]*$/;

function parseArgs(argv) {
  const parsed = {
    from: undefined,
    target: undefined,
    list: false,
    yes: false,
    keepOwner: false,
    help: false,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];

    if (arg === '-h' || arg === '--help') {
      parsed.help = true;
    } else if (arg === '--list' || arg === '--dry-run') {
      parsed.list = true;
    } else if (arg === '--yes') {
      parsed.yes = true;
    } else if (arg === '--keep-owner') {
      parsed.keepOwner = true;
    } else if (arg === '--from' || arg.startsWith('--from=')) {
      parsed.from = arg === '--from' ? argv[++i] : arg.slice('--from='.length);
      if (parsed.from === undefined) {
        throw new Error('--from exige un valor (--from=<archivo> o --from <archivo>).');
      }
    } else if (arg === '--target' || arg.startsWith('--target=')) {
      parsed.target = arg === '--target' ? argv[++i] : arg.slice('--target='.length);
      if (parsed.target === undefined) {
        throw new Error('--target exige un valor (--target=<base> o --target <base>).');
      }
    } else {
      throw new Error(`Argumento no reconocido: "${arg}". Use --help.`);
    }
  }

  return parsed;
}

function loadEnvFile(relativePath) {
  const path = join(repoRoot, relativePath);
  if (!existsSync(path)) {
    return;
  }

  const content = readFileSync(path, 'utf8');
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) {
      continue;
    }
    const eq = trimmed.indexOf('=');
    if (eq === -1) {
      continue;
    }
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (!(key in process.env)) {
      process.env[key] = value;
    }
  }
}

loadEnvFile('.env');
loadEnvFile('.env.local');

const mode = process.env.DB_BACKUP_MODE ?? 'docker';
const container = process.env.POSTGRES_CONTAINER ?? 'iwana_postgres_dev';
const dbUser = process.env.DB_BOOTSTRAP_USER ?? process.env.DB_USER ?? 'iwana';
const dbPassword = process.env.DB_PASSWORD ?? process.env.PGPASSWORD ?? '';
const dbHost = process.env.DB_HOST ?? process.env.PGHOST ?? 'localhost';
const dbPort = process.env.DB_PORT ?? process.env.PGPORT ?? '5432';

function dockerExec(args, { inherit = false } = {}) {
  return spawnSync('docker', ['exec', '-i', '-e', `PGPASSWORD=${dbPassword}`, container, ...args], {
    encoding: 'utf8',
    stdio: inherit ? ['pipe', 'inherit', 'inherit'] : ['pipe', 'pipe', 'pipe'],
  });
}

function hostExec(args, { inherit = false } = {}) {
  return spawnSync(args[0], args.slice(1), {
    encoding: 'utf8',
    env: { ...process.env, PGPASSWORD: dbPassword },
    stdio: inherit ? ['pipe', 'inherit', 'inherit'] : ['pipe', 'pipe', 'pipe'],
  });
}

function runPsql(args, opts) {
  const psqlArgs = ['psql', '-U', dbUser, ...args];
  return mode === 'host' ? hostExec(psqlArgs, opts) : dockerExec(psqlArgs, opts);
}

function containerRunning() {
  const inspect = spawnSync('docker', ['ps', '--format', '{{.Names}}'], { encoding: 'utf8' });
  if (inspect.status !== 0) {
    console.error('[RESTORE] docker ps fallo.', inspect.stderr?.trim());
    process.exit(inspect.status ?? 1);
  }
  const names = inspect.stdout.split(/\r?\n/).map((line) => line.trim());
  if (!names.includes(container)) {
    console.error(
      `[RESTORE] contenedor ${container} no esta en ejecucion. Levanta Docker o usa DB_BACKUP_MODE=host.`,
    );
    process.exit(1);
  }
}

function ensureContainer() {
  if (mode !== 'host') {
    containerRunning();
  }
}

function basename(path) {
  return path.split(/[\\/]/).pop() ?? path;
}

/**
 * pg_restore --list valida que el archivo sea un dump -Fc legible y devuelve su
 * contenido. Un archivo que no es un archive custom falla con codigo != 0.
 * En modo docker el dump se copia a /tmp del contenedor (pg_restore no lee
 * formato custom desde stdin) y se limpia al terminar.
 */
function restoreList(dumpPath) {
  ensureContainer();

  if (mode === 'host') {
    return spawnSync('pg_restore', ['-U', dbUser, '--list', dumpPath], {
      encoding: 'utf8',
      env: { ...process.env, PGPASSWORD: dbPassword },
    });
  }

  const remote = `/tmp/${basename(dumpPath)}`;
  const cp = spawnSync('docker', ['cp', dumpPath, `${container}:${remote}`], { encoding: 'utf8' });

  if (cp.status !== 0) {
    console.error('[RESTORE] docker cp fallo:', cp.stderr?.trim());
    process.exit(cp.status ?? 1);
  }

  try {
    return dockerExec(['pg_restore', '-U', dbUser, '--list', remote]);
  } finally {
    dockerExec(['rm', '-f', remote]);
  }
}

function targetExists(target) {
  const result = runPsql([
    '-d',
    'postgres',
    '-t',
    '-A',
    '-c',
    `SELECT 1 FROM pg_database WHERE datname='${target}'`,
  ]);
  return result.status === 0 && result.stdout.trim() === '1';
}

function createTarget(target) {
  const result = runPsql([
    '-d',
    'postgres',
    '-v',
    'ON_ERROR_STOP=1',
    '-c',
    `CREATE DATABASE ${target}`,
  ]);
  if (result.status !== 0) {
    console.error('[RESTORE] no se pudo crear la base destino:', result.stderr?.trim());
    process.exit(result.status ?? 1);
  }
}

function runPgRestore(dumpPath, target, keepOwner) {
  ensureContainer();

  const ownerArgs = keepOwner ? [] : ['--no-owner'];
  const existed = targetExists(target);

  if (!existed) {
    console.log(`[RESTORE] la base "${target}" no existe; se crea antes de restaurar.`);
    createTarget(target);
  } else {
    console.log(
      `[RESTORE] la base "${target}" ya existe; sus objetos se reemplazan (--clean --if-exists).`,
    );
  }

  const cleanArgs = existed ? ['--clean', '--if-exists'] : [];

  if (mode === 'host') {
    const result = spawnSync(
      'pg_restore',
      ['-U', dbUser, '--exit-on-error', ...cleanArgs, ...ownerArgs, '-d', target, dumpPath],
      {
        stdio: ['ignore', 'inherit', 'inherit'],
        env: { ...process.env, PGPASSWORD: dbPassword },
      },
    );
    return result.status ?? 1;
  }

  const remote = `/tmp/${basename(dumpPath)}`;
  const cp = spawnSync('docker', ['cp', dumpPath, `${container}:${remote}`], { encoding: 'utf8' });

  if (cp.status !== 0) {
    console.error('[RESTORE] docker cp fallo:', cp.stderr?.trim());
    return cp.status ?? 1;
  }

  try {
    const result = dockerExec(
      [
        'pg_restore',
        '-U',
        dbUser,
        '--exit-on-error',
        ...cleanArgs,
        ...ownerArgs,
        '-d',
        target,
        remote,
      ],
      { inherit: true },
    );
    return result.status ?? 1;
  } finally {
    dockerExec(['rm', '-f', remote]);
  }
}

async function confirmRestore(fromPath) {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try {
    const base = basename(fromPath);
    console.log(`\nSe restaurara el backup "${base}".`);
    console.log('ADVERTENCIA: la base destino sera reemplazada por el contenido del backup.');
    const answer = await rl.question(`Teclee el nombre del archivo de backup para confirmar: `);
    return answer.trim() === base;
  } finally {
    rl.close();
  }
}

async function main() {
  let args;
  try {
    args = parseArgs(process.argv.slice(2));
  } catch (err) {
    console.error(`[RESTORE] ${err.message}`);
    process.exit(2);
  }

  if (args.help) {
    console.log(USAGE);
    process.exit(0);
  }

  if (!args.from) {
    console.error('[RESTORE] Falta --from=<archivo>. Use --help para ver la ayuda completa.');
    process.exit(2);
  }

  const fromPath = resolve(process.cwd(), args.from);

  if (!existsSync(fromPath)) {
    console.error(`[RESTORE] El archivo no existe: ${fromPath}`);
    process.exit(2);
  }

  const list = restoreList(fromPath);
  if (list.status !== 0) {
    console.error(
      `[RESTORE] "${fromPath}" no es un dump -Fc valido (pg_restore --list fallo). ` +
        'No se toco ninguna base.',
    );
    process.exit(list.status ?? 1);
  }

  if (args.list) {
    console.log(`[RESTORE] Contenido de ${basename(fromPath)}:\n`);
    console.log(list.stdout);
    process.exit(0);
  }

  if (!args.target) {
    console.error(
      '[RESTORE] Falta --target=<base>. El restore exige una base destino explicita; nunca restaura sobre la base por defecto.',
    );
    process.exit(2);
  }

  if (!TARGET_RE.test(args.target)) {
    console.error(
      `[RESTORE] --target debe ser un nombre de base simple (letras, digitos, guion bajo): "${args.target}".`,
    );
    process.exit(2);
  }

  if (!args.yes) {
    if (!process.stdin.isTTY) {
      console.error(
        '[RESTORE] Sin TTY no se puede confirmar de forma interactiva. Anada --yes de forma explicita.',
      );
      process.exit(2);
    }

    if (!(await confirmRestore(fromPath))) {
      console.error('[RESTORE] Confirmacion no coincide. Abortado sin tocar la base.');
      process.exit(1);
    }
  }

  console.log(
    `[RESTORE] ADVERTENCIA: la base "${args.target}" sera reemplazada por el contenido del backup.`,
  );
  console.log(`[RESTORE] Restaurando ${basename(fromPath)} sobre "${args.target}" ...`);
  const code = runPgRestore(fromPath, args.target, args.keepOwner);
  if (code !== 0) {
    console.error(`[RESTORE] pg_restore salio con codigo ${code}.`);
    process.exit(code);
  }
  console.log(`[RESTORE] Restore completado sobre "${args.target}".`);
  process.exit(0);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  void main();
}
