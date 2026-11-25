import assert from 'node:assert/strict';
import { afterEach, beforeEach, test } from 'node:test';
import {
  enrollPlatformMfa,
  loginPlatform,
  platformAccessToken,
  totpCode,
} from './lib/platform-session.mjs';

// Semilla pública de RFC 6238, apéndice B.
const SECRET = 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ';
const credentials = { apiUrl: 'http://api.test', email: 'a@example.invalid', password: 'x' };
const originalFetch = globalThis.fetch;
const originalNow = Date.now;
let calls;

function reply(...responses) {
  calls = [];
  globalThis.fetch = async (url, init) => {
    calls.push({ url, body: JSON.parse(init.body) });
    const [status, body] = responses.shift();
    return { status, json: async () => body };
  };
}

beforeEach(() => {
  // Cada lectura del reloj avanza un paso: el helper nunca espera de verdad.
  let now = originalNow();
  Date.now = () => (now += 30_000);
  process.env.E2E_PLATFORM_TOTP_SECRET = SECRET;
});
afterEach(() => {
  globalThis.fetch = originalFetch;
  Date.now = originalNow;
  delete process.env.E2E_PLATFORM_TOTP_SECRET;
});

test('genera los códigos de RFC 6238', () => {
  assert.equal(totpCode(SECRET, Math.floor(59 / 30)), '287082');
  assert.equal(totpCode(SECRET, Math.floor(1111111109 / 30)), '081804');
  assert.equal(totpCode(SECRET, Math.floor(20000000000 / 30)), '353130');
});

test('sin MFA entra con una sola petición', async () => {
  reply([200, { data: { accessToken: 't' } }]);
  assert.equal((await loginPlatform(credentials)).accessToken, 't');
  assert.equal(calls.length, 1);
});

test('con MFA envía el código y no reintenta una cuenta bloqueada', async () => {
  reply(
    [200, { data: { accessToken: '', mfaRequired: true } }],
    [401, { code: 'AUTH_ACCOUNT_LOCKED' }],
  );
  await assert.rejects(loginPlatform(credentials), /HTTP 401/u);
  assert.match(calls[1].body.totpCode, /^\d{6}$/u);
  assert.equal(calls.length, 2);
});

test('tras un 401 espera y usa otro código', async () => {
  reply(
    [200, { data: { accessToken: '', mfaRequired: true } }],
    [401, {}],
    [200, { data: { accessToken: 't' } }],
  );
  await loginPlatform(credentials);
  assert.notEqual(calls[1].body.totpCode, calls[2].body.totpCode);
});

test('reutiliza la sesión y no inscribe', async () => {
  reply([200, { data: { accessToken: 't' } }]);
  assert.equal(await platformAccessToken(credentials), 't');
  assert.equal(await platformAccessToken(credentials), 't');
  assert.equal(calls.length, 1);
  reply([200, { data: { accessToken: 's', mfaSetupRequired: true } }]);
  await assert.rejects(platformAccessToken({ ...credentials, email: 'b@example.invalid' }), /MFA/u);
  assert.equal(calls.length, 1);
});

test('inscribe y devuelve el secreto', async () => {
  reply([200, { data: { otpauthUri: `otpauth://totp/x?secret=${SECRET}` } }], [204, null]);
  assert.equal(await enrollPlatformMfa('http://api.test', 't'), SECRET);
});
