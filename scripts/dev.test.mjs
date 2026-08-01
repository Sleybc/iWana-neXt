import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import test from 'node:test';

import {
  buildMissingDevEnvMessage,
  devComposeFiles,
  findMissingDevEnvVars,
  parseEnvFile,
  requiredDevEnvVars,
  resolvePnpmTarget,
  waitForApiHealth,
  waitForCompilation,
} from './dev.mjs';

function withNpmExecPath(npmExecPath, callback) {
  const original = process.env.npm_execpath;
  process.env.npm_execpath = npmExecPath;

  try {
    return callback();
  } finally {
    if (original === undefined) {
      delete process.env.npm_execpath;
    } else {
      process.env.npm_execpath = original;
    }
  }
}

test('resolvePnpmTarget keeps Windows pnpm.cmd launches on the shell path', () => {
  withNpmExecPath('C:\\Users\\SLEYB\\AppData\\Roaming\\npm\\pnpm.cmd', () => {
    const target = resolvePnpmTarget(['dev:free-ports']);

    assert.equal(target.command, process.env.ComSpec ?? 'cmd.exe');
    assert.deepEqual(target.args, [
      '/d',
      '/s',
      '/c',
      'C:\\Users\\SLEYB\\AppData\\Roaming\\npm\\pnpm.cmd dev:free-ports',
    ]);
  });
});

test('resolvePnpmTarget executes pnpm.cjs through the current Node runtime', () => {
  withNpmExecPath('C:\\corepack\\pnpm.cjs', () => {
    const target = resolvePnpmTarget(['dev:free-ports']);

    assert.equal(target.command, process.execPath);
    assert.deepEqual(target.args, ['C:\\corepack\\pnpm.cjs', 'dev:free-ports']);
  });
});

test('waitForCompilation rejects initial compilations with TypeScript errors', async () => {
  const child = new EventEmitter();
  child.stdout = new EventEmitter();
  child.stderr = new EventEmitter();

  const result = waitForCompilation(child, null, { timeoutMs: 1000 });
  child.stdout.emit('data', '[7:17:20 a. m.] Found 3 errors. Watching for file changes.');

  await assert.rejects(result, /API compilation failed with 3 errors/);
});

test('waitForCompilation detects compilation errors split across chunks', async () => {
  const child = new EventEmitter();
  child.stdout = new EventEmitter();
  child.stderr = new EventEmitter();

  const result = waitForCompilation(child, null, { timeoutMs: 1000 });
  child.stdout.emit('data', '[7:17:20 a. m.] Fo');
  child.stdout.emit('data', 'und 2 errors. Watching for file changes.');

  await assert.rejects(result, /API compilation failed with 2 errors/);
});

test('waitForApiHealth reports the last connection failure after its deadline', async () => {
  const child = new EventEmitter();
  child.stdout = new EventEmitter();
  child.stderr = new EventEmitter();
  child.exitCode = null;
  child.signalCode = null;
  const originalFetch = globalThis.fetch;

  globalThis.fetch = async () => {
    throw new Error('connect ECONNREFUSED');
  };

  try {
    const result = waitForApiHealth(null, child, {
      deadlineMs: 20,
      perAttemptTimeoutMs: 10,
      retryDelayMs: 1,
    });
    child.stdout.emit('data', 'Found 0 errors. Watching for file changes.');

    await assert.rejects(result, /Ultimo resultado: Error: connect ECONNREFUSED/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('devComposeFiles carga el overlay de desarrollo despues del archivo base', () => {
  assert.deepEqual(devComposeFiles, ['docker-compose.yml', 'docker-compose.dev.yml']);
});

test('parseEnvFile ignora comentarios y desenvuelve valores entrecomillados', () => {
  const values = parseEnvFile(
    [
      '# comentario',
      '',
      'NGINX_IMAGE=nginx:1.31.2-alpine',
      "DB_APP_USER='iwana_app'",
      'SIN_IGUAL',
    ].join('\n'),
  );

  assert.equal(values.get('NGINX_IMAGE'), 'nginx:1.31.2-alpine');
  assert.equal(values.get('DB_APP_USER'), 'iwana_app');
  assert.equal(values.has('SIN_IGUAL'), false);
});

test('findMissingDevEnvVars trata el valor vacio como ausente, igual que ${VAR:?}', () => {
  const missing = findMissingDevEnvVars(new Map([['NGINX_IMAGE', '   ']]), {}, ['NGINX_IMAGE']);

  assert.deepEqual(missing, ['NGINX_IMAGE']);
});

test('findMissingDevEnvVars da precedencia al entorno del shell sobre .env', () => {
  const missing = findMissingDevEnvVars(new Map(), { NGINX_IMAGE: 'nginx:1.31.2-alpine' }, [
    'NGINX_IMAGE',
  ]);

  assert.deepEqual(missing, []);
});

test('requiredDevEnvVars cubre las variables sin default de docker-compose.yml', () => {
  for (const name of [
    'DB_BOOTSTRAP_USER',
    'DB_PASSWORD',
    'DB_APP_USER',
    'DB_APP_PASSWORD',
    'DB_MIGRATOR_USER',
    'DB_MIGRATOR_PASSWORD',
    'MINIO_ROOT_USER',
    'MINIO_ROOT_PASSWORD',
    'TYPESENSE_API_KEY',
    'PGBOUNCER_IMAGE',
    'MINIO_IMAGE',
    'MINIO_MC_IMAGE',
    'NGINX_IMAGE',
    'ADMINER_IMAGE',
  ]) {
    assert.ok(requiredDevEnvVars.includes(name), `falta ${name} en requiredDevEnvVars`);
  }
});

test('buildMissingDevEnvMessage nombra la variable, el archivo y la referencia', () => {
  const message = buildMissingDevEnvMessage(['DB_BOOTSTRAP_USER'], '.env');

  assert.match(message, /DB_BOOTSTRAP_USER/);
  assert.match(message, /\.env/);
  assert.match(message, /\.env\.example/);
});

test('waitForApiHealth starts its deadline after compilation completes', async () => {
  const child = new EventEmitter();
  child.stdout = new EventEmitter();
  child.stderr = new EventEmitter();
  child.exitCode = null;
  child.signalCode = null;

  const result = waitForApiHealth(null, child, {
    deadlineMs: 25,
    perAttemptTimeoutMs: 10,
    retryDelayMs: 1,
    fetchImpl: async () => ({ ok: true, status: 200, statusText: 'OK' }),
  });

  setTimeout(() => {
    child.stdout.emit('data', 'Found 0 errors. Watching for file changes.');
  }, 20);

  await result;
});
