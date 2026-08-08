#!/usr/bin/env node
/**
 * Backup PostgreSQL en formato custom (-Fc) del entorno completo, incluidos
 * todos los schemas de tenant.
 *
 * Por defecto ejecuta pg_dump dentro del contenedor Docker (POSTGRES_CONTAINER);
 * con DB_BACKUP_MODE=host usa el binario pg_dump del host contra DB_HOST:DB_PORT.
 *
 * Parametrizacion por env (defaults dev coherentes):
 *   POSTGRES_CONTAINER  Contenedor postgres (default: iwana_postgres_dev)
 *   DB_USER             Rol que ejecuta pg_dump. Por defecto el rol bootstrap
 *                       (superuser en dev) para un dump completo: ownership,
 *                       roles y todos los schemas. Acotar con DB_USER solo si
 *                       el entorno exige un backup con menos privilegios.
 *   DB_PASSWORD         Password del rol. Nunca por linea de comandos visible.
 *   DB_NAME             Base a respaldar (default: dbiw)
 *   DB_HOST / DB_PORT   Conexion en modo host (defaults localhost:5432)
 *   BACKUP_DIR          Carpeta destino (default: <repo>/.backups, fuera de git)
 *   DB_BACKUP_MODE      docker (default) | host
 *
 * Salida: <DB_NAME>-<timestamp ISO>.dump. Operacion no destructiva: no pide
 * confirmacion.
 */
import { spawn, spawnSync } from 'node:child_process';
import {
  createWriteStream,
  existsSync,
  mkdirSync,
  readFileSync,
  statSync,
  unlinkSync,
} from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import process from 'node:process';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptDir, '../..');

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
const dbName = process.env.DB_NAME ?? process.env.POSTGRES_DB ?? 'dbiw';
const dbHost = process.env.DB_HOST ?? process.env.PGHOST ?? 'localhost';
const dbPort = process.env.DB_PORT ?? process.env.PGPORT ?? '5432';
const backupDir = process.env.BACKUP_DIR
  ? resolve(process.env.BACKUP_DIR)
  : join(repoRoot, '.backups');

/**
 * Un dump con PII versionado es peor que no tener backup. El destino solo puede
 * vivir dentro del arbol de git si git lo ignora (p. ej. .backups/).
 */
function assertBackupDirNotTracked() {
  const dirNorm = backupDir.replace(/[\\/]+$/, '');
  const rootNorm = repoRoot.replace(/[\\/]+$/, '');
  const inside =
    (dirNorm + '\\').startsWith(rootNorm + '\\') || (dirNorm + '/').startsWith(rootNorm + '/');

  if (!inside) {
    return;
  }

  const check = spawnSync('git', ['-C', repoRoot, 'check-ignore', '--quiet', '--', backupDir], {
    encoding: 'utf8',
  });
  if (check.status !== 0) {
    console.error(
      `[BACKUP] FALLO DURO — BACKUP_DIR (${backupDir}) cae dentro del arbol de git y git no lo ignora. ` +
        'Un dump con PII versionado es peor que no tener backup. Mueva BACKUP_DIR fuera del repo ' +
        'o agreguelo a .gitignore.',
    );
    process.exit(1);
  }
}

function containerRunning() {
  const inspect = spawnSync('docker', ['ps', '--format', '{{.Names}}'], { encoding: 'utf8' });
  if (inspect.status !== 0) {
    console.error('[BACKUP] docker ps fallo.', inspect.stderr?.trim());
    process.exit(inspect.status ?? 1);
  }
  const names = inspect.stdout.split(/\r?\n/).map((line) => line.trim());
  if (!names.includes(container)) {
    console.error(
      `[BACKUP] contenedor ${container} no esta en ejecucion. Levanta Docker o usa DB_BACKUP_MODE=host.`,
    );
    process.exit(1);
  }
}

function runPgDump(targetPath) {
  if (mode === 'host') {
    console.log(`[BACKUP] host mode — ${dbHost}:${dbPort}/${dbName} como ${dbUser}`);
  } else {
    containerRunning();
    console.log(`[BACKUP] docker mode (${container}) — ${dbName} como ${dbUser}`);
  }

  const [bin, args] =
    mode === 'host'
      ? ['pg_dump', ['-Fc', '-h', dbHost, '-p', dbPort, '-U', dbUser, '-d', dbName]]
      : [
          'docker',
          [
            'exec',
            '-i',
            '-e',
            `PGPASSWORD=${dbPassword}`,
            container,
            'pg_dump',
            '-Fc',
            '-U',
            dbUser,
            '-d',
            dbName,
          ],
        ];

  const dump = spawn(bin, args, {
    stdio: ['ignore', 'pipe', 'inherit'],
    env: mode === 'host' ? { ...process.env, PGPASSWORD: dbPassword } : process.env,
  });

  const out = createWriteStream(targetPath);
  dump.stdout.pipe(out);

  dump.on('error', (err) => {
    console.error(`[BACKUP] no se pudo iniciar ${bin}:`, err);
    process.exit(1);
  });

  dump.on('close', (code) => {
    out.end();
    if (code !== 0) {
      try {
        unlinkSync(targetPath);
      } catch {
        // el archivo parcial no debe quedar como backup valido
      }
      console.error(`[BACKUP] pg_dump salio con codigo ${code}. No se genero backup.`);
      process.exit(code ?? 1);
    }
    console.log(`[BACKUP] OK — ${targetPath}`);
    console.log(`[BACKUP] tamano: ${statSync(targetPath).size} bytes`);
    process.exit(0);
  });
}

function main() {
  mkdirSync(backupDir, { recursive: true });
  assertBackupDirNotTracked();

  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const fileName = `${dbName}-${stamp}.dump`;
  runPgDump(join(backupDir, fileName));
}

main();
