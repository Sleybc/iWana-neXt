#!/usr/bin/env node
/**
 * Crea o re-sincroniza `iwana_readonly` en la base de DESARROLLO y escribe la
 * credencial que usa el MCP `postgres-dev` de Claude Code.
 *
 * Fail-closed: solo corre en modo docker, contra un contenedor `*_dev` y fuera de
 * NODE_ENV=production. La contraseña se genera una vez y se reutiliza en
 * re-ejecuciones; nunca se imprime. Vive en `.claude/mcp-postgres.local.env`
 * (ignorado por git), que `.mcp.json` pasa al contenedor con `--env-file`.
 *
 * Uso: pnpm db:dev:readonly-role   (re-ejecutar tras crear tenants nuevos)
 */
import { randomBytes } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import process from 'node:process';

import { CliError, loadTenantToolingEnv, runPsqlQuery } from './lib/tenant-tooling.mjs';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(scriptDir, '../..');
const sqlPath = join(scriptDir, 'dev-readonly-role.sql');
const credentialPath = join(repoRoot, '.claude', 'mcp-postgres.local.env');

/** El MCP comparte la red del contenedor Postgres: conecta por loopback interno. */
export function buildDatabaseUri(password, dbName) {
  return `postgresql://iwana_readonly:${password}@127.0.0.1:5432/${encodeURIComponent(dbName)}`;
}

export function readExistingPassword(content) {
  const match = content.match(/^DATABASE_URI=postgresql:\/\/iwana_readonly:([^@]+)@/m);
  return match?.[1] ?? null;
}

export function assertDevelopmentTarget(env, nodeEnv) {
  if (nodeEnv === 'production') {
    throw new CliError('NODE_ENV=production: este rol solo existe en desarrollo.');
  }
  if (env.mode !== 'docker') {
    throw new CliError('solo admite modo docker contra el Postgres de desarrollo.');
  }
  if (!/_dev$/.test(env.container)) {
    throw new CliError(`el contenedor "${env.container}" no es de desarrollo (*_dev).`);
  }
}

function main() {
  const env = loadTenantToolingEnv(repoRoot);
  assertDevelopmentTarget(env, process.env.NODE_ENV);

  const previous = existsSync(credentialPath)
    ? readExistingPassword(readFileSync(credentialPath, 'utf8'))
    : null;
  const password = previous ?? randomBytes(24).toString('base64url');

  runPsqlQuery(
    env,
    readFileSync(sqlPath, 'utf8'),
    { readonly_pass: password },
    {
      asScript: true,
      failureHint: '¿Está arriba el compose de desarrollo y migrada la base?',
    },
  );

  const summary = runPsqlQuery(
    env,
    `SELECT count(DISTINCT table_schema || '.' || table_name) || ' relaciones, ' ||
            count(DISTINCT table_schema) || ' schemas'
       FROM information_schema.column_privileges
      WHERE grantee = 'iwana_readonly';`,
  ).trim();

  writeFileSync(
    credentialPath,
    `# GENERADO por scripts/db/dev-readonly-role.mjs — credencial local de dev, no versionar.\n` +
      `DATABASE_URI=${buildDatabaseUri(password, env.dbName)}\n`,
    { encoding: 'utf8', mode: 0o600 },
  );

  console.log(
    `dev-readonly-role: iwana_readonly ${previous ? 're-sincronizado' : 'creado'} (${summary}).`,
  );
  console.log(
    'dev-readonly-role: credencial en .claude/mcp-postgres.local.env (ignorado por git).',
  );
  console.log('dev-readonly-role: reinicia la sesión de Claude Code para conectar postgres-dev.');
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  try {
    main();
  } catch (error) {
    console.error(`dev-readonly-role: ${error.message}`);
    process.exit(error instanceof CliError ? error.exitCode : 1);
  }
}
