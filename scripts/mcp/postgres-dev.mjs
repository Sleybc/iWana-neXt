#!/usr/bin/env node
/**
 * Launches the read-only PostgreSQL MCP with the local credential from the
 * canonical env file, mapping IWANA_MCP_DATABASE_URI to the image's DATABASE_URI.
 * The URI is passed through the Docker process environment, never its argv.
 */
import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import process from 'node:process';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(scriptDir, '../..');
const credentialPath = join(repoRoot, '.claude', 'mcp-postgres.local.env');
const image =
  'crystaldba/postgres-mcp@sha256:dbbd346860d29f1543e991f30f3284bf4ab5f096d049ecc3426528f20b1b6e6b';

export function readCredential(content) {
  const entry = content
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .find((line) => line.startsWith('IWANA_MCP_DATABASE_URI='));
  const uri = entry?.slice('IWANA_MCP_DATABASE_URI='.length).trim();
  if (!uri) throw new Error('Falta IWANA_MCP_DATABASE_URI.');

  let parsed;
  try {
    parsed = new URL(uri);
  } catch {
    throw new Error('IWANA_MCP_DATABASE_URI no es una URI PostgreSQL válida.');
  }
  if (
    parsed.protocol !== 'postgresql:' ||
    decodeURIComponent(parsed.username) !== 'iwana_readonly' ||
    parsed.hostname !== '127.0.0.1' ||
    parsed.port !== '5432' ||
    !parsed.password ||
    !parsed.pathname.slice(1)
  ) {
    throw new Error('IWANA_MCP_DATABASE_URI no corresponde al rol de lectura local.');
  }
  return uri;
}

function main() {
  let uri;
  try {
    uri = readCredential(readFileSync(credentialPath, 'utf8'));
  } catch {
    process.stderr.write(
      'postgres-dev MCP: no se pudo cargar la credencial local. Ejecuta pnpm db:dev:readonly-role.\n',
    );
    process.exitCode = 1;
    return;
  }

  const child = spawn(
    'docker',
    [
      'run',
      '-i',
      '--rm',
      '--network',
      'container:iwana_postgres_dev',
      '--env',
      'DATABASE_URI',
      image,
      '--access-mode=restricted',
    ],
    {
      stdio: 'inherit',
      env: { ...process.env, DATABASE_URI: uri },
    },
  );

  child.once('error', () => {
    process.stderr.write('postgres-dev MCP: no fue posible iniciar Docker.\n');
    process.exitCode = 1;
  });
  child.once('exit', (code, signal) => {
    if (signal) {
      process.exitCode = 1;
      return;
    }
    process.exitCode = code ?? 1;
  });
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main();
}
