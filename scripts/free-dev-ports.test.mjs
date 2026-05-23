import assert from 'node:assert/strict';
import test from 'node:test';
import { findRepoWatcherPids, getProtectedPids } from './free-dev-ports.mjs';

test('getProtectedPids protege el proceso actual y toda su cadena de ancestros', () => {
  const entries = [
    { pid: 10, ppid: 1, command: 'bash' },
    { pid: 20, ppid: 10, command: 'pnpm dev' },
    { pid: 30, ppid: 20, command: 'node scripts/dev.mjs' },
    { pid: 40, ppid: 30, command: 'node scripts/free-dev-ports.mjs' },
    { pid: 50, ppid: 1, command: 'orphan watcher' },
  ];

  const protectedPids = getProtectedPids(entries, 40, 30);

  assert.deepEqual(
    [...protectedPids].sort((left, right) => left - right),
    [1, 10, 20, 30, 40],
  );
});

test('findRepoWatcherPids conserva watchers residuales fuera del arbol protegido', () => {
  const entries = [
    { pid: 20, ppid: 10, command: 'pnpm dev' },
    { pid: 30, ppid: 20, command: 'node scripts/dev.mjs' },
    {
      pid: 60,
      ppid: 1,
      command:
        '/home/sley/Documentos/appiw/apps/api/node_modules/.bin/../@nestjs/cli/bin/nest.js start --watch',
    },
    {
      pid: 70,
      ppid: 1,
      command: '/home/sley/.local/share/pnpm/pnpm --filter @iwana/api dev',
    },
    { pid: 80, ppid: 1, command: 'node unrelated-script.mjs' },
  ];
  const protectedPids = new Set([20, 30]);
  const markers = [
    { path: '/home/sley/Documentos/appiw/apps/api/', command: 'nest.js start --watch' },
    { command: 'node scripts/dev.mjs' },
    { command: '--filter @iwana/api dev' },
  ];

  const detectedPids = findRepoWatcherPids(entries, protectedPids, markers);

  assert.deepEqual(
    detectedPids.sort((left, right) => left - right),
    [60, 70],
  );
});
