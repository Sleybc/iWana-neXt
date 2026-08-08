#!/usr/bin/env node
/**
 * Sincroniza la contraseña del superadmin de plataforma con PLATFORM_SUPER_ADMIN_* (solo dev local).
 * Útil tras reset de DB cuando bootstrap omitió al usuario existente con hash desactualizado.
 *
 * SEC-P1: lookup por `email_hmac` (HMAC-SHA-256 + PII_HASH_KEY), no SHA-256/`email_hash`.
 */
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { hmacEmail, loadPiiHashKeyFromEnv } from './lib/pii-hmac.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

function loadEnv(relativePath) {
  const path = join(root, relativePath);
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, 'utf8').split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (!(key in process.env)) process.env[key] = value;
  }
}

loadEnv('.env.development.local');
loadEnv('.env.development');

const email = process.env.PLATFORM_SUPER_ADMIN_EMAIL?.trim();
const password = process.env.PLATFORM_SUPER_ADMIN_PASSWORD?.trim();

if (!email || !password) {
  console.error('dev-reset-platform-admin: faltan PLATFORM_SUPER_ADMIN_* en env de desarrollo');
  process.exit(1);
}

let emailHmac;
try {
  emailHmac = hmacEmail(email, loadPiiHashKeyFromEnv());
} catch (err) {
  console.error(`dev-reset-platform-admin: ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
}

const hashResult = spawnSync(
  process.execPath,
  [
    '-e',
    "const bcrypt=require('bcryptjs'); bcrypt.hash(process.argv[1],12).then(h=>process.stdout.write(h));",
    password,
  ],
  {
    cwd: join(root, 'apps', 'api'),
    encoding: 'utf8',
    shell: false,
  },
);

if (hashResult.status !== 0 || !hashResult.stdout?.trim()) {
  console.error(hashResult.stderr || 'No se pudo generar password_hash');
  process.exit(hashResult.status ?? 1);
}

const passwordHash = hashResult.stdout.trim();

const dbUser = process.env.DB_USER ?? 'iwana';
const dbName = process.env.DB_NAME ?? 'iwana_dev';
const container = process.env.IWANA_POSTGRES_CONTAINER ?? 'iwana-postgres';

// Se reactiva `password_reset_required`: tras el sync la cuenta vuelve a usar la
// credencial del entorno, que es conocida. El primer ingreso debe exigir cambio
// otra vez — igual que en el bootstrap inicial (MOD01 / primer ingreso).
const sql = `UPDATE public.platform_users SET password_hash = '${passwordHash.replace(/'/g, "''")}', password_reset_required = true WHERE email_hmac = '${emailHmac}';`;

// El SQL viaja por stdin, no como argumento `-c`.
//
// En Windows este spawn necesita `shell: true` para resolver `docker`, y el
// shell parte el argumento por espacios: psql recibía `UPDATE` como sentencia
// completa y el resto como argumentos sueltos ("syntax error at end of input").
// Por stdin no hay nada que citar, y de paso el hash no aparece en la línea de
// comandos —donde cualquier listado de procesos podría leerlo—.
const result = spawnSync(
  'docker',
  ['exec', '-i', container, 'psql', '-U', dbUser, '-d', dbName, '-v', 'ON_ERROR_STOP=1', '-f', '-'],
  { input: sql, encoding: 'utf8', shell: process.platform === 'win32' },
);

if (result.status !== 0) {
  console.error(result.stderr || result.stdout || 'docker exec falló');
  process.exit(result.status ?? 1);
}

console.log(
  JSON.stringify({
    ok: true,
    action: 'password_synced_change_required',
    emailHmacPrefix: emailHmac.slice(0, 12),
    rowsHint: (result.stdout ?? '').trim(),
  }),
);
