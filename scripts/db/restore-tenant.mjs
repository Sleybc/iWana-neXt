#!/usr/bin/env node
/**
 * Restore de UN tenant desde un backup por tenant: dump -Fc + sidecar
 * <schema>-<utc>.tenant.json generado por scripts/db/backup-tenant.mjs.
 *
 * Invariantes (SPEC-PLAT-OPS-RESTORE-POR-TENANT-v1.0 §3):
 *   - el schema se toma del dump y del sidecar (nunca de un argumento), se
 *     valida con el validador de @iwana/db y debe coincidir entre ambos;
 *   - modo ensayo por defecto: la base destino debe ser distinta de DB_NAME.
 *     Restaurar sobre la base de origen exige --force-same-database y una
 *     confirmacion interactiva explicita;
 *   - si el schema ya existe en destino, aborta e indica el procedimiento con
 *     ventana del runbook §6.3; el comando no elimina schemas ni ejecuta un
 *     reemplazo con DROP y CASCADE;
 *   - sin sidecar el dump no es restaurable: aborta con mensaje accionable en
 *     vez de dejar un schema huerfano.
 *
 * Requiere `pnpm --filter @iwana/db build` previo (validador compilado).
 *
 * Uso:
 *   node scripts/db/restore-tenant.mjs --file=<ruta.dump> --into=<base> [--force-same-database]
 *   pnpm db:restore:tenant --file=<ruta.dump> --into=<base>
 *
 * Parametrizacion por env (misma familia que restore.mjs):
 *   POSTGRES_CONTAINER  Contenedor postgres (default: iwana_postgres_dev)
 *   DB_BOOTSTRAP_USER / DB_USER  Rol de restore (crea la base y restaura)
 *   DB_PASSWORD         Password del rol. Nunca por linea de comandos visible.
 *   DB_NAME             Base de origen; jamas se restaura sobre ella sin la
 *                       bandera y la confirmacion (default: dbiw)
 *   DB_HOST / DB_PORT   Conexion en modo host (defaults localhost:5432)
 *   DB_BACKUP_MODE      docker (default) | host
 */
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { createInterface } from 'node:readline/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import process from 'node:process';
import {
  CliError,
  assertContainerRunning,
  loadSchemaValidator,
  loadTenantToolingEnv,
  runPsqlQuery as runPsqlQueryShared,
  sha256File,
} from './lib/tenant-tooling.mjs';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptDir, '../..');

export const USAGE = `
Restore por tenant de PostgreSQL (-Fc) (scripts/db/restore-tenant.mjs)

  node scripts/db/restore-tenant.mjs --file=<ruta.dump> --into=<base> [--force-same-database]

OPCIONES
  --file=<ruta.dump>    OBLIGATORIO. Dump -Fc de db:backup:tenant. Su sidecar
                        <ruta sin .dump>.tenant.json debe estar junto al dump.
  --into=<base>         OBLIGATORIO. Base destino. Debe ser distinta de
                        DB_NAME (modo ensayo).
  --force-same-database Permite como destino la propia DB_NAME. Exige
                        confirmacion interactiva tecleando el schema exacto.
  -h, --help            Esta ayuda.

GUARDAS
  - El schema sale del dump y del sidecar, se valida contra
    ^tenant_[a-z][a-z0-9_]{0,54}$ y debe coincidir entre ambos.
  - Si el schema ya existe en destino, aborta: no elimina schemas ni usa un
    reemplazo destructivo. Siga el procedimiento con ventana del runbook §6.3.
  - Sin sidecar, o con checksum que no corresponde, aborta sin tocar la base.

RESUMEN EMITIDO (sanitizado)
  duracion, sha256 del dump, base destino, schema restaurado y conteo de
  tablas. Nunca filas de negocio.
`;

export { CliError };

// --- Validacion de schema: reutiliza @iwana/db, no lo reescribe ---
const isValidSchemaName = loadSchemaValidator(repoRoot, 'RESTORE-TENANT');

const env = loadTenantToolingEnv(repoRoot);
const { mode, container, dbName } = env;

export function parseTenantRestoreArgs(argv) {
  const parsed = {
    file: undefined,
    into: undefined,
    forceSameDatabase: false,
    help: false,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];

    if (arg === '-h' || arg === '--help') {
      parsed.help = true;
    } else if (arg === '--file' || arg.startsWith('--file=')) {
      const value = arg === '--file' ? argv[++i] : arg.slice('--file='.length);
      if (value === undefined || value.trim() === '' || value.startsWith('--')) {
        throw new CliError('--file exige un valor (--file=<ruta.dump> o --file <ruta.dump>).');
      }
      parsed.file = value;
    } else if (arg === '--into' || arg.startsWith('--into=')) {
      const value = arg === '--into' ? argv[++i] : arg.slice('--into='.length);
      if (value === undefined || value.trim() === '' || value.startsWith('--')) {
        throw new CliError('--into exige un valor (--into=<base> o --into <base>).');
      }
      parsed.into = value;
    } else if (arg === '--force-same-database') {
      parsed.forceSameDatabase = true;
    } else {
      throw new CliError(`Argumento no reconocido: "${arg}". Use --help.`);
    }
  }

  return parsed;
}

export function isValidDatabaseName(name) {
  return /^[a-z_][a-z0-9_]*$/.test(name);
}

/** El sidecar vive junto al dump: <dump sin .dump>.tenant.json. */
export function deriveSidecarPath(dumpPath) {
  return dumpPath.endsWith('.dump')
    ? `${dumpPath.slice(0, -'.dump'.length)}.tenant.json`
    : `${dumpPath}.tenant.json`;
}

/** CA-8: sin sidecar el dump no es restaurable a un sistema funcional. */
export function assertSidecarAvailable(sidecarPath, exists = existsSync) {
  if (!exists(sidecarPath)) {
    throw new CliError(
      `falta el sidecar "${sidecarPath}": el backup esta incompleto. Genere un backup nuevo con ` +
        'db:backup:tenant y conserve dump + sidecar juntos. No se toco ninguna base.',
    );
  }
}

/**
 * El sidecar es la unica fuente del schema_name en restore; se valida aqui y se
 * exige la fila completa de public.tenants (id y slug incluidos).
 */
export function parseSidecar(content) {
  let doc;
  try {
    doc = JSON.parse(content);
  } catch {
    throw new CliError(
      'el sidecar no es JSON valido; el artefacto de backup esta corrupto. ' +
        'Genere un backup nuevo con db:backup:tenant. No se toco ninguna base.',
    );
  }

  const schemaName = doc?.schema_name;
  if (typeof schemaName !== 'string' || !isValidSchemaName(schemaName)) {
    throw new CliError(
      'el sidecar no declara un schema_name que cumpla ^tenant_[a-z][a-z0-9_]{0,54}$; ' +
        'se aborta sin tocar la base destino.',
    );
  }

  const tenant = doc?.tenant;
  if (
    !tenant ||
    typeof tenant !== 'object' ||
    tenant.schema_name !== schemaName ||
    typeof tenant.id !== 'string' ||
    typeof tenant.slug !== 'string'
  ) {
    throw new CliError(
      'el sidecar no contiene la fila completa de public.tenants o su schema_name no coincide con ' +
        'el declarado; el artefacto esta incompleto. No se toco ninguna base.',
    );
  }

  const dumpSha256 = doc?.dump_sha256;
  if (typeof dumpSha256 !== 'string' || !/^[0-9a-f]{64}$/.test(dumpSha256)) {
    throw new CliError(
      'sidecar sin dump_sha256: artefacto incompleto o de formato no soportado; genere el backup ' +
        'con db:backup:tenant. No se toco ninguna base.',
    );
  }

  return { schemaName, tenant, dumpSha256 };
}

/** Extrae los SCHEMA del indice (TOC) de pg_restore --list. */
export function parseDumpSchemas(tocText) {
  const schemas = [];
  for (const line of tocText.split(/\r?\n/)) {
    const match = /^\d+;\s+\d+\s+\d+\s+SCHEMA\s+-\s+(\S+)/.exec(line);
    if (match) {
      schemas.push(match[1]);
    }
  }
  return schemas;
}

/**
 * Fail-closed: un dump por tenant debe declarar exactamente un schema, valido
 * contra el contrato, e identico al del sidecar.
 */
export function assertDumpMatchesSidecar(dumpSchemas, sidecarSchema) {
  if (dumpSchemas.length === 0) {
    throw new CliError(
      'el dump no declara ningun SCHEMA en su indice; el archivo esta corrupto o no es un dump -Fc. ' +
        'No se toco ninguna base.',
    );
  }
  if (dumpSchemas.length > 1) {
    throw new CliError(
      `el dump declara ${dumpSchemas.length} schemas; un backup por tenant debe declarar exactamente uno. ` +
        'No se toco ninguna base.',
    );
  }
  const [dumpSchema] = dumpSchemas;
  if (!isValidSchemaName(dumpSchema)) {
    throw new CliError(
      'el schema declarado por el dump no cumple el contrato tenant_*; no se toco ninguna base.',
    );
  }
  if (dumpSchema !== sidecarSchema) {
    throw new CliError(
      'el schema del dump no coincide con el schema del sidecar; los artefactos pertenecen a tenants ' +
        'distintos. No se toco ninguna base.',
    );
  }
  return dumpSchema;
}

/** Modo ensayo por defecto: el origen solo con bandera explicita. */
export function assertDestinationAllowed({ into, origin, forceSameDatabase }) {
  if (into === origin && !forceSameDatabase) {
    throw new CliError(
      `la base destino "${into}" coincide con DB_NAME (origen). El modo por defecto es ensayo: use ` +
        '--into con otra base, o --force-same-database para restaurar el origen con confirmacion interactiva.',
    );
  }
}

/**
 * Confirmacion interactiva para restaurar sobre la base de origen: sin TTY no
 * hay confirmacion posible y el comando aborta. `question` es inyectable para
 * pruebas; en operacion lee de stdin.
 */
export async function confirmSameDatabaseRestore(
  schemaName,
  { isTty = process.stdin.isTTY, question } = {},
) {
  if (!isTty) {
    throw new CliError(
      'sin TTY no se puede confirmar la restauracion sobre la base de origen; ejecute en una ' +
        'terminal interactiva o use otra base destino.',
    );
  }
  const answer = question ? await question(schemaName) : await askSchemaConfirmation(schemaName);
  if (answer.trim() !== schemaName) {
    throw new CliError('confirmacion no coincide. Abortado sin tocar la base.', 1);
  }
}

async function askSchemaConfirmation(schemaName) {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try {
    return await rl.question(`Teclee el schema exacto ("${schemaName}") para confirmar: `);
  } finally {
    rl.close();
  }
}

/**
 * Reinyecta la fila de public.tenants desde el sidecar. El JSON viaja por
 * stdin (nunca por argv ni logs) y el literal SQL se escapa duplicando comillas
 * con standard_conforming_strings fijado en on.
 */
export function buildTenantRegisterSql(tenantRow) {
  const json = JSON.stringify(tenantRow).replace(/'/g, "''");
  return [
    'SET standard_conforming_strings = on;',
    'BEGIN;',
    `INSERT INTO public.tenants SELECT r.* FROM jsonb_populate_record(NULL::public.tenants, '${json}'::jsonb) AS r;`,
    'COMMIT;',
  ].join('\n');
}

/**
 * Args de pg_restore sin reemplazo destructivo: no hay modo clean ni DROP de
 * por medio. `--exit-on-error` convierte cualquier error oculto en fallo.
 */
export function buildPgRestoreArgs({ remotePath, into, user = env.dbUser }) {
  return ['-U', user, '--exit-on-error', '--no-owner', '--no-privileges', '-d', into, remotePath];
}

function basename(path) {
  return path.split(/[\\/]/).pop() ?? path;
}

/** Consulta psql con las variables de conexion de este script. */
function runPsqlQuery(sql, vars = {}, opts = {}) {
  return runPsqlQueryShared(env, sql, vars, opts);
}

function queryLines(sql, vars = {}, database = dbName) {
  return runPsqlQuery(sql, vars, { database })
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

function databaseExists(name) {
  return (
    queryLines(
      `SELECT 1 FROM pg_database WHERE datname = :'db_name'`,
      { db_name: name },
      'postgres',
    ).length > 0
  );
}

function createDatabase(name) {
  // `name` ya paso el regex de nombre simple: no puede contener SQL.
  runPsqlQuery(`CREATE DATABASE ${name}`, {}, { database: 'postgres', asScript: true });
}

function schemaExists(database, schemaName) {
  return (
    queryLines(
      `SELECT 1 FROM pg_namespace WHERE nspname = :'schema'`,
      { schema: schemaName },
      database,
    ).length > 0
  );
}

function tenantsRegistryExists(database) {
  const rows = queryLines(`SELECT to_regclass('public.tenants') IS NOT NULL`, {}, database);
  return rows[0] === 't';
}

function assertNoRegistryConflicts(database, sidecar) {
  const rows = queryLines(
    `SELECT count(*) FROM public.tenants WHERE id::text = :'tenant_id' OR slug = :'tenant_slug' OR schema_name = :'schema'`,
    { tenant_id: sidecar.tenant.id, tenant_slug: sidecar.tenant.slug, schema: sidecar.schemaName },
    database,
  );
  if (Number(rows[0] ?? '0') > 0) {
    throw new CliError(
      'ya existe una fila en public.tenants de la base destino que colisiona con el tenant del backup ' +
        '(mismo id, slug o schema_name). No se toco la base; revise el destino.',
    );
  }
}

/**
 * Resuelve la ruta que `pg_restore` debe usar: la local tal cual en modo host,
 * o una copia dentro del contenedor en modo docker (UNA sola vez).
 *
 * Antes, `runPgRestoreList` y `runPgRestore` copiaban el mismo dump al
 * contenedor por separado — dos `docker cp` del mismo archivo para una sola
 * operacion de restore, el doble de I/O de copia para un dump grande. Ambas
 * llamadas (--list y el restore real) comparten ahora la misma copia; se
 * limpia una vez con `cleanupEffectiveDumpPath`, tras cualquiera de las dos.
 */
function prepareEffectiveDumpPath(dumpPath) {
  if (mode === 'host') {
    return dumpPath;
  }
  assertContainerRunning(container);
  const remote = `/tmp/${basename(dumpPath)}`;
  const copy = spawnSync('docker', ['cp', dumpPath, `${container}:${remote}`], {
    encoding: 'utf8',
  });
  if (copy.status !== 0) {
    throw new CliError(`docker cp fallo: ${copy.stderr?.trim() || 'sin detalle'}`, 1);
  }
  return remote;
}

/** No-op en modo host. En docker, borra la copia remota aunque el paso previo haya fallado. */
function cleanupEffectiveDumpPath(effectivePath) {
  if (mode === 'host') {
    return;
  }
  spawnSync('docker', ['exec', '-i', container, 'rm', '-f', effectivePath], { encoding: 'utf8' });
}

function runPgRestoreList(effectivePath) {
  const result =
    mode === 'host'
      ? spawnSync(
          'pg_restore',
          ['-h', env.dbHost, '-p', env.dbPort, '-U', env.dbUser, '--list', effectivePath],
          {
            encoding: 'utf8',
            env: { ...process.env, PGPASSWORD: env.dbPassword },
            maxBuffer: 64 * 1024 * 1024,
          },
        )
      : spawnSync(
          'docker',
          [
            'exec',
            '-i',
            '-e',
            `PGPASSWORD=${env.dbPassword}`,
            container,
            'pg_restore',
            '-U',
            env.dbUser,
            '--list',
            effectivePath,
          ],
          { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 },
        );

  if (result.status !== 0) {
    throw new CliError(
      'el archivo no es un dump -Fc valido o esta corrupto (pg_restore --list fallo). ' +
        'No se toco ninguna base.',
    );
  }
  return result.stdout ?? '';
}

function runPgRestore(effectivePath, into) {
  if (mode === 'host') {
    const result = spawnSync(
      'pg_restore',
      [
        '-h',
        env.dbHost,
        '-p',
        env.dbPort,
        ...buildPgRestoreArgs({ remotePath: effectivePath, into }),
      ],
      {
        stdio: ['ignore', 'inherit', 'inherit'],
        env: { ...process.env, PGPASSWORD: env.dbPassword },
      },
    );
    return result.status ?? 1;
  }

  const result = spawnSync(
    'docker',
    [
      'exec',
      '-i',
      '-e',
      `PGPASSWORD=${env.dbPassword}`,
      container,
      'pg_restore',
      ...buildPgRestoreArgs({ remotePath: effectivePath, into }),
    ],
    { stdio: ['ignore', 'inherit', 'inherit'] },
  );
  return result.status ?? 1;
}

function injectTenantRow(database, sidecar) {
  try {
    runPsqlQuery(buildTenantRegisterSql(sidecar.tenant), {}, { database, asScript: true });
    const rows = queryLines(
      `SELECT count(*) FROM public.tenants WHERE schema_name = :'schema'`,
      { schema: sidecar.schemaName },
      database,
    );
    if (rows[0] !== '1') {
      throw new Error(`conteo de reinyeccion inesperado: ${rows[0] ?? 'sin resultado'}`);
    }
  } catch (err) {
    throw new CliError(
      `el schema se restauro pero la reinyeccion de la fila en public.tenants fallo (${err.message}). ` +
        'El registro del tenant NO quedo completo; revise el destino antes de continuar.',
      1,
    );
  }
}

/**
 * Mensaje de `pg_restore` fallido. Si este comando creo la base (no existia
 * antes), el fallo la deja huerfana y vacia o con un schema parcial: decirlo
 * explicitamente evita que el operador la confunda con una base preexistente
 * que exige el procedimiento con ventana del runbook §6.3 — esta nunca tuvo
 * datos. Extraida como funcion pura para poder fijarla con un test sin
 * necesitar reproducir un fallo real de pg_restore contra Postgres.
 */
export function buildRestoreFailureMessage({ code, into, schemaName, targetExisted }) {
  const orphanHint = !targetExisted
    ? ` La base "${into}" la creo este mismo comando: si no la necesita, puede eliminarla ` +
      `directamente (nunca tuvo datos previos). Si prefiere reintentar, revise antes su schema ` +
      `"${schemaName}": el comando aborta si ya existe.`
    : ` Revise el estado de "${into}" antes de reintentar: el comando aborta si el schema ` +
      `"${schemaName}" ya existe.`;
  return `pg_restore salio con codigo ${code}; el restore no se completo.${orphanHint}`;
}

/**
 * Resumen final sanitizado: duracion, checksum, base destino, schema y conteo
 * de tablas, sin filas de negocio. Incluye el pendiente operativo H-1: sin
 * re-aplicar grants, el schema restaurado no queda operativo para la app.
 */
export function buildRestoreSummaryLines({
  schemaName,
  database,
  created,
  dumpName,
  checksum,
  tableCount,
  injection,
  durationSeconds,
  operator,
}) {
  return [
    `[RESTORE-TENANT] OK — schema ${schemaName}`,
    `[RESTORE-TENANT] base destino: ${database}${created ? ' (creada)' : ''}`,
    `[RESTORE-TENANT] dump: ${dumpName} | sha256: ${checksum}`,
    `[RESTORE-TENANT] tablas restauradas: ${tableCount}`,
    `[RESTORE-TENANT] reinyeccion public.tenants: ${injection}`,
    `[RESTORE-TENANT] duracion: ${durationSeconds.toFixed(1)} s | operador: ${operator}`,
    '[RESTORE-TENANT] pendiente operativo: re-aplicar grants de runtime (runbook §6.3, paso post-restore) antes de declarar el schema operativo.',
  ];
}

export async function main(argv = process.argv.slice(2), log = console) {
  const args = parseTenantRestoreArgs(argv);
  if (args.help) {
    log.log(USAGE);
    return 0;
  }

  if (!args.file) {
    throw new CliError('Falta --file=<ruta.dump>. Use --help para ver la ayuda completa.');
  }
  if (!args.into) {
    throw new CliError(
      'Falta --into=<base>. El restore exige una base destino explicita; nunca restaura sobre la base ' +
        'de origen sin bandera y confirmacion.',
    );
  }
  if (!isValidDatabaseName(args.into)) {
    throw new CliError(
      `--into debe ser un nombre de base simple (letras, digitos, guion bajo): "${args.into}".`,
    );
  }

  const filePath = resolve(process.cwd(), args.file);
  if (!existsSync(filePath)) {
    throw new CliError(`el archivo de backup no existe: ${filePath}`);
  }

  const sidecarPath = deriveSidecarPath(filePath);
  assertSidecarAvailable(sidecarPath);
  const sidecar = parseSidecar(readFileSync(sidecarPath, 'utf8'));
  const schemaName = sidecar.schemaName;

  assertDestinationAllowed({
    into: args.into,
    origin: dbName,
    forceSameDatabase: args.forceSameDatabase,
  });
  if (args.into === dbName) {
    log.log(
      `[RESTORE-TENANT] ADVERTENCIA: la base destino coincide con DB_NAME (${dbName}); se restaurara ` +
        `el schema "${schemaName}" sobre la base de origen.`,
    );
    await confirmSameDatabaseRestore(schemaName);
  }

  log.log(`[RESTORE-TENANT] dump: ${basename(filePath)}`);
  log.log(`[RESTORE-TENANT] sidecar: ${basename(sidecarPath)} | schema: ${schemaName}`);

  // Copia unica al contenedor (no-op en modo host): --list y el restore real
  // comparten la misma copia en vez de que cada uno haga su propio docker cp.
  // Declaradas fuera del try porque el resumen final las necesita despues de
  // que el dump remoto ya se limpio.
  let startedAt;
  let checksum;
  let targetExisted;
  let registryAvailable;

  const effectiveDumpPath = prepareEffectiveDumpPath(filePath);
  try {
    const dumpSchemas = parseDumpSchemas(runPgRestoreList(effectiveDumpPath));
    assertDumpMatchesSidecar(dumpSchemas, schemaName);

    startedAt = Date.now();
    checksum = await sha256File(filePath);
    if (sidecar.dumpSha256 !== checksum) {
      throw new CliError(
        'el sha256 del dump no coincide con el declarado por el sidecar; los artefactos no son el mismo ' +
          'par. No se toco ninguna base.',
      );
    }

    targetExisted = databaseExists(args.into);
    if (!targetExisted) {
      createDatabase(args.into);
      log.log(
        `[RESTORE-TENANT] la base destino "${args.into}" no existia; se creo antes de restaurar.`,
      );
    } else if (schemaExists(args.into, schemaName)) {
      throw new CliError(
        `el schema "${schemaName}" ya existe en la base destino "${args.into}". El comando no elimina ` +
          'schemas ni reemplaza con DROP y CASCADE: siga el procedimiento con ventana del runbook §6.3 ' +
          '(bloqueo de escrituras del tenant, backup previo y autorizacion CTO) y libere el nombre del ' +
          'schema bajo ese procedimiento antes de reintentar.',
      );
    }

    registryAvailable = targetExisted && tenantsRegistryExists(args.into);
    if (registryAvailable) {
      assertNoRegistryConflicts(args.into, sidecar);
    }

    log.log(`[RESTORE-TENANT] restaurando en modo ensayo sobre "${args.into}"...`);
    const code = runPgRestore(effectiveDumpPath, args.into);
    if (code !== 0) {
      throw new CliError(
        buildRestoreFailureMessage({ code, into: args.into, schemaName, targetExisted }),
        1,
      );
    }
  } finally {
    cleanupEffectiveDumpPath(effectiveDumpPath);
  }

  let injection = 'omitida (la base destino no tiene public.tenants; ensayo aislado)';
  if (registryAvailable) {
    injectTenantRow(args.into, sidecar);
    injection = '1 fila en public.tenants';
  }

  const tableRows = queryLines(
    `SELECT count(*) FROM pg_tables WHERE schemaname = :'schema'`,
    { schema: schemaName },
    args.into,
  );
  const tableCount = Number(tableRows[0] ?? '0');
  const durationSeconds = (Date.now() - startedAt) / 1000;
  const operator = process.env.USERNAME ?? process.env.USER ?? 'desconocido';

  const summaryLines = buildRestoreSummaryLines({
    schemaName,
    database: args.into,
    created: !targetExisted,
    dumpName: basename(filePath),
    checksum,
    tableCount,
    injection,
    durationSeconds,
    operator,
  });
  for (const line of summaryLines) {
    log.log(line);
  }
  return 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main()
    .then((code) => {
      process.exitCode = code;
    })
    .catch((err) => {
      if (err instanceof CliError) {
        console.error(`[RESTORE-TENANT] ${err.message}`);
        process.exit(err.exitCode);
      }
      console.error(`[RESTORE-TENANT] ${err?.message ?? err}`);
      process.exit(1);
    });
}
