#!/usr/bin/env node
/**
 * Crea, rota o re-sincroniza `iwana_readonly` en la base de DESARROLLO y escribe
 * la credencial que usa el MCP `postgres-dev`.
 *
 * Fail-closed: solo corre en modo docker, contra un contenedor `*_dev` y fuera de
 * NODE_ENV=production. La contraseña se genera una vez y se reutiliza en
 * re-ejecuciones; `--rotate` genera una nueva. Nunca se imprime. Vive en
 * `.claude/mcp-postgres.local.env` (ignorado por git), y el launcher MCP la
 * pasa al contenedor bajo el nombre `DATABASE_URI`.
 *
 * Uso: pnpm db:dev:readonly-role [--rotate]
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
  const match = content.match(
    /^(?:IWANA_MCP_DATABASE_URI|DATABASE_URI)=postgresql:\/\/iwana_readonly:([^@]+)@/m,
  );
  return match?.[1] ?? null;
}

export function parseArgs(args) {
  let rotate = false;
  for (const arg of args) {
    if (arg === '--rotate') {
      if (rotate) throw new CliError('Usa --rotate una sola vez.');
      rotate = true;
    } else if (arg === '--help' || arg === '-h') {
      return { help: true, rotate: false };
    } else {
      throw new CliError(`Argumento desconocido: ${arg.split('=')[0]}`);
    }
  }
  return { help: false, rotate };
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
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    process.stdout.write(
      'Crea o resincroniza iwana_readonly en PostgreSQL de desarrollo.\n\n' +
        'Uso: pnpm db:dev:readonly-role [--rotate]\n' +
        '--rotate  Genera una credencial nueva e invalida la anterior para nuevas conexiones.\n',
    );
    return;
  }

  const env = loadTenantToolingEnv(repoRoot);
  assertDevelopmentTarget(env, process.env.NODE_ENV);

  const previous = existsSync(credentialPath)
    ? readExistingPassword(readFileSync(credentialPath, 'utf8'))
    : null;
  const password = args.rotate ? randomBytes(32).toString('base64url') : previous;
  const nextPassword = password ?? randomBytes(32).toString('base64url');

  runPsqlQuery(
    env,
    `\\set readonly_pass ${nextPassword}\n${readFileSync(sqlPath, 'utf8')}`,
    {},
    {
      asScript: true,
      failureHint: '¿Está arriba el compose de desarrollo y migrada la base?',
    },
  );

  writeFileSync(
    credentialPath,
    `# GENERADO por scripts/db/dev-readonly-role.mjs — credencial local de dev, no versionar.\n` +
      `IWANA_MCP_DATABASE_URI=${buildDatabaseUri(nextPassword, env.dbName)}\n`,
    { encoding: 'utf8', mode: 0o600 },
  );

  const summary = runPsqlQuery(
    env,
    `SELECT count(DISTINCT table_schema || '.' || table_name) || ' relaciones, ' ||
            count(DISTINCT table_schema) || ' schemas'
       FROM information_schema.column_privileges
      WHERE grantee = 'iwana_readonly';`,
  ).trim();

  console.log(
    `dev-readonly-role: iwana_readonly ${args.rotate ? 'rotado' : previous ? 're-sincronizado' : 'creado'} (${summary}).`,
  );
  console.log(
    'dev-readonly-role: credencial en .claude/mcp-postgres.local.env (ignorado por git).',
  );
  console.log(
    'dev-readonly-role: reinicia las sesiones Claude Code y OpenCode para liberar pools antiguos.',
  );
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  try {
    main();
  } catch (error) {
    console.error(`dev-readonly-role: ${error.message}`);
    process.exit(error instanceof CliError ? error.exitCode : 1);
  }
}
