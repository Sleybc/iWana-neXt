import assert from 'node:assert/strict';
import test from 'node:test';

import { readCredential } from './postgres-dev.mjs';

// Marcador ficticio: no es ni ha sido una credencial real.
const PLACEHOLDER = 'placeholder-not-a-secret';

function uri({
  protocol = 'postgresql',
  user = 'iwana_readonly',
  password = PLACEHOLDER,
  host = '127.0.0.1',
  port = '5432',
  database = 'dbiw',
} = {}) {
  const auth = password ? `${user}:${password}` : user;
  const portPart = port ? `:${port}` : '';
  return `${protocol}://${auth}@${host}${portPart}/${database}`;
}

function envFile(value) {
  return [
    '# credencial local del MCP',
    'OTRA_VARIABLE=1',
    `IWANA_MCP_DATABASE_URI=${value}`,
    '',
  ].join('\n');
}

const ROLE_ERROR = /no corresponde al rol de lectura local/u;

test('readCredential: acepta la URI del rol de lectura local y la devuelve intacta', () => {
  const value = uri();
  assert.equal(readCredential(envFile(value)), value);
});

test('readCredential: tolera CRLF y espacios alrededor de la entrada', () => {
  const value = uri();
  assert.equal(readCredential(`OTRA=1\r\n  IWANA_MCP_DATABASE_URI= ${value}  \r\n`), value);
});

test('readCredential: rechaza un rol distinto de iwana_readonly', () => {
  assert.throws(() => readCredential(envFile(uri({ user: 'iwana_app' }))), ROLE_ERROR);
});

test('readCredential: rechaza un host distinto de 127.0.0.1', () => {
  for (const host of ['localhost', 'db.example.test', '10.0.0.5']) {
    assert.throws(() => readCredential(envFile(uri({ host }))), ROLE_ERROR, host);
  }
});

test('readCredential: rechaza un puerto distinto de 5432 o ausente', () => {
  assert.throws(() => readCredential(envFile(uri({ port: '5433' }))), ROLE_ERROR);
  assert.throws(() => readCredential(envFile(uri({ port: '' }))), ROLE_ERROR);
});

test('readCredential: rechaza una URI sin contraseña', () => {
  assert.throws(() => readCredential(envFile(uri({ password: '' }))), ROLE_ERROR);
});

test('readCredential: rechaza una URI sin base de datos', () => {
  assert.throws(() => readCredential(envFile(uri({ database: '' }))), ROLE_ERROR);
});

test('readCredential: rechaza un protocolo distinto de postgresql:', () => {
  assert.throws(() => readCredential(envFile(uri({ protocol: 'postgres' }))), ROLE_ERROR);
  assert.throws(() => readCredential(envFile(uri({ protocol: 'mysql' }))), ROLE_ERROR);
});

test('readCredential: rechaza una URI mal formada sin repetir su contenido', () => {
  const malformed = `no-es-una-uri ${PLACEHOLDER}`;
  assert.throws(
    () => readCredential(envFile(malformed)),
    (error) => {
      assert.match(error.message, /no es una URI PostgreSQL válida/u);
      assert.ok(!error.message.includes(PLACEHOLDER));
      return true;
    },
  );
});

test('readCredential: rechaza la variable ausente o vacía', () => {
  assert.throws(() => readCredential('OTRA_VARIABLE=1\n'), /Falta IWANA_MCP_DATABASE_URI/u);
  assert.throws(() => readCredential(''), /Falta IWANA_MCP_DATABASE_URI/u);
  assert.throws(
    () => readCredential('IWANA_MCP_DATABASE_URI=   \n'),
    /Falta IWANA_MCP_DATABASE_URI/u,
  );
});

test('readCredential: ningún error expone la contraseña', () => {
  const cases = [uri({ user: 'iwana_app' }), uri({ host: 'localhost' }), uri({ database: '' })];
  for (const value of cases) {
    assert.throws(
      () => readCredential(envFile(value)),
      (error) => !error.message.includes(PLACEHOLDER),
    );
  }
});
