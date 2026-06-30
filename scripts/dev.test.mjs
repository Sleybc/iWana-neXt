import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import test from 'node:test';

import { resolvePnpmTarget, waitForApiHealth, waitForCompilation } from './dev.mjs';

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
