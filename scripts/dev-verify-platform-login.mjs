#!/usr/bin/env node
/**
 * Verificación local de login plataforma (dev). Lee .env.development sin imprimir secretos.
 *
 * SEC-P1: el prefijo de diagnóstico usa HMAC-SHA-256 + PII_HASH_KEY (email_hmac), no SHA-256.
 */
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
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

loadEnv('.env.development');
loadEnv('.env.development.local');

const email = process.env.PLATFORM_SUPER_ADMIN_EMAIL?.trim();
const password = process.env.PLATFORM_SUPER_ADMIN_PASSWORD?.trim();
const apiBase = (process.env.API_PUBLIC_BASE_URL ?? 'http://localhost:3000').replace(/\/$/, '');

if (!email || !password) {
  console.error('verify-platform-login: faltan PLATFORM_SUPER_ADMIN_* en .env.development');
  process.exit(1);
}

let emailHmac;
try {
  emailHmac = hmacEmail(email, loadPiiHashKeyFromEnv());
} catch (err) {
  console.error(`verify-platform-login: ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
}

const res = await fetch(`${apiBase}/api/v1/auth/platform/login`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ email, password }),
});

const body = await res.text();

console.log(
  JSON.stringify({
    status: res.status,
    emailHmacPrefix: emailHmac.slice(0, 12),
    ok: res.ok,
    hasAccessToken: body.includes('accessToken'),
    bodyPreview: body.slice(0, 120),
  }),
);

process.exit(res.ok ? 0 : 1);
