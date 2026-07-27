/**
 * globalSetup de la suite de integración de `@iwana/db`.
 *
 * Objetivo: decidir ANTES de que Jest cargue los ficheros de test si hay un
 * PostgreSQL real alcanzable. Jest registra los `describe` de forma síncrona,
 * así que la única manera de emitir un `describe.skip` honesto —y no un test
 * que se "pasa" sin haber ejercitado nada— es resolver la disponibilidad aquí
 * y publicarla en `process.env`, que los workers heredan.
 *
 * Nombres de variables: los mismos que usan `src/data-source.ts` y el job `ci`
 * de `.github/workflows/ci.yml` (`DB_HOST`, `DB_PORT`, `DB_NAME`,
 * `DB_MIGRATOR_USER` / `DB_MIGRATOR_PASSWORD` con fallback a `DB_USER` /
 * `DB_PASSWORD`). No se inventa ninguna variable nueva.
 *
 * El skip es RUIDOSO por diseño: si la DB no está, la consola lo dice con un
 * banner. Un skip silencioso es exactamente el defecto de proceso que el
 * informe de auditoría ADR-065 marcó como hallazgo A-2.
 */

const { resolve } = require('node:path');

/** Bandera leída por el spec de integración para elegir `describe` o `describe.skip`. */
const AVAILABILITY_FLAG = 'IWANA_DB_INTEGRATION_AVAILABLE';

/**
 * Mismo orden de precedencia que `ensureDatabaseEnvLoaded()` en `src/data-source.ts`:
 * `.env.development.local` primero porque `loadEnvFile` NO sobrescribe claves ya
 * presentes en `process.env`. En CI las variables llegan del workflow y ningún
 * fichero las pisa.
 */
const ENV_CANDIDATES = ['.env.development.local', '.env.development', '.env'];

function loadWorkspaceEnv() {
  const loadEnvFile = process.loadEnvFile;
  if (typeof loadEnvFile !== 'function') {
    return;
  }

  const workspaceRoot = resolve(__dirname, '..', '..', '..');
  for (const candidate of ENV_CANDIDATES) {
    try {
      loadEnvFile(resolve(workspaceRoot, candidate));
    } catch {
      // Fichero ausente: es normal en CI y en entornos con variables inyectadas.
    }
  }
}

function resolveConnection() {
  const migratorUser = (process.env['DB_MIGRATOR_USER'] || '').trim();
  return {
    host: process.env['DB_HOST'] || 'localhost',
    port: Number.parseInt(process.env['DB_PORT'] || '5432', 10),
    database: process.env['DB_NAME'] || 'iwana',
    user: migratorUser || process.env['DB_USER'] || 'iwana',
    password: migratorUser
      ? (process.env['DB_MIGRATOR_PASSWORD'] ?? process.env['DB_PASSWORD'] ?? '')
      : (process.env['DB_PASSWORD'] ?? ''),
  };
}

module.exports = async function globalSetup() {
  loadWorkspaceEnv();

  const connection = resolveConnection();
  // Nunca se registran usuario ni contraseña: solo el destino de red.
  const target = `${connection.host}:${connection.port}/${connection.database}`;

  const { Client } = require('pg');
  const client = new Client({
    host: connection.host,
    port: connection.port,
    database: connection.database,
    user: connection.user,
    password: connection.password,
    connectionTimeoutMillis: 5_000,
  });

  try {
    await client.connect();
    await client.query('SELECT 1');
    process.env[AVAILABILITY_FLAG] = 'true';
    console.log(
      `\n[089-integration] PostgreSQL alcanzable en ${target}. La suite de integración se ejecutará.\n`,
    );
  } catch (error) {
    process.env[AVAILABILITY_FLAG] = 'false';
    const reason = error instanceof Error ? error.message : String(error);
    console.warn(
      [
        '',
        '='.repeat(78),
        '[089-integration] SUITE OMITIDA — no hay PostgreSQL alcanzable.',
        `  destino : ${target}`,
        `  motivo  : ${reason}`,
        '  Esta suite NO valida nada mientras esté omitida: la migración 089 queda',
        '  sin red de regresión de runtime (BL-1 / D-1). Levante la base y repita',
        '  con: pnpm --filter @iwana/db test:integration',
        '='.repeat(78),
        '',
      ].join('\n'),
    );
  } finally {
    try {
      await client.end();
    } catch {
      // El cierre no debe enmascarar el diagnóstico anterior.
    }
  }
};
