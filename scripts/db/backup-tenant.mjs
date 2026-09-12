#!/usr/bin/env node
/**
 * Backup de UN tenant: dump -Fc del schema resuelto en public.tenants mas un
 * sidecar con la fila de registro del tenant.
 *
 * Invariantes (SPEC-PLAT-OPS-RESTORE-POR-TENANT-v1.0 §3):
 *   - el schema_name NUNCA se deriva del argumento: se consulta public.tenants
 *     por uuid o slug y se valida contra el contrato tenant_* antes de
 *     interpolarse en pg_dump;
 *   - el validador se reutiliza de @iwana/db (dist/data-source.js compilado),
 *     no se reescribe; requiere `pnpm --filter @iwana/db build` previo;
 *   - sin PII ni credenciales en logs, nombres de archivo ni mensajes.
 *
 * Salida: <schema_name>-<utc>.dump + <schema_name>-<utc>.tenant.json en
 * BACKUP_DIR (default <repo>/.backups, ignorado por git). El sidecar es parte
 * del artefacto: sin el, el dump no es restaurable a un sistema funcional.
 * Codigo 0 solo si ambos artefactos quedaron escritos y pg_dump termino en 0.
 *
 * Uso:
 *   node scripts/db/backup-tenant.mjs --tenant=<uuid|slug>
 *   pnpm db:backup:tenant --tenant=<uuid|slug>
 *
 * Parametrizacion por env (misma familia que backup.mjs):
 *   POSTGRES_CONTAINER  Contenedor postgres (default: iwana_postgres_dev)
 *   DB_BOOTSTRAP_USER / DB_USER  Rol que ejecuta la consulta y pg_dump
 *   DB_PASSWORD         Password del rol. Nunca por linea de comandos visible.
 *   DB_NAME             Base origen donde vive public.tenants (default: dbiw)
 *   DB_HOST / DB_PORT   Conexion en modo host (defaults localhost:5432)
 *   BACKUP_DIR          Carpeta destino (default: <repo>/.backups, fuera de git)
 *   DB_BACKUP_MODE      docker (default) | host
 */
import { spawn, spawnSync } from 'node:child_process';
import {
  createWriteStream,
  existsSync,
  mkdirSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { finished } from 'node:stream/promises';
import { dirname, join, resolve } from 'node:path';
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
Backup por tenant de PostgreSQL (-Fc) (scripts/db/backup-tenant.mjs)

  node scripts/db/backup-tenant.mjs --tenant=<uuid|slug>

OPCIONES
  --tenant=<uuid|slug>  OBLIGATORIO. Identificador de negocio del tenant.
                        NUNCA el nombre de schema: el schema se resuelve
                        consultando public.tenants y se valida antes de usarse.
  -h, --help            Esta ayuda.

SALIDA
  <schema_name>-<utc>.dump         dump del schema (custom, --no-owner --no-privileges)
  <schema_name>-<utc>.tenant.json  sidecar con la fila de public.tenants

  Ambos artefactos son el backup: conservarlos juntos. El comando aborta sin
  generar nada si el tenant no existe, si el identificador es ambiguo o si el
  schema resuelto no cumple ^tenant_[a-z][a-z0-9_]{0,54}$.
`;

export { CliError };

// --- Validacion de schema: reutiliza @iwana/db, no lo reescribe ---
const isValidSchemaName = loadSchemaValidator(repoRoot, 'BACKUP-TENANT');

const env = loadTenantToolingEnv(repoRoot);
const { mode, container, dbName } = env;
const backupDir = process.env.BACKUP_DIR
  ? resolve(process.env.BACKUP_DIR)
  : join(repoRoot, '.backups');

export function parseTenantBackupArgs(argv) {
  const parsed = { tenant: undefined, help: false };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];

    if (arg === '-h' || arg === '--help') {
      parsed.help = true;
    } else if (arg === '--tenant' || arg.startsWith('--tenant=')) {
      const value = arg === '--tenant' ? argv[++i] : arg.slice('--tenant='.length);
      if (value === undefined || value.trim() === '' || value.startsWith('--')) {
        throw new CliError(
          '--tenant exige un valor (--tenant=<uuid|slug> o --tenant <uuid|slug>).',
        );
      }
      parsed.tenant = value;
    } else {
      throw new CliError(`Argumento no reconocido: "${arg}". Use --help.`);
    }
  }

  return parsed;
}

export function requireTenantArg(parsed) {
  if (!parsed.tenant) {
    throw new CliError('Falta --tenant=<uuid|slug>. Use --help para ver la ayuda completa.');
  }
  return parsed.tenant;
}

/**
 * La resolucion ocurre en public.tenants. El valor se pasa como variable de
 * psql (:'tenant_arg'), nunca concatenado al SQL.
 */
export function buildTenantLookupSql() {
  return `SELECT row_to_json(t) FROM public.tenants t WHERE t.id::text = :'tenant_arg' OR t.slug = :'tenant_arg'`;
}

/** Fail-closed: 0 coincidencias no es "el primero"; 2+ tampoco. */
export function pickSingleTenant(rows) {
  if (rows.length === 0) {
    throw new CliError(
      'tenant no encontrado en public.tenants. Verifique el uuid o slug, que el tenant exista en la base ' +
        'origen (DB_NAME) y que los datos autorizados sean correctos. No se genero ningun artefacto.',
    );
  }
  if (rows.length > 1) {
    throw new CliError(
      `el identificador coincide con ${rows.length} tenants en public.tenants; el comando no adivina. ` +
        'Use el uuid exacto del tenant. No se genero ningun artefacto.',
    );
  }
  return rows[0];
}

/** El schema resuelto se valida ANTES de interpolarse en cualquier comando. */
export function assertValidResolvedSchema(row) {
  const schemaName = row?.schema_name;
  if (typeof schemaName !== 'string' || !isValidSchemaName(schemaName)) {
    throw new CliError(
      'el schema_name resuelto para el tenant no cumple el contrato ^tenant_[a-z][a-z0-9_]{0,54}$; ' +
        'se aborta antes de ejecutar pg_dump. Revise la fila en public.tenants.',
    );
  }
  return schemaName;
}

export function deriveTenantArtifactNames(schemaName, stamp) {
  return {
    dumpName: `${schemaName}-${stamp}.dump`,
    sidecarName: `${schemaName}-${stamp}.tenant.json`,
  };
}

/**
 * El sidecar conserva la fila completa de public.tenants (fuente de verdad)
 * y su checksum para correlacionar los artefactos. Se escribe con permisos por
 * defecto y jamas se imprime su contenido.
 */
export function buildSidecar({ row, schemaName, database, generatedAt, dumpSha256 }) {
  return `${JSON.stringify(
    {
      version: 1,
      generated_at: generatedAt,
      source_database: database,
      schema_name: schemaName,
      dump_sha256: dumpSha256,
      tenant: row,
    },
    null,
    2,
  )}\n`;
}

/**
 * Un dump con PII versionado es peor que no tener backup. El destino solo puede
 * vivir dentro del arbol de git si git lo ignora (mismo guard de backup.mjs).
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
    throw new CliError(
      `BACKUP_DIR (${backupDir}) cae dentro del arbol de git y git no lo ignora. ` +
        'Un dump con PII versionado es peor que no tener backup. Mueva BACKUP_DIR fuera del repo ' +
        'o agreguelo a .gitignore.',
      1,
    );
  }
}

/** Consulta psql con las variables de conexion de este script. */
function runPsqlQuery(sql, vars = {}, opts = {}) {
  return runPsqlQueryShared(env, sql, vars, {
    failureHint: 'Verifique que la base indicada tenga el esquema public y la tabla tenants.',
    ...opts,
  });
}

/**
 * SHA-256 del dump recien escrito. Si el hash falla, el dump se elimina para no
 * dejar un artefacto sin sidecar — un backup a medias es peor que ninguno.
 */
export async function hashDumpOrCleanup(dumpPath, hasher = sha256File) {
  try {
    return await hasher(dumpPath);
  } catch (err) {
    try {
      unlinkSync(dumpPath);
    } catch {
      // el dump sin hash no es un backup valido: no debe quedar en disco
    }
    throw new CliError(
      `no se pudo verificar el dump (${err.message}); se elimino para no dejar un artefacto sin ` +
        'sidecar. Genere un backup nuevo con db:backup:tenant.',
      1,
    );
  }
}

/** Abre el dump en modo exclusivo: jamas trunca un archivo preexistente. */
export function openDumpWriteStream(targetPath) {
  return createWriteStream(targetPath, { flags: 'wx' });
}

/** Elimina el dump si existe; una limpieza fallida no debe ocultar el error original. */
function cleanupPartialDump(targetPath) {
  try {
    unlinkSync(targetPath);
  } catch {
    // el archivo parcial no debe quedar como backup valido
  }
}

/**
 * pg_dump con --schema resuelto y validado. El stream va directo al archivo.
 *
 * SEC-6: la promesa esperaba solo el `close` del proceso hijo antes de
 * resolver. Ese evento certifica que pg_dump terminó, no que el WRITABLE
 * STREAM local ya vació a disco lo ultimo que tenia en su buffer interno de
 * Node — son dos cosas distintas. `hashDumpOrCleanup` lee el archivo justo
 * despues: sin esperar el `finish` del stream, el sha256 podia calcularse
 * sobre un archivo con un flush aun pendiente. Se espera `finished(out)`
 * (node:stream/promises) antes de resolver.
 *
 * SEC-7: el unico manejador de error del stream asumia que TODO error de
 * escritura era "no se pudo crear el archivo" (el caso real: ya existe un
 * dump con ese nombre, `wx` lo rechaza antes de escribir un byte) y nunca
 * limpiaba el archivo. Un error a mitad de escritura (disco lleno, permisos)
 * dispara el mismo stream y SI alcanza a crear el archivo primero: quedaba
 * huerfano en disco con un mensaje que decia "no se sobrescribe un backup
 * preexistente", el mensaje equivocado para ese caso. Se distingue por el
 * evento `open`: sin el, es un fallo de apertura (no hay nada que limpiar);
 * con el, es un fallo de escritura (se limpia el parcial y el mensaje lo dice).
 */
async function runPgDump(targetPath, schemaName) {
  const pgArgs = ['-Fc', '--no-owner', '--no-privileges', `--schema=${schemaName}`];
  let bin;
  let args;

  if (mode === 'host') {
    bin = 'pg_dump';
    args = [...pgArgs, '-h', env.dbHost, '-p', env.dbPort, '-U', env.dbUser, '-d', dbName];
  } else {
    assertContainerRunning(container);
    bin = 'docker';
    args = [
      'exec',
      '-i',
      '-e',
      `PGPASSWORD=${env.dbPassword}`,
      container,
      'pg_dump',
      ...pgArgs,
      '-U',
      env.dbUser,
      '-d',
      dbName,
    ];
  }

  const dump = spawn(bin, args, {
    stdio: ['ignore', 'pipe', 'inherit'],
    env: mode === 'host' ? { ...process.env, PGPASSWORD: env.dbPassword } : process.env,
  });

  let streamOpened = false;
  const out = openDumpWriteStream(targetPath);
  out.on('open', () => {
    streamOpened = true;
  });

  const dumpExit = new Promise((resolveExit, rejectExit) => {
    let settled = false;
    const fail = (error) => {
      if (settled) {
        return;
      }
      settled = true;
      rejectExit(error);
    };

    out.on('error', (err) => {
      dump.kill();
      if (!streamOpened) {
        // No se llego a crear el archivo (p. ej. ya existe un dump con el
        // mismo nombre): nunca se borra el preexistente en este camino.
        fail(
          new CliError(
            `no se pudo crear el dump "${targetPath}" (${err.message}); no se sobrescribe un backup ` +
              'preexistente. Mueva o elimine el archivo y repita.',
            1,
          ),
        );
        return;
      }
      // El archivo SI se creo y la escritura fallo a mitad de camino: el
      // parcial no es un backup valido y no debe quedar en disco.
      cleanupPartialDump(targetPath);
      fail(
        new CliError(
          `la escritura del dump "${targetPath}" fallo a mitad de camino (${err.message}); se ` +
            'elimino el archivo parcial. Verifique espacio en disco y permisos, y reintente.',
          1,
        ),
      );
    });
    dump.stdout.pipe(out);

    dump.on('error', (err) => {
      fail(new CliError(`no se pudo iniciar ${bin}: ${err.message}`, 1));
    });

    dump.on('close', (code) => {
      if (settled) {
        return;
      }
      settled = true;
      resolveExit(code);
    });
  });

  const code = await dumpExit;
  if (code !== 0) {
    cleanupPartialDump(targetPath);
    throw new CliError(`pg_dump salio con codigo ${code}. No se genero backup.`, code ?? 1);
  }

  // El proceso termino en 0: esperar a que el stream local termine de
  // escribir lo que aun tuviera en buffer antes de que el llamador calcule
  // el sha256 (SEC-6). Si el stream ya fallo, `dumpExit` ya se habria
  // rechazado arriba y esta linea no se alcanza.
  await finished(out);
}

export async function main(argv = process.argv.slice(2), log = console) {
  const args = parseTenantBackupArgs(argv);
  if (args.help) {
    log.log(USAGE);
    return 0;
  }

  const tenantArg = requireTenantArg(args);

  log.log(`[BACKUP-TENANT] resolviendo tenant en public.tenants (base ${dbName})...`);
  const rows = runPsqlQuery(
    buildTenantLookupSql(),
    { tenant_arg: tenantArg },
    { database: dbName },
  );
  const row = pickSingleTenant(
    rows
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => JSON.parse(line)),
  );
  const schemaName = assertValidResolvedSchema(row);

  mkdirSync(backupDir, { recursive: true });
  assertBackupDirNotTracked();

  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const { dumpName, sidecarName } = deriveTenantArtifactNames(schemaName, stamp);
  const dumpPath = join(backupDir, dumpName);
  const sidecarPath = join(backupDir, sidecarName);
  const startedAt = Date.now();

  log.log(`[BACKUP-TENANT] schema resuelto: ${schemaName} (modo ${mode})`);
  await runPgDump(dumpPath, schemaName);

  const dumpSha256 = await hashDumpOrCleanup(dumpPath);

  try {
    writeFileSync(
      sidecarPath,
      buildSidecar({
        row,
        schemaName,
        database: dbName,
        generatedAt: new Date().toISOString(),
        dumpSha256,
      }),
      { encoding: 'utf8', flag: 'wx' },
    );
  } catch (err) {
    try {
      unlinkSync(dumpPath);
    } catch {
      // sin sidecar el dump no es un backup valido: no debe quedar en disco
    }
    throw new CliError(
      `el dump se genero pero el sidecar no pudo escribirse (${err.message}); se elimino el dump incompleto.`,
      1,
    );
  }

  const durationSeconds = (Date.now() - startedAt) / 1000;
  log.log(`[BACKUP-TENANT] OK — ${dumpName}`);
  log.log(`[BACKUP-TENANT] sidecar: ${sidecarName}`);
  log.log(`[BACKUP-TENANT] schema: ${schemaName} | base origen: ${dbName}`);
  log.log(`[BACKUP-TENANT] tamano: ${statSync(dumpPath).size} bytes | sha256: ${dumpSha256}`);
  log.log(`[BACKUP-TENANT] duracion: ${durationSeconds.toFixed(1)} s`);
  return 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main()
    .then((code) => {
      process.exitCode = code;
    })
    .catch((err) => {
      if (err instanceof CliError) {
        console.error(`[BACKUP-TENANT] ${err.message}`);
        process.exit(err.exitCode);
      }
      console.error(`[BACKUP-TENANT] ${err?.message ?? err}`);
      process.exit(1);
    });
}
