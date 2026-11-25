#!/usr/bin/env node
/**
 * Inscribe MFA en la cuenta de pruebas de plataforma, una sola vez (spec 2026-11-25 §5).
 * Escribe E2E_PLATFORM_TOTP_SECRET en el archivo indicado (0600, sin sobrescribir).
 *
 * Uso: node scripts/e2e-enroll-platform-mfa.mjs <archivo fuera de git>
 */
import { closeSync, openSync, unlinkSync, writeFileSync } from 'node:fs';
import process from 'node:process';
import { enrollPlatformMfa, loginPlatform } from './lib/platform-session.mjs';

const output = process.argv[2];
const email = process.env.E2E_PLATFORM_EMAIL;
const password = process.env.E2E_PLATFORM_PASSWORD;
const apiUrl = `${process.env.API_BASE_URL ?? 'http://127.0.0.1:3000'}/api/v1`;
if (!output || !email || !password) {
  console.error('Uso: E2E_PLATFORM_EMAIL y E2E_PLATFORM_PASSWORD + ruta del archivo de salida.');
  process.exit(1);
}

// Se abre antes de inscribir. Con el secreto ya escrito nunca se borra: puede estar activo.
const file = openSync(output, 'wx', 0o600);
let saved = false;
try {
  const data = await loginPlatform({ apiUrl, email, password });
  if (!data.mfaSetupRequired) {
    throw new Error('La cuenta no tiene una inscripción de MFA pendiente.');
  }
  await enrollPlatformMfa(apiUrl, data.accessToken, (secret) => {
    writeFileSync(file, `E2E_PLATFORM_TOTP_SECRET=${secret}\n`);
    saved = true;
  });
  console.log('MFA inscrito.');
} catch (error) {
  if (!saved) unlinkSync(output);
  console.error(error instanceof Error ? error.message : 'No se pudo inscribir.');
  if (saved) console.error('El secreto quedó en el archivo: comprueba si ya está activo.');
  process.exitCode = 1;
} finally {
  closeSync(file);
}
