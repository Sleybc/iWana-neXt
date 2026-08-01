#!/usr/bin/env node
/**
 * Aplica SEC-04 (least privilege) tras migraciones — wrapper cross-platform.
 * Equivalente a scripts/db/apply-least-privilege.sh (CI sigue usando bash en Linux).
 *
 * Modos:
 *   docker (default): docker exec en POSTGRES_CONTAINER
 *   host: psql contra DB_HOST (LEAST_PRIVILEGE_MODE=host)
 */
import { readFileSync, existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import process from 'node:process';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const root = join(scriptDir, '../..');
const sqlPath = join(scriptDir, 'apply-least-privilege.sql');

function loadEnvFile(relativePath) {
  const path = join(root, relativePath);
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

const container = process.env.POSTGRES_CONTAINER ?? 'iwana_postgres_dev';
const bootstrapUser = process.env.DB_BOOTSTRAP_USER ?? 'iwana';
const dbName = process.env.DB_NAME ?? process.env.POSTGRES_DB ?? 'dbiw';
const dbHost = process.env.DB_HOST ?? process.env.PGHOST ?? 'localhost';
const dbPort = process.env.DB_PORT ?? process.env.PGPORT ?? '5432';
const bootstrapPass = process.env.DB_BOOTSTRAP_PASSWORD ?? process.env.DB_PASSWORD ?? '';
const appPass = process.env.DB_APP_PASSWORD ?? process.env.DB_PASSWORD ?? 'changeme-dev-only-app';
const migratorPass =
  process.env.DB_MIGRATOR_PASSWORD ?? process.env.DB_PASSWORD ?? 'changeme-dev-only-migrator';
const appUser = process.env.DB_APP_USER ?? 'iwana_app';
const migratorUser = process.env.DB_MIGRATOR_USER ?? 'iwana_migrator';
const mode = process.env.LEAST_PRIVILEGE_MODE ?? 'docker';

if (bootstrapUser === appUser || bootstrapUser === migratorUser) {
  console.error(
    `apply-least-privilege: FALLO DURO (GSEC-N1) — DB_BOOTSTRAP_USER (${bootstrapUser}) no puede ser igual a app/migrator.`,
  );
  process.exit(1);
}

const sql = readFileSync(sqlPath, 'utf8');

/**
 * Evita el fallo silencioso de aplicar los GRANT en una base distinta a la que
 * acaba de migrarse. El default de POSTGRES_CONTAINER es el contenedor de
 * desarrollo: si otro perfil (E2E, staging local) migra contra otro puerto y no
 * lo sobrescribe, este script "termina OK" habiendo tocado la base equivocada, y
 * la base real queda con `iwana_app` sin privilegios sobre las tablas migradas.
 */
function assertContainerMatchesTarget() {
  const loopbackHosts = new Set(['localhost', '127.0.0.1', '::1', '0.0.0.0']);

  // Solo es comparable cuando las migraciones salieron por un puerto publicado
  // en el host. Con DB_HOST apuntando a un servicio de red, `docker port` no
  // dice nada útil y no se bloquea.
  if (!loopbackHosts.has(dbHost)) {
    return;
  }

  const published = spawnSync('docker', ['port', container, '5432/tcp'], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  if (published.status !== 0 || !published.stdout.trim()) {
    return;
  }

  const hostPorts = published.stdout
    .split(/\r?\n/)
    .map((line) => line.trim().split(':').pop())
    .filter(Boolean);

  if (hostPorts.includes(dbPort)) {
    return;
  }

  console.error(
    `apply-least-privilege: FALLO DURO — el contenedor ${container} publica 5432 en ` +
      `${hostPorts.join(', ')}, pero las migraciones corrieron contra ${dbHost}:${dbPort}. ` +
      'Define POSTGRES_CONTAINER con el contenedor de esa misma base (o usa ' +
      'LEAST_PRIVILEGE_MODE=host) antes de repetir `pnpm db:migrate:all`.',
  );
  process.exit(1);
}

function runPsqlDocker() {
  const inspect = spawnSync('docker', ['ps', '--format', '{{.Names}}'], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  if (inspect.status !== 0) {
    console.error('apply-least-privilege: docker ps falló.', inspect.stderr?.trim());
    process.exit(inspect.status ?? 1);
  }

  const names = inspect.stdout.split(/\r?\n/).map((line) => line.trim());
  if (!names.includes(container)) {
    console.error(
      `apply-least-privilege: contenedor ${container} no está en ejecución. Levanta Docker o usa LEAST_PRIVILEGE_MODE=host.`,
    );
    process.exit(1);
  }

  assertContainerMatchesTarget();

  console.log(`apply-least-privilege: modo docker (${container})`);

  const result = spawnSync(
    'docker',
    [
      'exec',
      '-i',
      '-e',
      `PGPASSWORD=${bootstrapPass}`,
      container,
      'psql',
      '-v',
      'ON_ERROR_STOP=1',
      '-U',
      bootstrapUser,
      '-d',
      dbName,
      '-v',
      `app_pass=${appPass}`,
      '-v',
      `migrator_pass=${migratorPass}`,
    ],
    { input: sql, stdio: ['pipe', 'inherit', 'inherit'] },
  );

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

function runPsqlHost() {
  if (!bootstrapPass) {
    console.error(
      'apply-least-privilege: falta DB_BOOTSTRAP_PASSWORD (o DB_PASSWORD) en modo host.',
    );
    process.exit(1);
  }

  console.log(`apply-least-privilege: modo host (${dbHost}:${dbPort})`);

  const result = spawnSync(
    'psql',
    [
      '-v',
      'ON_ERROR_STOP=1',
      '-h',
      dbHost,
      '-p',
      dbPort,
      '-U',
      bootstrapUser,
      '-d',
      dbName,
      '-v',
      `app_pass=${appPass}`,
      '-v',
      `migrator_pass=${migratorPass}`,
    ],
    {
      input: sql,
      stdio: ['pipe', 'inherit', 'inherit'],
      env: { ...process.env, PGPASSWORD: bootstrapPass },
    },
  );

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

if (mode === 'host') {
  runPsqlHost();
} else {
  runPsqlDocker();
}

console.log('apply-least-privilege: OK');
