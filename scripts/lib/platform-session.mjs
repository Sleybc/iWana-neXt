/**
 * Acceso de plataforma para pruebas y scripts, con MFA (spec 2026-11-25 §5).
 *
 * Usa `fetch`, no el cliente de Playwright: ni la contraseña, ni el secreto, ni los códigos
 * quedan en trazas. Nunca imprime ninguno de los tres.
 */
import { createHmac } from 'node:crypto';

const STEP_SECONDS = 30;
const MAX_CODE_RETRIES = 2;
/** Por debajo de los 15 minutos del access token. */
const SESSION_REUSE_MS = 10 * 60 * 1000;

let lastStep = -1;
const sessions = new Map();

const currentStep = () => Math.floor(Date.now() / 1000 / STEP_SECONDS);

function decodeBase32(value) {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  const bytes = [];
  let bits = 0;
  let buffer = 0;
  for (const char of value.toUpperCase().replace(/=+$/u, '')) {
    const index = alphabet.indexOf(char);
    if (index < 0) throw new Error('El secreto TOTP no es base32.');
    buffer = ((buffer << 5) | index) & 0xfff;
    bits += 5;
    if (bits >= 8) {
      bits -= 8;
      bytes.push((buffer >> bits) & 0xff);
    }
  }
  return Buffer.from(bytes);
}

/** TOTP de RFC 6238: SHA-1, 30 s, seis dígitos. */
export function totpCode(secret, step) {
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(step));
  const digest = createHmac('sha1', decodeBase32(secret)).update(counter).digest();
  const offset = digest[digest.length - 1] & 0x0f;
  return String((digest.readUInt32BE(offset) & 0x7fffffff) % 1_000_000).padStart(6, '0');
}

/** Código de un paso que este proceso no ha usado: espera al siguiente si hace falta. */
export async function nextTotpCode(secret) {
  while (currentStep() <= lastStep) {
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  lastStep = currentStep();
  return totpCode(secret, lastStep);
}

async function post(url, body, token) {
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  });
  return { status: response.status, body: await response.json().catch(() => null) };
}

/**
 * Login de plataforma con código si la cuenta lo pide. Devuelve `data` tal cual, también con
 * `passwordResetRequired` o `mfaSetupRequired`.
 */
export async function loginPlatform({ apiUrl, email, password }) {
  const url = `${apiUrl}/auth/platform/login`;
  let result = await post(url, { email, password });
  if (result.status === 200 && result.body?.data?.mfaRequired) {
    const secret = process.env.E2E_PLATFORM_TOTP_SECRET;
    if (!secret) throw new Error('La cuenta de plataforma exige E2E_PLATFORM_TOTP_SECRET.');
    for (let retry = 0; retry <= MAX_CODE_RETRIES; retry += 1) {
      result = await post(url, { email, password, totpCode: await nextTotpCode(secret) });
      if (result.status !== 401 || result.body?.code === 'AUTH_ACCOUNT_LOCKED') break;
    }
  }
  if (result.status !== 200 || !result.body?.data?.accessToken) {
    throw new Error(`Login de plataforma HTTP ${result.status}.`);
  }
  return result.body.data;
}

/** Sesión completa, reutilizada dentro del proceso. No inscribe MFA. */
export async function platformAccessToken(credentials) {
  const key = `${credentials.apiUrl}|${credentials.email}`;
  const cached = sessions.get(key);
  if (cached && cached.expiresAt > Date.now()) return cached.token;
  const data = await loginPlatform(credentials);
  if (data.passwordResetRequired || data.mfaSetupRequired) {
    throw new Error('La cuenta de plataforma tiene pendiente su primer acceso o su MFA.');
  }
  sessions.set(key, { token: data.accessToken, expiresAt: Date.now() + SESSION_REUSE_MS });
  return data.accessToken;
}

/** Inscribe MFA con un token `platform-mfa-setup` y devuelve el secreto. */
export async function enrollPlatformMfa(apiUrl, setupToken, onSecret = () => {}) {
  const setup = await post(`${apiUrl}/auth/platform/mfa/setup`, {}, setupToken);
  const uri = setup.body?.data?.otpauthUri;
  const secret = uri ? new URL(uri).searchParams.get('secret') : null;
  if (!secret) throw new Error(`Inscripción de MFA HTTP ${setup.status}.`);
  // Antes de confirmar: si se pierde la respuesta, el secreto ya está guardado.
  onSecret(secret);
  const verify = await post(
    `${apiUrl}/auth/platform/mfa/verify`,
    { totpCode: await nextTotpCode(secret) },
    setupToken,
  );
  if (verify.status >= 300) throw new Error(`Confirmación de MFA HTTP ${verify.status}.`);
  return secret;
}
