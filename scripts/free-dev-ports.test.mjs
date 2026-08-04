import assert from 'node:assert/strict';
import test from 'node:test';
import { findRepoWatcherPids, getProtectedPids, partitionPortPids } from './free-dev-ports.mjs';

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

test('findRepoWatcherPids detecta watchers de Windows con rutas en backslash', () => {
  const entries = [
    {
      pid: 90,
      ppid: 1,
      command:
        'C:\\appiw\\apps\\api\\node_modules\\.bin\\..\\@nestjs\\cli\\bin\\nest.js start --watch',
    },
    {
      pid: 91,
      ppid: 1,
      command: 'C:\\Users\\SLEYB\\AppData\\Roaming\\pnpm\\pnpm.CMD --filter @iwana/web dev',
    },
    { pid: 92, ppid: 1, command: 'node unrelated-script.mjs' },
  ];
  const protectedPids = new Set();
  const markers = [
    { path: 'C:/appiw/apps/api/', command: 'nest.js start --watch' },
    { command: '--filter @iwana/web dev' },
  ];

  const detectedPids = findRepoWatcherPids(entries, protectedPids, markers);

  assert.deepEqual(
    detectedPids.sort((left, right) => left - right),
    [90, 91],
  );
});

const repoRoot = 'C:/appiw';

test('partitionPortPids no mata un proceso ajeno que ocupa un puerto de desarrollo', () => {
  const entries = [
    { pid: 700, ppid: 1, command: 'C:/otro-proyecto/node_modules/.bin/vite --port 3000' },
  ];

  const { owned, foreign } = partitionPortPids([700], entries, { root: repoRoot });

  assert.deepEqual(owned, []);
  assert.equal(foreign.length, 1);
  assert.equal(foreign[0].pid, 700);
  assert.match(foreign[0].command, /otro-proyecto/);
});

test('partitionPortPids reconoce como propio un proceso lanzado desde la raiz del repo', () => {
  const entries = [
    {
      pid: 800,
      ppid: 1,
      command: 'node C:/appiw/node_modules/.pnpm/next/bin/next dev --port 3001',
    },
  ];

  const { owned, foreign } = partitionPortPids([800], entries, { root: repoRoot });

  assert.deepEqual(owned, [800]);
  assert.deepEqual(foreign, []);
});

test('partitionPortPids reconoce como propio un proceso que coincide con un marcador', () => {
  const entries = [{ pid: 900, ppid: 1, command: 'pnpm --filter @iwana/api dev' }];

  const { owned } = partitionPortPids([900], entries, {
    root: repoRoot,
    markers: [{ command: '--filter @iwana/api dev' }],
  });

  assert.deepEqual(owned, [900]);
});

test('partitionPortPids trata como ajeno un PID ausente de la tabla de procesos', () => {
  const { owned, foreign } = partitionPortPids([1234], [], { root: repoRoot });

  assert.deepEqual(owned, []);
  assert.deepEqual(foreign, [{ pid: 1234, command: null }]);
});
