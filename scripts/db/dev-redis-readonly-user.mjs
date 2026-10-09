#!/usr/bin/env node
/**
 * Crea o re-sincroniza el usuario ACL `iwana_readonly` en el Redis de DESARROLLO y
 * escribe la credencial que usa el MCP `redis-dev` de Claude Code.
 *
 * Fail-closed: solo fuera de NODE_ENV=production y contra un contenedor `*_dev`. El
 * usuario solo lee claves `bull:*` (colas BullMQ); cualquier escritura responde NOPERM.
 * Redis dev arranca sin aclfile: el usuario vive en memoria y se pierde al recrear el
 * contenedor, así que el script es idempotente y se re-ejecuta tras levantarlo. La
 * contraseña obligatoria de ADR-074 autentica como admin. Ninguna
 * contraseña viaja en argv: los comandos entran a redis-cli por stdin.
 *
 * Uso: pnpm dev:redis-readonly-user   (re-ejecutar tras recrear iwana_redis_dev)
 */
import { spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import { CliError, loadTenantToolingEnv } from './lib/tenant-tooling.mjs';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(scriptDir, '../..');
const credentialPath = join(repoRoot, '.claude', 'mcp-redis.local.env');

const READONLY_USER = 'iwana_readonly';

/** Lectura de `bull:*` más lo que el cliente del MCP necesita para conectar. */
export function buildAclSetUser(password) {
  return [
    'ACL SETUSER',
    READONLY_USER,
    'reset on',
    `>${password}`,
    '~bull:* resetchannels -@all +@read',
    '+ping +hello +select +info +dbsize +client|setname +client|setinfo',
  ].join(' ');
}

export function readExistingPassword(content) {
  return content.match(/^REDIS_PWD=(\S+)$/m)?.[1] ?? null;
}

export function assertDevelopmentTarget(container, nodeEnv) {
  if (nodeEnv === 'production') {
    throw new CliError('NODE_ENV=production: este usuario solo existe en desarrollo.');
  }
  if (!/_dev$/.test(container)) {
    throw new CliError(`el contenedor "${container}" no es de desarrollo (*_dev).`);
  }
}

function redisCli(container, lines) {
  const result = spawnSync('docker', ['exec', '-i', container, 'redis-cli'], {
    input: `${lines.join('\n')}\n`,
    encoding: 'utf8',
  });
  if (result.error || result.status !== 0) {
    throw new CliError(
      `redis-cli falló en ${container}: ${result.error?.message ?? result.stderr.trim()}. ` +
        '¿Está arriba el compose de desarrollo?',
    );
  }
  return result.stdout.trim().split(/\r?\n/);
}

function main() {
  loadTenantToolingEnv(repoRoot);
  const container = process.env.REDIS_CONTAINER ?? 'iwana_redis_dev';
  assertDevelopmentTarget(container, process.env.NODE_ENV);
  const adminPassword = process.env.REDIS_PASSWORD?.trim();
  if (!adminPassword) {
    throw new CliError('REDIS_PASSWORD es obligatoria. Genérela con: openssl rand -base64 32');
  }

  const previous = existsSync(credentialPath)
    ? readExistingPassword(readFileSync(credentialPath, 'utf8'))
    : null;
  const password = previous ?? randomBytes(24).toString('base64url');
  const adminAuth = [`AUTH ${adminPassword}`];

  const setup = redisCli(container, [...adminAuth, buildAclSetUser(password)]);
  if (setup.at(-1) !== 'OK') {
    throw new CliError(`ACL SETUSER no respondió OK: ${setup.at(-1)}`);
  }

  // Prueba con el propio usuario: debe leer y no poder escribir.
  const probe = redisCli(container, [
    `AUTH ${READONLY_USER} ${password}`,
    'PING',
    'SET bull:__readonly_probe x',
  ]);
  if (probe[1] !== 'PONG' || !/NOPERM/.test(probe[2] ?? '')) {
    throw new CliError(`la prueba de solo lectura no dio PONG + NOPERM: ${probe.join(' | ')}`);
  }

  writeFileSync(
    credentialPath,
    '# GENERADO por scripts/db/dev-redis-readonly-user.mjs — credencial local de dev, no versionar.\n' +
      'REDIS_HOST=127.0.0.1\nREDIS_PORT=6379\n' +
      `REDIS_USERNAME=${READONLY_USER}\nREDIS_PWD=${password}\n`,
    { encoding: 'utf8', mode: 0o600 },
  );

  console.log(
    `dev-redis-readonly-user: ${READONLY_USER} ${previous ? 're-sincronizado' : 'creado'} en ${container} (lee bull:*, escritura → NOPERM).`,
  );
  console.log(
    'dev-redis-readonly-user: credencial en .claude/mcp-redis.local.env (ignorado por git).',
  );
  console.log(
    'dev-redis-readonly-user: reinicia la sesión de Claude Code para conectar redis-dev.',
  );
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  try {
    main();
  } catch (error) {
    console.error(`dev-redis-readonly-user: ${error.message}`);
    process.exit(error instanceof CliError ? error.exitCode : 1);
  }
}
