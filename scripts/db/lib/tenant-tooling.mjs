/**
 * Infraestructura compartida entre backup-tenant.mjs y restore-tenant.mjs.
 *
 * Antes de este modulo, ambos scripts duplicaban ~150 lineas identicas o casi
 * identicas: CliError, carga de .env, el loader del validador de schema de
 * @iwana/db, assertContainerRunning, runPsqlQuery y sha256File. Un cambio de
 * seguridad en uno (p. ej. el hallazgo SEC-1..5 del dictamen de esta fase)
 * exigia recordar tocar el otro archivo a mano. Vive aqui una sola vez.
 *
 * Las funciones de NEGOCIO de cada script (parseo de argumentos, validacion de
 * schema resuelto, construccion de SQL, sidecar, etc.) NO se movieron: siguen
 * en su archivo, son las que los tests exportan e importan por nombre, y son
 * especificas de backup o de restore, no infraestructura compartida.
 */
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createReadStream, existsSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import process from 'node:process';

/** Error de linea de comandos: mensaje accionable + codigo de salida. */
export class CliError extends Error {
  constructor(message, exitCode = 2) {
    super(message);
    this.name = 'CliError';
    this.exitCode = exitCode;
  }
}

function loadDotEnvFile(repoRoot, relativePath) {
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

/**
 * Carga .env y .env.local (en ese orden, sin pisar variables ya presentes) y
 * devuelve la configuracion de conexion resuelta. Misma familia que
 * backup.mjs / restore.mjs: mismos nombres de variable, mismos defaults.
 */
export function loadTenantToolingEnv(repoRoot) {
  loadDotEnvFile(repoRoot, '.env');
  loadDotEnvFile(repoRoot, '.env.local');

  return {
    mode: process.env.DB_BACKUP_MODE ?? 'docker',
    container: process.env.POSTGRES_CONTAINER ?? 'iwana_postgres_dev',
    dbUser: process.env.DB_BOOTSTRAP_USER ?? process.env.DB_USER ?? 'iwana',
    dbPassword: process.env.DB_PASSWORD ?? process.env.PGPASSWORD ?? '',
    dbName: process.env.DB_NAME ?? process.env.POSTGRES_DB ?? 'dbiw',
    dbHost: process.env.DB_HOST ?? process.env.PGHOST ?? 'localhost',
    dbPort: process.env.DB_PORT ?? process.env.PGPORT ?? '5432',
  };
}

/**
 * Carga isValidSchemaName desde el artefacto COMPILADO de @iwana/db
 * (dist/data-source.js) via createRequire — no se reescribe el regex.
 * `label` identifica al script que falla en el mensaje de error
 * (p. ej. "BACKUP-TENANT" o "RESTORE-TENANT").
 */
export function loadSchemaValidator(repoRoot, label) {
  const dbRoot = join(repoRoot, 'packages/database');
  const requireFromDb = createRequire(join(dbRoot, 'package.json'));
  try {
    const { isValidSchemaName } = requireFromDb('./dist/data-source.js');
    return isValidSchemaName;
  } catch (err) {
    throw new Error(
      `[${label}] no se pudo cargar el validador de schemas de @iwana/db (${err.message}). ` +
        'Ejecute "pnpm --filter @iwana/db build" y reintente.',
    );
  }
}

export function assertContainerRunning(container) {
  const inspect = spawnSync('docker', ['ps', '--format', '{{.Names}}'], { encoding: 'utf8' });
  if (inspect.status !== 0) {
    throw new CliError(`docker ps fallo: ${inspect.stderr?.trim() || 'sin detalle'}`, 1);
  }
  const names = inspect.stdout.split(/\r?\n/).map((line) => line.trim());
  if (!names.includes(container)) {
    throw new CliError(
      `el contenedor ${container} no esta en ejecucion. Levante Docker o use DB_BACKUP_MODE=host.`,
      1,
    );
  }
}

/**
 * Consulta psql con variables server-safe (`:'var'`, sustituidas y escapadas
 * por psql, nunca por concatenacion de JS). El SQL viaja por stdin: ningun
 * dato del tenant toca la linea de comandos.
 *
 * SEC-8: esta garantia cubre `vars` — lo que pasa por `-v`/`:'var'` — no
 * cualquier `sql` libre. Un llamador que construya `sql` interpolando una
 * variable propia (p. ej. `CREATE DATABASE ${name}`, unico caso hoy en
 * restore-tenant.mjs) sigue siendo responsable de validar esa variable ANTES
 * de llamar aqui; `runPsqlQuery` no sanitiza el string `sql` que recibe.
 *
 * `asScript: true` omite `-t -A` (salida tabular sin formato) para sentencias
 * DDL/DML cuyo resultado no se parsea (p. ej. CREATE DATABASE, la reinyeccion
 * de la fila de tenants); por defecto la salida es una fila por linea, lista
 * para separar por saltos de linea.
 */
export function runPsqlQuery(
  env,
  sql,
  vars = {},
  { database = env.dbName, asScript = false, failureHint } = {},
) {
  const varArgs = Object.entries(vars).flatMap(([key, value]) => ['-v', `${key}=${value}`]);
  const outputArgs = asScript ? [] : ['-t', '-A'];
  const psqlArgs = [
    'psql',
    '-U',
    env.dbUser,
    '-X',
    '-v',
    'ON_ERROR_STOP=1',
    ...varArgs,
    '-d',
    database,
    ...outputArgs,
  ];

  let result;
  if (env.mode === 'host') {
    result = spawnSync('psql', ['-h', env.dbHost, '-p', env.dbPort, ...psqlArgs], {
      input: `${sql}\n`,
      encoding: 'utf8',
      env: { ...process.env, PGPASSWORD: env.dbPassword },
      maxBuffer: 16 * 1024 * 1024,
    });
  } else {
    assertContainerRunning(env.container);
    result = spawnSync(
      'docker',
      ['exec', '-i', '-e', `PGPASSWORD=${env.dbPassword}`, env.container, ...psqlArgs],
      { input: `${sql}\n`, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 },
    );
  }

  if (result.status !== 0) {
    const detail =
      (result.stderr ?? '').split(/\r?\n/).find((line) => line.trim()) ?? 'sin detalle';
    throw new CliError(
      `psql fallo (codigo ${result.status}) contra "${database}": ${detail.trim()}.` +
        (failureHint ? ` ${failureHint}` : ''),
      1,
    );
  }

  return result.stdout ?? '';
}

export function sha256File(path) {
  return new Promise((resolvePromise, rejectPromise) => {
    const hash = createHash('sha256');
    const stream = createReadStream(path);
    stream.on('error', rejectPromise);
    stream.on('data', (chunk) => hash.update(chunk));
    stream.on('end', () => resolvePromise(hash.digest('hex')));
  });
}
